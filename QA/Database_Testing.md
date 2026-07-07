# Database Testing Report

**Date:** 2026-07-06  
**Platform:** Supabase (PostgreSQL)  
**Migrations reviewed:** 19 files in `supabase/migrations/`

## Schema entities (core)

| Table | Purpose | FK relationships | Status |
|-------|---------|------------------|--------|
| profiles | User role + metadata | auth.users | Reviewed |
| approval_requests | Credit applications | employee_id → profiles | Reviewed |
| loan_modification_requests | Objections | approval_request_id | Reviewed |
| documents | Document metadata | user_id, storage path | Reviewed |
| audit_logs | Immutable audit trail | user_id | Reviewed |
| bank_customers | Demo customer seed | — | Reviewed |
| ai_chat_sessions / messages | AI history | user_id | Reviewed |
| policy_chunks | RAG embeddings | — | Reviewed |

## RLS policy verification (static)

| Table | Policy summary | Expected | Status |
|-------|----------------|----------|--------|
| approval_requests | Employee SELECT own; risk UPDATE | Per SRS | **PASS** |
| audit_logs | SELECT risk only; INSERT via trigger | Append-only | **PASS** |
| documents | SELECT all branch roles; DELETE own/all by role | Per migration | **PASS** |
| profiles | SELECT own; manager admin policies | Per migration | **PASS** |
| loan_modification_requests | Role-scoped SELECT/INSERT | Per migration | **PASS** |

## Triggers and functions

| Object | Purpose | Status |
|--------|---------|--------|
| `get_platform_stats()` | Dashboard aggregates | Static **PASS** |
| Audit log trigger on approval_requests | Auto-log status changes | Static **PASS** |
| Profile creation on signup | Auto-insert profiles row | Static **PASS** |
| `handle_updated_at` | Timestamp maintenance | Static **PASS** |

## Data integrity checks (design level)

| Check | Finding | Status |
|-------|---------|--------|
| Orphan approval_requests | employee_id FK to profiles | **PASS** design |
| Duplicate customer accounts | BOP-100001–010 unique in seed | **PASS** seed |
| Null handling on required fields | NOT NULL on key columns | **PASS** migration |
| Uniqueness on email (profiles) | auth.users enforces | **PASS** |
| Cascade delete documents storage | Storage + DB sync in hook | Partial — live test blocked |

## Seed data (PRB-027)

| Account | Purpose | loan_restricted |
|---------|---------|-----------------|
| BOP-100001 | Standard demo | false |
| BOP-100004 | Restricted customer test | true |

Static: seed migration present. Live verification **BLOCKED**.

## Duplicate data risks

| Risk | Mitigation | Status |
|------|------------|--------|
| Double approval_requests for same assessment | No unique constraint on customer+timestamp | **GAP** — low demo risk |
| Duplicate document uploads | No dedup hash | **GAP** |
| Stale JWT role vs profiles.role | BUG-002 | **FAIL** |

## Tests not executed

- Live INSERT/UPDATE/DELETE with each role
- FK violation attempts
- Concurrent update on approval_requests
- Storage orphan cleanup after failed upload

## Conclusion

Database design and RLS policies **align with SRS** for graduation scope. Live integrity testing **BLOCKED** without Supabase credentials.
