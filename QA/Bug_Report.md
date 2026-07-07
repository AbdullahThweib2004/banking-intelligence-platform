# Bug Report

**Document ID:** QA-BUG-001  
**Date:** 2026-07-06

| Bug ID | Title | Severity | Priority | Area | Status |
|--------|-------|----------|----------|------|--------|
| BUG-001 | FastAPI trusts client-supplied X-User-Role header | Critical | P0 | Security / API | Open |
| BUG-002 | JWT user_metadata.role may desync from profiles.role | High | P1 | Auth / RBAC | Open |
| BUG-003 | Dashboard module cards show hardcoded KPIs | Medium | P2 | Dashboard | Open |
| BUG-004 | Debug console.log in production stats hook | Low | P3 | Dashboard | Open |
| BUG-005 | No frontend E2E test framework | Medium | P1 | QA Process | Open |
| BUG-006 | ESLint errors fail CI quality gate | Low | P2 | Code Quality | Open |
| BUG-007 | Orphan Index.tsx page not routed | Low | P3 | Frontend | Open |
| BUG-008 | AI assessment fails on OpenRouter 402 without clear UX when fallback disabled | Medium | P1 | Credit Risk | Mitigated* |
| BUG-009 | CORS wildcard on edge functions | Low | P3 | Security | Accepted (demo) |
| BUG-010 | Large JS bundle (>500KB) | Low | P3 | Performance | Open |
| BUG-011 | creditScoring logs full inference payload to console | Low | P3 | Credit Risk | Open |
| BUG-012 | Approvals route lacks ProtectedRoute (relies on sidebar only for some restrictions) | Low | P3 | RBAC | By design** |

\*Mitigated when `VITE_CREDIT_AI_FALLBACK=true` or OpenRouter credits available.  
\*\*All three roles intentionally have `/approvals` in `ROUTE_PERMISSIONS`; RLS limits row visibility.

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

## Defect summary

| Severity | Open | Total |
|----------|-----:|------:|
| Critical | 1 | 1 |
| High | 1 | 1 |
| Medium | 3 | 3 |
| Low | 6 | 7 |
