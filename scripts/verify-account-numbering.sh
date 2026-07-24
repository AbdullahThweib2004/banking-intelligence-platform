#!/usr/bin/env bash
# Verifies the bank_customers / unemployed_customers account-number
# generation logic in a fully throwaway Docker Postgres container — never
# touches the real Supabase project.
#
# Written after an incident report of a customer getting account number
# BOP-200018 instead of the expected BOP-100011+. Investigation found the
# generation logic itself was never at fault: BOP-200018 is a known
# out-of-family stray row (see 20260711120000_fix_bank_customers_account_sequence.sql,
# which already documents a near-identical BOP-200013 incident) that predates
# this feature; findOrCreateBankCustomerFromAccountOpening() looks up an
# existing customer by national_id BEFORE ever generating a number, so an
# account with a matching national_id is correctly REUSED, never
# regenerated — no new number is produced in that path at all.
#
# This script proves the actual number-generation path is correct even in
# the presence of a stray BOP-2xxxxx row, and stays correct under
# concurrency, and that the unemployed-customer sequence (BOP-1, BOP-2, ...)
# is completely independent of it.
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

echo "Setting up Supabase-shaped scaffolding (roles, auth.jwt() stub, default grants, dummy realtime publication)..."
psql -c "
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role;
CREATE SCHEMA auth;
CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS \$\$ SELECT current_setting('request.jwt.claims', true)::jsonb; \$\$;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
" >/dev/null

echo "Applying migration chain..."
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

echo
echo "=== Scenario: stray out-of-family row present (reproduces the BOP-200018 report) ==="
psql -c "
INSERT INTO bank_customers (account_number, customer_name, national_id, employment_type, loan_purpose)
VALUES ('BOP-200018', 'Ahmed Al-Mansour', '999888777001', 'unknown', 'unknown');
" >/dev/null
# Re-run the fast-forward fix with the stray row already present, proving
# it can never poison the computation regardless of when it was inserted.
psql -f "/tmp/20260711120000_fix_bank_customers_account_sequence.sql" >/dev/null

first=$(psql_q "
INSERT INTO bank_customers (customer_name, national_id, employment_type, loan_purpose)
VALUES ('Test Employed One', '111222333001', 'employed', 'personal')
RETURNING account_number;
")
check "first new employed customer after the stray row" "BOP-100011" "$first"

second=$(psql_q "
INSERT INTO bank_customers (customer_name, national_id, employment_type, loan_purpose)
VALUES ('Test Employed Two', '111222333002', 'employed', 'personal')
RETURNING account_number;
")
check "next employed customer" "BOP-100012" "$second"

echo
echo "=== Scenario: concurrent inserts produce no duplicates or skips ==="
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
echo "=== Scenario: unemployed-customer sequence is fully independent ==="
u1=$(psql_q "INSERT INTO unemployed_customers (customer_name, national_id) VALUES ('Unemployed One', '777000000001') RETURNING account_number;")
check "first unemployed customer" "BOP-1" "$u1"
u2=$(psql_q "INSERT INTO unemployed_customers (customer_name, national_id) VALUES ('Unemployed Two', '777000000002') RETURNING account_number;")
check "second unemployed customer" "BOP-2" "$u2"

after=$(psql_q "
INSERT INTO bank_customers (customer_name, national_id, employment_type, loan_purpose)
VALUES ('Test Employed After Unemployed Inserts', '111222333999', 'employed', 'personal')
RETURNING account_number;
")
check "employed sequence unaffected by unemployed inserts (next expected value)" "BOP-100023" "$after"

echo
if [[ $failures -eq 0 ]]; then
  echo "ALL CHECKS PASSED"
  exit 0
else
  echo "${failures} CHECK(S) FAILED"
  exit 1
fi
