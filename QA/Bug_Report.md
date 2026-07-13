# Bug Report

**Document ID:** QA-BUG-001
**Date (rebased):** 2026-07-13 — see `Change_Impact_Assessment.md` for context. BUG-001–012 carried forward from the 2026-07-06 baseline (statuses re-verified against current code where noted); BUG-013–014 are new this rebase.

| Bug ID | Title | Severity | Priority | Area | Status |
|--------|-------|----------|----------|------|--------|
| BUG-001 | FastAPI trusts client-supplied X-User-Role header | Critical | P0 | Security / API | Open |
| BUG-002 | JWT user_metadata.role may desync from profiles.role | High | P1 | Auth / RBAC | Open |
| BUG-003 | Dashboard module cards show hardcoded KPIs | Medium | P2 | Dashboard | Open |
| BUG-004 | Debug console.log in production stats hook | Low | P3 | Dashboard | Open |
| BUG-005 | No frontend E2E test framework | Medium | P1 | QA Process | Open |
| BUG-006 | ESLint errors fail CI quality gate | Low | P2 | Code Quality | Open — count updated, see BUG-013 |
| BUG-007 | Orphan Index.tsx page not routed | Low | P3 | Frontend | Open |
| BUG-008 | AI assessment fails on OpenRouter 402 without clear UX when fallback disabled | Medium | P1 | Credit Risk | Mitigated* |
| BUG-009 | CORS wildcard on edge functions | Low | P3 | Security | Accepted (demo) |
| BUG-010 | Large JS bundle (>500KB) | Low | P3 | Performance | Open — grew to 957.39 kB / 281.39 kB gzip (was 896.69 KB / 262.59 KB) |
| BUG-011 | creditScoring logs full inference payload to console | Low | P3 | Credit Risk | Open |
| BUG-012 | Approvals route lacks ProtectedRoute (relies on sidebar only for some restrictions) | Low | P3 | RBAC | By design** |
| **BUG-013** | **`CreditRisk.tsx` has 3 new `no-explicit-any` lint errors (`ref={creditActionsRef as any}` / `creditStatsRef as any` / `creditTableRef as any`, lines 813/1371/1476), introduced by the Help System build (commit `4b882f7f`, 2026-07-07) wiring onboarding-tour refs — went undetected because they postdate the Jul 6 baseline's lint run** | Low | P3 | Code Quality / Credit Risk | Open |
| **BUG-014** | **Live error: "Could not find the 'age_at_maturity' column of 'approval_requests' in the schema cache" when submitting a new loan assessment** | High | P1 | Credit Risk / Database | Fixed in migration, **live re-confirmation pending (user action required)** |

\*Mitigated when `VITE_CREDIT_AI_FALLBACK=true` or OpenRouter credits available.
\*\*All three roles intentionally have `/approvals` in `ROUTE_PERMISSIONS`; RLS limits row visibility.

---

## BUG-013 — New lint regression in CreditRisk.tsx from Help System integration

**Severity:** Low | **Priority:** P3 | **Status:** Open

**Area:** `src/pages/CreditRisk.tsx` lines 813, 1371, 1476

**Root cause:** When onboarding-tour target refs were wired into `CreditRisk.tsx` as part of the Global Help System build, three `ref={...}` assignments were cast with `as any` (`creditActionsRef`, `creditStatsRef`, `creditTableRef`) rather than typed correctly, presumably to sidestep a ref-type mismatch quickly. Confirmed via `git blame` — introduced in commit `4b882f7f` ("Add bot"), 2026-07-07, one day after the QA baseline was captured, so the baseline's documented lint-error count (3) was correct for its own date but has been stale since the very next day.

**Impact:** Purely a code-quality/lint-gate issue — does not affect runtime behavior (confirmed: `npm run build` and `npm test` both pass). No user-facing defect.

**Suggested fix:** Type the refs correctly against whatever DOM/component ref shape the tour-targeting code expects, removing the `any` casts.

---

## BUG-014 — Schema cache miss for new `approval_requests` columns

**Severity:** High | **Priority:** P1 | **Status:** Fixed in code/migration; live re-confirmation pending

**Area:** `supabase/migrations/20260711130000_loan_assessment_fields.sql`, live Supabase project

**User-reported symptom:** "Failed to create assessment: Could not find the 'age_at_maturity' column of 'approval_requests' in the schema cache" when submitting a new loan assessment.

