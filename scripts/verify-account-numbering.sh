#!/usr/bin/env bash
# Verifies the bank_customers / unemployed_customers account-number
# generation logic in a fully throwaway Docker Postgres container — never
# touches the real Supabase project.
#
# Written after two incident reports:
#   1. A customer got account number BOP-200018 instead of BOP-100011+.
#      Investigation found the generation logic itself was never at fault:
#      BOP-200018 is a known out-of-family stray row (see
#      20260711120000_fix_bank_customers_account_sequence.sql, which already
#      documents a near-identical BOP-200013 incident) that predates this
#      feature; findOrCreateBankCustomerFromAccountOpening() looks up an
#      existing customer by national_id BEFORE ever generating a number, so
#      an account with a matching national_id is correctly REUSED, never
#      regenerated — no new number is produced in that path at all.
#   2. The stray BOP-200018 row was deleted, and the VERY NEXT account
#      created still got BOP-200019. Root cause: deleting a table ROW never
#      rewinds a Postgres SEQUENCE — they are separate objects. The
#      sequence's internal counter was left sitting at 200018 (most likely
#      because 20260711120000's fix had never actually been applied live),
#      so it kept incrementing from there regardless of what existed in the
#      table. Fixed by
#      20260724100000_fix_and_guard_bank_customers_account_sequence.sql,
#      which force-resets the sequence AND adds a permanent CHECK constraint
#      so no out-of-family account_number can ever be inserted again.
#
# Usage:
#   ./scripts/verify-account-numbering.sh
#
# Requires: docker, psql available via `docker exec`.

set -euo pipefail

CONTAINER=verify_account_numbering_$$
MIGRATIONS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/supabase/migrations"
failures=0

cleanup() {
  docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
}
trap cleanup EXIT

check() {
  local label="$1" expected="$2" actual="$3"
  if [[ "$actual" == "$expected" ]]; then
    echo "  PASS: ${label} -> ${actual}"
  else
    echo "  FAIL: ${label} -> got '${actual}', expected '${expected}'"
    failures=$((failures + 1))
  fi
}

check_rejected() {
  local label="$1" output="$2"
  if echo "$output" | grep -q "violates check constraint"; then
    echo "  PASS: ${label} (correctly rejected)"
  else
    echo "  FAIL: ${label} -> expected a check-constraint rejection, got: ${output}"
    failures=$((failures + 1))
  fi
}

echo "Starting throwaway Postgres container (${CONTAINER})..."
docker run --name "$CONTAINER" -e POSTGRES_PASSWORD=postgres -d postgres:15 >/dev/null
for _ in $(seq 1 30); do
  docker exec "$CONTAINER" pg_isready -U postgres >/dev/null 2>&1 && break
  sleep 1
done

psql() { docker exec -u postgres "$CONTAINER" psql -v ON_ERROR_STOP=1 "$@"; }
# -t/-A alone don't suppress the "INSERT 0 1" command-status line for a
# RETURNING statement — only the actual returned value is wanted, and it's
# always the first line.
psql_q() { docker exec -u postgres "$CONTAINER" psql -t -A -v ON_ERROR_STOP=1 -c "$1" | head -1; }
next_employed() {
  # Inserts a genuinely new employed customer (unique national_id) and
  # returns the account number it was assigned.
  psql_q "
    INSERT INTO bank_customers (customer_name, national_id, employment_type, loan_purpose)
    VALUES ('Auto Test Customer', '${1}', 'employed', 'personal')
    RETURNING account_number;
  "
}
seq_value() { psql_q "SELECT last_value FROM bank_customers_account_number_seq;"; }
next_expected_after() {
  # Given the sequence's current last_value, computes the account number
  # the NEXT insert should get.
  printf 'BOP-%d\n' "$(( $(seq_value) + 1 ))"
}

echo "Setting up Supabase-shaped scaffolding (roles, auth.jwt() stub, default grants, dummy realtime publication)..."
psql -c "
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role;
CREATE SCHEMA auth;
CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS \$\$ SELECT current_setting('request.jwt.claims', true)::jsonb; \$\$;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
" >/dev/null

echo "Applying migration chain (up to, but not including, the newest fix — applied later, matching real deployment order onto a DB that may already have historical issues)..."
for f in \
  20260621100000_bank_customers.sql \
  20260622130000_bank_customers_loan_restricted.sql \
  20260711100000_bank_customers_account_sequence.sql \
  20260711120000_fix_bank_customers_account_sequence.sql \
  20260716100000_input_validation_guardrails.sql \
  20260716110000_bank_customers_financial_profile_source.sql \
  20260722100000_bank_customers_financial_profile_update_policy.sql \
  20260723100000_unemployed_customers_and_employed_profile_fields.sql \