**Root cause investigation:** Verified via grep that the application code's column name usage (`age_at_maturity` and all 13 sibling columns) was fully consistent with the migration's `ALTER TABLE ... ADD COLUMN` definitions, ruling out a code-level naming bug. Diagnosed as PostgREST's schema cache not having picked up the new columns after the migration ran — either the migration had not yet been (re-)applied to the live project, or Supabase's automatic schema-cache refresh lagged behind the DDL change.

**Fix applied:** Appended `NOTIFY pgrst, 'reload schema';` to the end of the migration file (idempotent — safe to re-run any number of times).

**Status:** Fix is verified by code inspection only [INSPECT]. **Live re-confirmation requires the user to re-run the full migration file in the Supabase SQL Editor** (per the user's established preference to apply migrations themselves) and retry a new assessment. This is the single highest-priority manual retest before the loan-assessment flow can be considered working end to end in the live environment. See `Known_Issues.md` and `Regression_Testing.md` Tier 1 #11 / TC-CR-21.

---

## BUG-001 — FastAPI X-User-Role spoofable

**Severity:** Critical | **Priority:** P0 | **Status:** Open

**Area:** `backend/services/auth.py`, `src/lib/accountApi.ts`

**Steps to reproduce:**
1. Obtain any valid Supabase access token (or call API without token if proxy allows).
2. Send `POST /documents/extract-id` with header `X-User-Role: branch_manager`.
3. Observe 200 response even if JWT user is not a manager.

**Expected:** Server validates role from signed JWT or Supabase profile lookup.

**Actual:** `require_account_opening_role` only checks header value ∈ `{branch_employee, branch_manager}`.

**Root cause:** Trust boundary placed on client-controlled header.

**Impact:** Unauthorized account-opening OCR if API is exposed beyond trusted proxy.

**Suggested fix:** Validate Supabase JWT on FastAPI; load role from `profiles` table or JWT claims signed by Supabase.

---

## BUG-002 — Role metadata desync

**Severity:** High | **Priority:** P1 | **Status:** Open

**Area:** Supabase Auth JWT vs `profiles.role`

**Steps:**
1. Admin changes user role in `profiles` via User Management.
2. User continues session without re-login.
3. RLS reads `auth.jwt() -> user_metadata ->> 'role'` which may be stale.

**Expected:** Role change effective immediately or user forced re-auth.

**Actual:** Migration comments note re-login required; no enforced session invalidation.

**Suggested fix:** Sync `user_metadata.role` on admin update; or RLS reads `profiles` via SECURITY DEFINER helper.

---

## BUG-003 — Static dashboard module KPIs

**Severity:** Medium | **Priority:** P2 | **Status:** Open

**Area:** `src/pages/Dashboard.tsx` module overview section

**Expected (PRB-005 spirit):** Live or derived metrics.

**Actual:** Hardcoded `847/1000`, `97.3%`, `4.8/5`.

**Suggested fix:** Wire to `get_platform_stats()` or hide section until live.

---

## BUG-004 — Debug logging in useStats

**File:** `src/hooks/useStats.ts` line ~217

**Actual:** `console.log('get_platform_stats rpc result', ...)`

**Fix:** Remove or gate behind `import.meta.env.DEV`.

---

## BUG-006 — ESLint errors

| File | Rule |
|------|------|
| `src/components/ui/textarea.tsx` | `@typescript-eslint/no-empty-object-type` |
| `src/components/ui/command.tsx` (line 24) | `@typescript-eslint/no-empty-object-type` |
| `tailwind.config.ts` | `@typescript-eslint/no-require-imports` |

---

## BUG-008 — AI path OpenRouter dependency

**Reproduction:** Deploy `credit-assessment` with low OpenRouter credits; invoke assessment.

**Actual:** HTTP 402 → edge 500 → fallback or error toast depending on env flag.

**Status:** Mitigated in code (max_tokens=400); operational dependency remains.

---

## Defect summary (rebased 2026-07-13)

| Severity | Open | Total |
|----------|-----:|------:|
| Critical | 1 | 1 |
| High | 2 | 2 |
| Medium | 3 | 3 |
| Low | 8 | 8 |

**Change from baseline:** +1 High (BUG-014, fixed in code/migration, pending live re-confirmation), +2 Low (BUG-013 lint regression; BUG-010's severity unchanged but figures updated). Total defects 14 (was 12).