; do
  docker cp "${MIGRATIONS_DIR}/${f}" "${CONTAINER}:/tmp/${f}"
  if [[ "$f" == "20260711100000_bank_customers_account_sequence.sql" ]]; then
    # Needs a real (non-system-table) publication to exist first — matches
    # the real Supabase project, which always has one.
    psql -c "CREATE PUBLICATION supabase_realtime FOR TABLE public.bank_customers;" >/dev/null
  fi
  psql -f "/tmp/${f}" >/dev/null
done
docker cp "${MIGRATIONS_DIR}/20260724100000_fix_and_guard_bank_customers_account_sequence.sql" \
  "${CONTAINER}:/tmp/20260724100000_fix_and_guard_bank_customers_account_sequence.sql"

echo
echo "=== Scenario 1: stray out-of-family row present (reproduces the BOP-200018 report) ==="
psql -c "
INSERT INTO bank_customers (account_number, customer_name, national_id, employment_type, loan_purpose)
VALUES ('BOP-200018', 'Ahmed Al-Mansour', '999888777001', 'unknown', 'unknown');
" >/dev/null
# Re-run the fast-forward fix with the stray row already present, proving
# it can never poison the computation regardless of when it was inserted.
psql -f "/tmp/20260711120000_fix_bank_customers_account_sequence.sql" >/dev/null

check "first new employed customer after the stray row" "BOP-100011" "$(next_employed 111222333001)"
check "next employed customer" "BOP-100012" "$(next_employed 111222333002)"

echo
echo "=== Scenario 2: sequence itself is poisoned into the 200000s, then the stray row is deleted (reproduces 'deleted BOP-200018, still got BOP-200019') ==="
psql -c "SELECT setval('bank_customers_account_number_seq', 200018, true);" >/dev/null
psql -c "DELETE FROM bank_customers WHERE account_number = 'BOP-200018';" >/dev/null
echo "  (sequence is now poisoned at 200018; deleting the row does NOT fix it — that's the bug)"
echo "  Applying 20260724100000_fix_and_guard_bank_customers_account_sequence.sql..."
psql -f "/tmp/20260724100000_fix_and_guard_bank_customers_account_sequence.sql" >/dev/null

check "first employed customer after the fix" "BOP-100013" "$(next_employed 222000222000)"
check "next employed customer" "BOP-100014" "$(next_employed 333000333000)"

echo
echo "=== Scenario 3: the guardrail rejects any future out-of-family account number ==="
bad_insert_output=$(docker exec -u postgres "$CONTAINER" psql -c "
  INSERT INTO bank_customers (account_number, customer_name, national_id, employment_type, loan_purpose)
  VALUES ('BOP-999999', 'Guardrail Test', '000000000000', 'employed', 'personal');
" 2>&1 || true)
check_rejected "explicit out-of-family account number (BOP-999999)" "$bad_insert_output"
check "valid explicit family value still allowed (BOP-100050)" "BOP-100050" "$(psql_q "
  INSERT INTO bank_customers (account_number, customer_name, national_id, employment_type, loan_purpose)
  VALUES ('BOP-100050', 'Valid Explicit Number', '444000444000', 'employed', 'personal')
  RETURNING account_number;
")"

echo
echo "=== Scenario 4: fix migration is idempotent (safe to re-run) ==="
psql -f "/tmp/20260724100000_fix_and_guard_bank_customers_account_sequence.sql" >/dev/null
check "sequence correctly re-synced after re-running the fix" "100050" "$(seq_value)"

echo
echo "=== Scenario 5: concurrent inserts produce no duplicates or skips ==="
for i in $(seq 1 10); do
  docker exec -u postgres "$CONTAINER" psql -t -A -v ON_ERROR_STOP=1 -c "
    INSERT INTO bank_customers (customer_name, national_id, employment_type, loan_purpose)
    VALUES ('Concurrent Test $i', '5550000${i}00', 'employed', 'personal')
    RETURNING account_number;
  " >/tmp/verify_concurrent_$i.log 2>&1 &
done
wait
dupes=$(psql_q "SELECT COUNT(*) FROM (SELECT account_number FROM bank_customers GROUP BY account_number HAVING COUNT(*) > 1) t;")
check "duplicate account numbers after 10 concurrent inserts" "0" "$dupes"
rm -f /tmp/verify_concurrent_*.log

echo
echo "=== Scenario 6: unemployed-customer sequence is fully independent ==="
u1=$(psql_q "INSERT INTO unemployed_customers (customer_name, national_id) VALUES ('Unemployed One', '777000000001') RETURNING account_number;")
check "first unemployed customer" "BOP-1" "$u1"
u2=$(psql_q "INSERT INTO unemployed_customers (customer_name, national_id) VALUES ('Unemployed Two', '777000000002') RETURNING account_number;")
check "second unemployed customer" "BOP-2" "$u2"

expected_next=$(next_expected_after)
after=$(next_employed 111222333999)
check "employed sequence unaffected by unemployed inserts" "$expected_next" "$after"

echo
if [[ $failures -eq 0 ]]; then
  echo "ALL CHECKS PASSED"
  exit 0
else
  echo "${failures} CHECK(S) FAILED"
  exit 1
fi
