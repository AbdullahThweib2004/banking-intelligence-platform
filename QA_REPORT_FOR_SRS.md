# QA Audit Report — Banking Intelligence Platform

**Prepared for:** University SRS document, testing-results sections
**Repository:** `palestine-intel-hub-main`
**Branch:** `dev`
**HEAD commit:** `5cf3f1803ac06d432291fc654328a20e4cd7594e` (2026-08-20)
**Audit date:** 2026-08-26
**Working tree at start and end:** clean (`git status --porcelain` empty; `git diff --stat` empty)

---

## 0. Scope, Authorisation, and Safety Statement

This audit was performed read-only with one explicitly authorised exception.

**Live-database authorisation.** Playwright API/integration suites were found to have working live Supabase credentials in `tests/.env.test`. Before executing any suite that writes, the operator was asked and **explicitly approved running the full QA suite (`test:qa:all` scope)**, having been shown that:

- `test:account-opening` and `test:loan-workflow` INSERT real rows into `bank_customers` and `approval_requests`;
- deleting those rows does **not** rewind the PostgreSQL sequence, so live `BOP-1NNNNN` account numbers acquire permanent gaps — the same bug class documented three times in this project's own migrations;
- `test:rls` performs two anonymous write *attempts* that must be rejected.

The operator also confirmed that the 41-character `SUPABASE_SERVICE_ROLE_KEY` in `tests/.env.test` is a valid modern `sb_secret_` key rather than a truncated placeholder. That was corroborated at runtime: the service-role-gated test *"branch_manager sees every profile row"* executed rather than skipping, which requires a working service-role client.

**What was NOT done.** No source file, migration, test, configuration, or environment file was created, modified, renamed, or deleted, other than the two report files this task requires (`QA_REPORT_FOR_SRS.md`, `QA_RESULTS_FOR_SRS.json`). No migration was applied. No Edge Function was deployed. No user was created, updated, deleted, or deactivated. No real customer record was modified. No privilege-escalation exploit was executed against any account (no disposable account was available — see **SEC-01**). No secret, token, password, key, or certificate value appears anywhere in this report; environment variables are referenced by **name only**.

**One blocked action, disclosed.** A read-only verification script that would have counted leftover QA rows using the service-role key was **blocked by the environment's safety classifier**. That denial was respected and not worked around. The consequence is recorded as **DATA-01** — a suspected leftover test row that the operator must verify manually. Its existence is *inferred with high confidence* from a failing test, not directly observed.

**Side effects on gitignored paths.** `npm run build` regenerated `dist/`; Playwright wrote `test-results/`, `playwright-report/`, `playwright-report-api/`; pytest was run with `-p no:cacheprovider` to suppress cache writes. All are gitignored and untracked. No tracked file changed.

---

## 1. Executive Summary of QA Outcome

**402 automated test cases** were identified across four suites. **392 executed**, **388 passed**, **4 failed**, **10 skipped**.

The deterministic core of this system is in good shape and is now backed by **live** evidence, not just code reading. The four-stage loan workflow was exercised end-to-end against the real database and passed 8/8, including every invalid-transition block. Role isolation passed 22/22. The 229 pure unit tests and 46 backend tests all pass.

Four genuine failures were found. Three are real defects; one is a test-harness reliability problem, not a product fault:

1. **A database CHECK constraint that the repository defines is missing from the live database.** A `national_id` of `"123"` was accepted into live `bank_customers`. This is confirmed migration-to-live drift.
2. **The deployed `demo-password-reset` Edge Function accepts EXPIRED verification codes** (HTTP 200 where 401 is required). The repository source contains a correct expiry check, so the deployed build does not match the repository.
3. **The same deployed function fails to create a code row** for an existing account, so the demo recovery flow cannot issue a code at all.
4. **The UI E2E suite is non-deterministically flaky.** Investigation showed this is caused by Supabase Auth throttling induced by the audit's own ~150 sign-ins, not by any product defect — every failing test passed on isolated re-run after a cooldown.

Separately, and importantly for the SRS: **TypeScript type-checking fails with 6 errors and ESLint fails with 6 errors, while `npm run build` succeeds** — because Vite/SWC transpiles without type-checking and no CI gate exists.

**Final recommendation: Requires implementation fixes before submission.** See §17.

---

## PHASE 1 — Project Inventory

All entries verified by direct filesystem inspection, not from documentation.

| Item | Exists | Evidence / detail |
|---|---|---|
| Git branch | ✅ | `dev` |
| Git status | ✅ clean | `git status --porcelain` → empty |
| Frontend entry point | ✅ | `index.html` → `src/main.tsx` → `src/App.tsx` |
| Backend entry point | ✅ | `backend/main.py` (FastAPI app, 8 routes) |
| Supabase Edge Functions | ✅ 5 | `admin-users`, `assistant-chat`, `credit-assessment`, `demo-password-reset`, `policy-search` |
| — 6th directory | ⚠️ | `supabase/functions/manage-users/` exists but is **empty** and **untracked by git**. Orphaned local artefact. |
| Migration files | ✅ 37 | `supabase/migrations/*.sql` |
| Unit test dir | ✅ 10 files | `src/lib/__tests__/` |
| API test dir | ✅ 7 files | `tests/api/` |
| Integration test dir | ✅ 1 file | `tests/integration/` |
| E2E test dir | ✅ 13 files | `e2e/tests/` |
| Backend test dir | ✅ 5 files | `backend/tests/` |
| Package scripts | ✅ 22 | `package.json` |
| Python requirements | ✅ 2 | `backend/requirements.txt` (11 pkgs), `backend/requirements-dev.txt` |
| Playwright configs | ✅ 2 | `playwright.config.ts` (UI), `playwright.api.config.ts` (API) |
| Environment templates | ✅ 2 | `tests/.env.test.example`, `e2e/.env.e2e.example` — **names only reported** |
| `.env.example` (root) | ❌ **MISSING** | `README.md` instructs `cp .env.example .env`. The file does not exist. |
| `.github/` | ❌ **MISSING** | No CI/CD of any kind |
| `.github/workflows/` | ❌ **MISSING** | — |
| `Dockerfile` / `docker-compose.*` | ❌ **MISSING** | — |
| `.gitlab-ci.yml` | ❌ **MISSING** | — |
| `azure-pipelines.yml` / any Azure config | ❌ **MISSING** | — |
| `vercel.json` / `netlify.toml` | ❌ **MISSING** | — |
| `supabase/config.toml` | ❌ **MISSING** | Edge Function deploy flags not in VCS |
| Monitoring / observability files | ❌ **MISSING** | No `sentry.properties`, no APM, no structured logging config |
| `SRS.md` / `docs/` | ❌ **MISSING** | No SRS exists in-repo |
| Tracked files | 371 | `git ls-files \| wc -l` |

**Toolchain present:** Node v26.5.1, npm 12.0.2, Python 3.14.6 (`backend/.venv`), Tesseract 5.5.3, Playwright Chromium browsers cached, `node_modules` installed (261 entries).

---

## PHASE 2 — Static Quality Checks

| ID | Check | Command | Exit | Result | Status | Severity |
|---|---|---|---|---|---|---|
| STA-01 | TypeScript type-check | `npx tsc --noEmit -p tsconfig.app.json` | **2** | **6 errors** | **FAIL** | High |
| STA-02 | ESLint | `npm run lint` | **1** | **6 errors, 15 warnings** | **FAIL** | Medium |
| STA-03 | Production build | `npm run build` | 0 | 1895 modules; `index.js` 1,047.30 kB (305.89 kB gzip); 1 chunk; size warning emitted | **PASS** (with observation) | Low |
| STA-04 | Dependencies installed | filesystem check | — | `node_modules` 261 entries; `backend/.venv` present | PASS | Info |
| STA-05 | Backend importability | `importlib` over 13 modules | 0 | all 13 importable | PASS | Info |
| STA-06 | Backend app import smoke | in-process import of `main` | 0 | app imports; 8 endpoints exposed | PASS | Info |
| STA-07 | Unsupported-technology scan | `grep -rIl` over source | — | see below | PASS | Info |
| STA-08 | Bundle secret scan | `grep -o` over `dist/assets/*.js` | — | **0 occurrences of every secret name** | PASS | Info |

### STA-01 — TypeScript errors (all in one file)

```
src/contexts/AIChatContext.tsx(151,20): error TS2339: Property 'error' does not exist on type 'CreateConversationResult'.
src/contexts/AIChatContext.tsx(152,39): error TS2339: Property 'error' does not exist on type 'CreateConversationResult'.
src/contexts/AIChatContext.tsx(240,38): error TS2339: Property 'error' does not exist on type 'PersistMessageResult'.
src/contexts/AIChatContext.tsx(278,41): error TS2339: Property 'error' does not exist on type 'PersistMessageResult'.
src/contexts/AIChatContext.tsx(301,43): error TS2339: Property 'error' does not exist on type 'PersistMessageResult'.
src/contexts/AIChatContext.tsx(308,65): error TS2339: Property 'error' does not exist on type 'CreateConversationResult'.
```

All six are the same defect class: reading `.error` from a discriminated union without first narrowing on `ok`. These sit in live chat-persistence **error-handling** paths — precisely the paths that only execute when something has already gone wrong. `npm run build` does not catch them because Vite uses SWC, which transpiles without type-checking. **There is no `typecheck` npm script and no CI**, so nothing in the project currently surfaces these.

### STA-02 — ESLint errors

| File | Line:Col | Rule |
|---|---|---|
| `src/pages/CreditRisk.tsx` | 931:41, 1536:37, 1641:38 | `@typescript-eslint/no-explicit-any` |
| `tailwind.config.ts` | 130:13 | `@typescript-eslint/no-require-imports` |
| (2 further) | 24:11, 5:18 | `@typescript-eslint/no-empty-object-type` |

15 warnings, predominantly `react-refresh/only-export-components`.

### STA-07 — Technology scan (files containing each term, excluding `node_modules`, lockfiles, `dist`, `.venv`)

| Term | Files | Interpretation |
|---|---|---|
| `lightgbm`, `LightGBM` | **0** | **No LightGBM anywhere** |
| `tensorflow`, `torch`, `sklearn`, `scikit-learn`, `xgboost`, `onnx`, `keras`, `joblib` | **0** | **No ML framework, no trained model, no weights file, no training pipeline** |
| `azure`, `Azure` | **0** | **Azure is not used** |
| `redis`, `Redis` | **0** | **No Redis / no external cache** |
| `django`, `Django` | **0** | Not used |
| `celery` | **0** | No queue/worker |
| `actions/checkout`, `gitlab-ci` | **0** | **No CI/CD pipeline** |
| `docker` / `Docker` | 2 / 21 | **No Dockerfile exists.** All hits are QA markdown prose plus `scripts/verify-account-numbering.sh`, which spins a *throwaway* Postgres container as a local test harness — not a deployment artefact. |

### STA-08 — Bundle secret exposure (values never read or printed)

Scanned `dist/assets/index-BbhwZHfO.js` (1,079,011 bytes):

| Searched token | Occurrences |
|---|---|
| `OPENROUTER_API_KEY` | **0** |
| `SUPABASE_SERVICE_ROLE_KEY` | **0** |
| `RESEND_API_KEY` | **0** |
| `DEMO_RESET_RECIPIENT_EMAIL` | **0** |
| `SERVICE_ROLE` / `service_role` | **0** |
| `sk-or-` (OpenRouter key prefix) | **0** |
| `sb_secret` (Supabase secret-key prefix) | **0** |
| JWT header prefix `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9` | **0** |

**Verdict: no server-side secret is shipped to the browser.** The only `VITE_`-named literal in the bundle is `VITE_CREDIT_AI_FALLBACK`, appearing once inside a user-facing error message string, not as a value.

### STA-09 — Backend dependency gap (correction to an earlier assessment)

`backend/main.py:17` does `from dotenv import load_dotenv`, and **`python-dotenv` is not listed in `requirements.txt` or `requirements-dev.txt`**.

However, a clean install **would still work**: `requirements.txt` declares `uvicorn[standard]`, whose metadata was inspected and confirmed to include `python-dotenv>=0.13; extra == 'standard'`.

**Corrected severity: LOW (maintainability), not a startup failure.** The service depends on a transitive extra of an unrelated package. It breaks only if someone installs plain `uvicorn` or if uvicorn drops the extra. Recommendation: declare `python-dotenv` explicitly.

---

## PHASE 3 — Unit Tests

**Command:** `npm test` → `node --experimental-strip-types --test src/lib/__tests__/*.test.ts`
**Exit code:** `0`

```
tests 229   suites 45   pass 229   fail 0   cancelled 0   skipped 0   todo 0
duration_ms 360.994341
```

| File | describes | its | lines |
|---|---|---|---|
| `loanEngine.test.ts` | 7 | 33 | 440 |
| `chatHybrid.test.ts` | 12 | 49 | 463 |
| `validation.test.ts` | 10 | 56 | 315 |
| `employmentMatch.test.ts` | 4 | 18 | 184 |
| `riskDecisionGate.test.ts` | 3 | 15 | 124 |
| `qa.test.ts` | 2 | 12 | 112 |
| `approvalRequests.test.ts` | 1 | 7 | 109 |
| `schemaVerification.test.ts` | 3 | 9 | 80 |
| `helpDialogDetection.test.ts` | 2 | 6 | 66 |
| `loanApplicationValidation.test.ts` | 1 | 5 | 36 |

### Coverage of the specific logic areas requested

| Area | Covered | Evidence |
|---|---|---|
| EMI formula vs. hand-computed textbook value | ✅ | `loanEngine.test.ts:36` |
| Zero interest → exact straight-line split | ✅ | `loanEngine.test.ts:50` |
| Total repayment identity (`interest = repaid − principal`) | ✅ | `loanEngine.test.ts:57` |
| DBR boundary **exactly 50%** (inclusive, must pass) | ✅ | `loanEngine.test.ts:86` |
| DBR **above 50%** (must fail) | ✅ | `loanEngine.test.ts:99` |
| Age-at-maturity **exactly 70** (inclusive, must pass) | ✅ | `loanEngine.test.ts:112` |
| Age-at-maturity **71** (must fail) | ✅ | `loanEngine.test.ts:125` |
| Unknown age → rule skipped, not assumed | ✅ | `loanEngine.test.ts:138` |
| Risk-score limits `[0,100]` | ✅ | `loanEngine.test.ts:169` |
| Risk categories (`low<40`, `medium 40–69`, `high≥70`) | ✅ | `loanEngine.test.ts:186` |
| Eligibility override forces High | ✅ | `loanEngine.test.ts:198` |
| Weighted-score additive transparency | ✅ | `loanEngine.test.ts:212` |
| Currency + rate resolution (9 product×currency pairs) | ✅ | `loanEngine.test.ts:220–241` |
| National-ID exact matching | ✅ | `employmentMatch.test.ts` |
| Name-match requires confirmation | ✅ | `employmentMatch.test.ts` |
| Unresolved-financial-data sentinel | ✅ | `employmentMatch.test.ts` |
| Duplicate handling | ✅ | `account-opening.api.spec.ts` (pure block) |
| Chat intent classification | ✅ | `chatHybrid.test.ts` |
| RAG answer composition | ✅ | `chatHybrid.test.ts` |
| Source/citation handling | ✅ | `chatHybrid.test.ts` |
| Approval-workflow mapping | ✅ | `approvalRequests.test.ts` |
| Help/onboarding behaviour | ✅ | `helpDialogDetection.test.ts` |
| **AI narrative immutability** | ✅ | `loanEngine.test.ts:389`, `:404` (prompt-injection immunity), `:426`, `:431` |

### Gaps between tested and untested logic

| Untested area | Consequence |
|---|---|
| **React components, hooks, contexts** — zero component tests | `AIChatContext.tsx` carries all 6 TypeScript errors and has no test |
| Realtime subscription behaviour | 14 subscriptions, none unit-tested |
| `modificationReanalysis.ts` orchestration | Only `isScoringField` is indirectly covered |
| `aiCreditAssessment.ts` timeout/error mapping | Excluded by design (imports `import.meta.env`); tested only at the sealed merge boundary |
| PDF generation / form templates | No unit test |
| OCR preprocessing (deskew, CLAHE, pass merge) | No unit test — only endpoint-level tests |

---

## PHASE 4 — Backend Pytest

**Command:** `cd backend && .venv/bin/python -m pytest tests -v -p no:cacheprovider`
**Exit code:** `0`
**Result:** **46 passed, 0 failed, 0 skipped, 0 errors, 1 warning, 0.20s**

Warning (non-blocking): `StarletteDeprecationWarning: Using httpx with starlette.testclient is deprecated; install httpx2 instead.`

| Test file | Coverage scope |
|---|---|
| `test_documents.py` | Document endpoints; OCR and LLM mocked at the external boundary only, route behaviour real |
| `test_authz.py` | `X-User-Role` authorisation on every protected endpoint |
| `test_accounts.py` | `/accounts/open-new` behaviour |
| `test_employment_extractor.py` | `_parse_salary`, `_parse_currency`, `_parse_employment_status` normalisation, incl. rejection of hallucinated values |
| `test_llm_client.py` | Error classification 401/402/429/5xx/connect-error; model-fallback retry policy |
| `conftest.py` | `TestClient` fixture; autouse in-memory document-store reset between tests |

**Safety:** every external boundary is mocked (`unittest.mock.patch` on `httpx.Client.post`); `TestClient` runs in-process. **No network call, no database access, no OpenRouter credit spent.**

| Requested check | Status |
|---|---|
| OCR tests | ✅ present (`test_documents.py`, OCR boundary mocked) |
| Employment-proof extraction tests | ✅ present, 6 normalisation tests |
| LLM client tests | ✅ present, 11 tests |
| Account endpoint tests | ✅ present |
| Authorization tests | ✅ present |
| Health endpoint tests | ✅ present |
| Clean-install viability | ✅ **would succeed** — see STA-09 correction |

---

## PHASE 5 — API and Integration Tests (live Supabase, operator-approved)

All suites use `playwright.api.config.ts` (`fullyParallel: false`, `workers: 1`). FastAPI was started locally (`npm run dev:api`) so health/OCR preconditions were genuinely met rather than skipped; `/health` returned `{"status":"ok","llm_fallback_configured":true}`.

| ID | Suite | Command | Exit | Pass | Fail | Skip | Duration | Live Supabase | OpenRouter | Temp data | Cleanup |
|---|---|---|---|---|---|---|---|---|---|---|---|
| API-01 | Health + Auth | `npm run test:api` | 0 | **10** | 0 | 1 | 5.3s | ✅ read | ❌ | none | n/a |
| API-02 | RLS / data access | `npm run test:rls` | 0 | **22** | 0 | 2 | 9.3s | ✅ read + 2 blocked writes | ❌ | none | n/a |
| API-03 | Account opening | `npm run test:account-opening` | **1** | 16 | **1** | 0 | 5.7s | ✅ **writes** | ❌ | `bank_customers` rows | ⚠️ partial — see DATA-01 |
| API-04 | Loan workflow | `npm run test:loan-workflow` | 0 | **8** | 0 | 0 | 9.7s | ✅ **writes** | ❌ | `approval_requests` rows | ✅ afterAll, no errors |
| API-05 | Assistant / RAG | `npm run test:assistant` | 0 | **6** | 0 | 1 | 4.3s | ✅ **writes** (chat rows) | ❌ gated off | chat rows | ✅ afterAll |
| API-06 | System integration | `npm run test:integration` | 0 | **2** | 0 | 0 | 4.5s | ✅ **writes** | ❌ | workflow rows | ✅ afterAll |
| API-07 | Demo password reset | `npx playwright test … demo-password-reset.api.spec.ts` | **1** | 6 | **2** | 0 | 18.8s | ✅ **writes** (OTP rows) | ❌ | OTP code rows | ✅ afterEach |
| **TOTAL** | | | | **70** | **3** | **4** | | | | | |

### Every skip, with its reason

| Suite | Skipped test | Reason |
|---|---|---|
| API-01 | `role changes require re-authentication to take effect in RLS` | Unconditional `test.skip(...)` in source (`auth.api.spec.ts:57`) — declared, never implemented |
| API-02 | `risk_department cannot approve a row still awaiting branch-manager decision` | Unconditional `test.skip(...)` (`supabase-rls.api.spec.ts:114`) — deferred to workflow suite, where it is now covered by API-04 test 2 |
| API-02 | `user_metadata.role cannot be self-escalated by the end user` | Unconditional `test.skip(...)` (`supabase-rls.api.spec.ts:161`). The suite's own comment states it would permanently mutate a real account and needs a disposable one first. **This is the Critical finding SEC-01 — recorded as NOT TESTED, never as passed.** |
| API-05 | `OpenRouter live smoke test` | Gated on `RUN_LIVE_OPENROUTER_TESTS`, which is set to `false`. **No external AI credits were spent.** |

> **Reporting integrity note.** Four tests were skipped and **none is counted as a pass**. In particular, the privilege-escalation test being skipped is the single most important gap in this audit and is escalated as **SEC-01 / Critical**.

### API-03 — FAILURE: live database is missing a CHECK constraint

**Test:** `required-field validation: a national_id shorter than 7 chars is rejected` (`tests/api/account-opening.api.spec.ts:218`)

```
Error: expect(received).not.toBeNull()
Received: null
  > 225 |     expect(result.error).not.toBeNull();
```

**Expected:** inserting `national_id = '123'` is rejected by
`bank_customers_national_id_length CHECK (char_length(national_id) BETWEEN 7 AND 15)`,
defined in `supabase/migrations/20260716100000_input_validation_guardrails.sql`.

**Actual:** the insert **succeeded** — `result.error` was `null`.

**Conclusion:** the constraint does not exist in the live database. Migration `20260716100000_input_validation_guardrails.sql` has not been applied (or was applied only in part). This is **confirmed migration-to-live schema drift**, and it means the entire defence-in-depth validation layer added by that migration — non-negative income/expenses/loans/amount, name-length caps, `client_age` 0–120, `loan_term_years` 1–30 — **cannot be assumed present live**. Only the frontend `src/lib/validation.ts` checks are actually protecting these fields today.

### API-07 — FAILURES: deployed Edge Function does not match repository source

**Failure 1 — `request` does not create a code row**

```
Error: expect(received).not.toBeNull()
Received: null
  > 115 |     expect(row.data).not.toBeNull();
```

After calling `{action:'request', email}` for an account that demonstrably has a `profiles` row, **no row appeared in `demo_password_reset_codes`**. The demo recovery flow therefore cannot issue a verification code.

**Failure 2 — an EXPIRED code is accepted (security defect)**

```
Error: expect(received).toBe(expected)
Expected: 401
Received: 200
  > 215 |     expect(response.status()).toBe(401);
```

The test seeded a code with `expires_at = now − 60s` and submitted the correct value. The function returned **HTTP 200** — i.e. it minted a real `magiclink` token and established a session **from an expired code**.

**Diagnosis.** The repository source at `supabase/functions/demo-password-reset/index.ts:201` contains a correct check:

```ts
if (new Date(row.expires_at).getTime() < Date.now()) return json(401, GENERIC_VERIFY_ERROR);
```

The neighbouring guards *do* work live — wrong code rejected and counted (test 4 ✅), attempt cap enforced (test 6 ✅), consumed code not reusable (test 7 ✅), anon cannot read the table (test 8 ✅). Only the **expiry** check is absent. That precise, isolated gap points to **the deployed function being an older build than the repository source**.

This could not be confirmed by redeploying, because deploying Edge Functions is prohibited by the operating rules. **Remediation: redeploy `demo-password-reset` from the repository and re-run this suite.**

### API-04 / API-06 — the four-stage workflow, verified live

All 8 loan-workflow tests and both integration tests passed against the real database:

| Verified live | Result |
|---|---|
| Employee insert enters `pending_branch_manager_approval`, with `risk_score` / `eligibility_status` present | ✅ |
| Risk cannot see *or* update a row still at the manager gate | ✅ |
| `manager approve → pending`, row becomes visible to Risk | ✅ |
| `risk approve → pending_audit_approval`, row becomes visible to Audit | ✅ |
| `audit approve → audit_approved` with `approved_at` persisted | ✅ |
| Soft reject at manager stage (row kept) | ✅ |
| Soft reject at risk stage (row kept) | ✅ |
| Soft reject at audit stage, `audit_decision_note` persists, `approved_at` stays null | ✅ |
| Audit cannot act on a manager-gated row | ✅ |
| Manager cannot re-decide a row past their own gate | ✅ |
| Full lifecycle verified independently via service-role admin client | ✅ |

---

## PHASE 6 — RLS and Authorisation QA

**Command:** `npm run test:rls` — **22 passed, 2 skipped, exit 0**, against the live project.

### Profiles

| Check | Status | Evidence |
|---|---|---|
| Anonymous cannot read `profiles` | **PASS** | rls test 1 |
| Anonymous cannot INSERT into `profiles` | **PASS** | rls test 6 |
| `branch_employee` sees only its own row | **PASS** | rls test 7 |
| `risk_department` sees only its own row | **PASS** | rls test 8 |
| `audit_department` sees only its own row | **PASS** | rls test 9 |
| `branch_manager` sees all rows (scoped as designed) | **PASS** | rls test 10, cross-checked against service-role ground truth |
| Role values limited to the four valid roles | **PASS** (schema) | `profiles_role_check` in `20260727160000_audit_stage_workflow.sql:56–59` |

### Approval requests

| Check | Status | Evidence |
|---|---|---|
| Employees see only their own requests | **PASS** | rls test 11 |
| Managers can access intended requests | **PASS** | rls test 14 |
| Risk cannot see manager-gated records | **PASS** | rls test 12 + workflow test 2 |
| Audit sees only post-Risk records and its own rejections | **PASS** | rls test 13 |
| Employees cannot approve | **PASS** | no employee UPDATE policy exists; anon UPDATE blocked (rls test 5) |
| Managers cannot perform Risk approval | **PASS** | workflow test 8 — manager re-decide past own gate blocked |
| Risk cannot perform Audit approval | **PASS** | `risk_approve_requests` `USING status='pending'` only; workflow test 2 |
| Audit is the only final approver | **PASS** | workflow test 3 |
| Stages cannot be skipped | **PASS** | workflow tests 7, 8 |
| Rejections are soft; records remain | **PASS** | workflow tests 4, 5, 6 |

### Documents

| Check | Status | Evidence |
|---|---|---|
| Audit cannot access documents | **PASS** | rls test 20 — zero rows |
| employee / manager / risk can read | **PASS** | rls tests 21–23 |
| Delete permissions limited | **NOT TESTED** | Would require creating and deleting a live document row; no disposable fixture exists. Policy reviewed in `20260705140000_documents_rls.sql` (own-row for employee; any row for manager/risk). |

### Audit logs

| Check | Status | Evidence |
|---|---|---|
| `risk_department` can read | **PASS** | rls test 16 |
| `branch_employee` cannot | **PASS** | rls test 17 |
| `branch_manager` cannot | **PASS** | rls test 18 — this test previously caught a stray out-of-band policy, removed by `20260804090000` |
| `audit_department` cannot | **PASS** | rls test 19 |
| UPDATE/DELETE blocked (append-only) | **PASS by design, NOT TESTED live** | No UPDATE/DELETE policy exists on `audit_logs`; RLS default-denies. Not exercised because it would require attempting a write to the compliance log. |

### Chat

| Check | Status | Evidence |
|---|---|---|
| Users access only their own conversations/messages | **PASS** | `assistant.api.spec.ts` test 5 — persistence with owner-only visibility |
| Messages not readable via another user's conversation | **PASS** | same test |
| `role` constrained to `user`/`assistant` | **PASS** | `assistant.api.spec.ts` test 6 |

### Customer data

| Check | Status | Evidence |
|---|---|---|
| Authenticated roles can read `bank_customers` | **PASS** | account-opening tests 9, 10 |
| INSERT limited to `branch_employee` / `branch_manager` | **PASS** | account-opening tests 16, 17 — risk and audit both blocked |
| Field validation on insert | **PARTIAL FAIL** | NOT NULL enforced (test 14 ✅); **length CHECK missing live (test 15 ❌)** |
| `unemployed_customers` access | **NOT TESTED** | No test covers this table. Policies reviewed in `20260723100000` (SELECT all authenticated; INSERT restricted to the two account-opening roles). |

### SEC-01 — Role-claim source (CRITICAL)

Every RLS policy in all 37 migrations reads the role from:

```sql
auth.jwt() -> 'user_metadata' ->> 'role'
```

`grep` confirms **zero** policies use `app_metadata`.

`user_metadata` is derived from `auth.users.raw_user_meta_data`, which an authenticated browser session can write via `supabase.auth.updateUser({ data: { role: 'branch_manager' } })`.

- **Confirmed from code/design:** ✅ Yes — and the project's own migration acknowledges it (`20260618103000_rbac_profiles.sql:6–14`), as does the test suite (`supabase-rls.api.spec.ts:151–164`).
- **Exploited against a real account:** ❌ **No.** No disposable test account was available, and operating rule 10 forbids it. Recorded as **NOT TESTED**, not as passed.
- **Severity:** **CRITICAL**
- **Remediation:** migrate every RLS policy to `auth.jwt() -> 'app_metadata' ->> 'role'`. **The groundwork already exists** — `supabase/functions/admin-users/index.ts:115` and `:173` already write `app_metadata.role` on user create and update. Nothing currently reads it. This is a policy-text change plus a one-time backfill, not a redesign.

---

## PHASE 7 — Authentication QA

| ID | Check | Method | Status | Evidence |
|---|---|---|---|---|
| AUTH-01 | Valid login, all four roles, with matching role claim | `test:api` | **PASS** | 4 role logins, `auth.api.spec.ts:34` |
| AUTH-02 | Invalid password rejected, no session issued | `test:api` | **PASS** | `auth.api.spec.ts:17` |
| AUTH-03 | Unauthenticated client cannot read a protected table | `test:api` | **PASS** | `auth.api.spec.ts:27` |
| AUTH-04 | Session restoration (`getSession` reflects issued session) | `test:api` | **PASS** | `auth.api.spec.ts:45` |
| AUTH-05 | Unknown email | — | **NOT TESTED** | No test case exists |
| AUTH-06 | Empty email / empty password | — | **NOT TESTED** at API level; client-side zod schema covers it (`Auth.tsx:15–18`) |
| AUTH-07 | Logout | E2E | **NOT TESTED** | No E2E logout assertion exists |
| AUTH-08 | Token refresh behaviour | — | **NOT TESTED** | Uses `supabase-js` defaults; not configured in-repo |
| AUTH-09 | Inactive/suspended user handling | — | **NOT TESTED** | `profiles.status` exists with a CHECK; **no code path anywhere enforces it at login** — see AUTH-OBS-1 |
| AUTH-10 | Role loading into UI | E2E | **PASS** | role-access E2E, 7 passed |
| AUTH-11 | Unauthorized route access redirects | E2E | **PASS** | `role-access.spec.ts`, 7 passed |
| AUTH-12 | Role change requires re-auth | — | **SKIPPED** | Unconditional `test.skip` (`auth.api.spec.ts:57`) |

### Demo password-recovery flow

| Check | Status | Evidence |
|---|---|---|
| No account enumeration (identical response either way) | **PASS** | `demo-password-reset` test 2 |
| Wrong code rejected and counted as an attempt | **PASS** | test 4 |
| Attempt limit locks out even a correct code | **PASS** | test 6 |
| Single-use — consumed code cannot be reused | **PASS** | test 7 |
| Password remains untouched by recovery | **PASS by design** | Function never reads or writes `encrypted_password`; session is minted via `admin.auth.admin.generateLink` + client `verifyOtp` |
| Codes table default-denies anon | **PASS** | test 8 |
| Fixed-demo-recipient warning shown in UI | **PASS** | Permanent bilingual amber alert, `ForgotPasswordFlow.tsx:82–89` |
| **Code creation on request** | **FAIL** | test 1 — no row created (API-07 Failure 1) |
| **Code expiry enforced** | **FAIL** | test 5 — expired code accepted, HTTP 200 (API-07 Failure 2) |

### AUTH-PW — Password minimum length: **verified as 6, not 8**

```
src/pages/Auth.tsx:17
  password: z.string().min(6, 'Password must be at least 6 characters'),
```

**Verified behaviour: 6 characters.** Any SRS text claiming an 8-character minimum is contradicted by the implementation. Note this is a *client-side login form* check only; it is not a password policy — no registration UI, no complexity rule, and no password-change screen exists in the application. Server-side password policy lives in Supabase GoTrue dashboard settings, which are not in version control and were **NOT TESTED**.

### AUTH-OBS-1 — `profiles.status` is decorative (OBSERVATION, Medium)

`profiles.status` accepts `active | inactive | suspended` and User Management can set it, but **no login path, no RLS policy, and no route guard reads it**. Suspending a user in the UI does not prevent them from signing in or from using the application. Not exploited; identified by code review.

---

## PHASE 8 — Deterministic Credit Engine QA

**All 33 engine tests pass** (`loanEngine.test.ts`, part of the 229).

### EMI

| Case | Status | Evidence |
|---|---|---|
| Positive principal + positive interest matches textbook EMI | PASS | `:36` |
| Zero interest → exact straight-line, zero interest | PASS | `:50` |
| Negative principal → 0, no NaN, no throw | PASS | `:73` |
| Zero term → 0, no divide-by-zero | PASS | `:73` |
| Rounding: 2 dp; `totalInterest = totalRepaid − principal` holds | PASS | `:57` |
| Monotonic in principal and in rate | PASS | `:65` |

Formula (`src/lib/loanCalculator.ts:45–67`): `M = P·r·(1+r)^n / ((1+r)^n − 1)`, `r = annualRate/12`, `n = round(termYears×12)`.

### DBR

| Case | Status | Evidence |
|---|---|---|
| Formula `(obligations + installment) / salary` | PASS | `:81` |
| Currency conversion into salary currency before ratio | PASS (code) | `creditScoring.ts:278–282`; FX round-trip tested `:241` |
| **Exactly 50% → eligible** (inclusive) | PASS | `:86` |
| **Above 50% → not eligible**, reason recorded | PASS | `:99` |
| Zero income → returns 1 when any obligation exists, else 0 | PASS (code) | `loanEligibility.ts:68` |

`DBR_CAP = 0.5`, breach is strictly `>`.

### Age at maturity

| Case | Status | Evidence |
|---|---|---|
| **Exactly 70 → eligible** (inclusive) | PASS | `:112` |
| **71 → not eligible** | PASS | `:125` |
| Unknown age → rule skipped, neither pass nor fail assumed | PASS | `:138` |
| Negative term clamped via `max(0, term)` | PASS (code) | `loanEligibility.ts:78` |

### Risk score

| Component | Formula | Cap | Tested |
|---|---|---|---|
| Base | `5` | — | ✅ `:212` |
| Debt burden ratio | `(DBR / 0.5) × 40` | uncapped | ✅ `:174` |
| Age at maturity | `min(30, (age/70) × 20)`, `0` if unknown | 30 | ✅ `:180` |
| Loan term | `min(15, (years/30) × 15)` | 15 | ✅ |
| Loan-to-income | `min(20, (amt/(12·salary)/5) × 15)` | 20 | ✅ |
| Obligations pressure | `min(10, (oblig/salary /0.3) × 10)` | 10 | ✅ |
| Employment | `employed 0`, `business 2`, `self-employed 3`, else `2` | — | ✅ |
| Clamping to `[0,100]` | ✅ `:169` | | |
| Thresholds `low<40 / medium 40–69 / high≥70` | ✅ `:186` | | |
| Itemised factors sorted by absolute impact | ✅ code `loanRiskScoring.ts:154` | | |
| Bilingual EN/AR labels on every factor | ✅ code `loanRiskScoring.ts:86–151` | | |

### Eligibility

| Case | Status |
|---|---|
| Eligible result | PASS `:150` |
| Not-eligible result with reasons | PASS `:99`, `:125` |
| Multiple simultaneous reasons | PASS (array) `loanEligibility.ts:91–101` |
| Category override → forces `high` | PASS `:198` |
| Recommendation override → forces `reject` | PASS `:336` |
| Eligible result left unchanged by override | PASS `:206` |

### AI isolation — the central safety property

`mergeAiNarrativeIntoSnapshot()` (`src/lib/creditScoring.ts:464–474`) spreads `...base` and can overwrite **only three fields**: `risk_explanation_summary`, `ai_explanation`, `result_source`.

| AI must NOT be able to modify | Verified |
|---|---|
| risk score | ✅ `:389`, `:404` |
| risk category | ✅ `:389`, `:404` |
| eligibility status | ✅ `:389`, `:431` |
| loan amount | ✅ `:431` |
| installment | ✅ `:431` |
| DBR | ✅ `:431` |
| age at maturity | ✅ `:431` |
| total repayment | ✅ `:431` |
| total interest | ✅ `:431` |

Test `:404` — *"is structurally immune to a 'prompt injection' style explanation trying to smuggle a different score/category"* — passes. The edge function additionally rejects any request lacking a pre-computed `formula_result.score`/`.category` (`credit-assessment/index.ts:158–165`).

**Conclusion: the AI-isolation claim is IMPLEMENTED AND VERIFIED.**

---

## PHASE 9 — Loan Workflow QA

| # | Requirement | Status | Evidence |
|---|---|---|---|
| 1 | Employee creates a signed request | **PASS** (DB layer) | workflow test 1. *Signature enforced only client-side* — see WF-OBS-1 |
| 2 | Initial status `pending_branch_manager_approval` | **PASS live** | workflow test 1 |
| 3 | Manager approval → `pending` | **PASS live** | workflow test 3 |
| 4 | Risk approval → `pending_audit_approval` | **PASS live** | workflow test 3 |
| 5 | Audit approval → `audit_approved` | **PASS live** | workflow test 3 |
| 6 | Rejection at any stage → `rejected` | **PASS live** | workflow tests 4, 5, 6 |
| 7 | Rejected records remain stored | **PASS live** | workflow tests 4, 5, 6 |
| 8 | Stage actor + timestamp fields populated | **PASS live** | `manager_decision_by`, `risk_decision_by`, `audit_decision_by` all asserted |
| 9 | Audit cannot approve a record missing eligibility | **PASS by constraint, NOT TESTED live** | `approval_requests_audit_requires_eligibility_check` uses `audit_approved` — a *currently produced* status, so it is effective. Client gate: `riskDecisionGate.ts:65–69` |
| 10 | Risk override behaviour | **PARTIAL — see WF-01** | Client gate works; DB constraint is dead |
| 11 | High-risk and not-eligible not conflated | **PASS** | `applyEligibilityOverride` preserves the numeric score while forcing category; `riskDecisionGate.ts` reads *only* `eligibility_status`, never `risk_score` |
| 12 | Modification requests allow only one field | **PASS by design** | `loan_modification_requests.field_name` is a single column; RPC allow-list of 10 fields |
| 13 | Modification requests require a reason | **PASS by schema** | `reason TEXT NOT NULL` |
| 14 | Risk can approve/reject modifications | **NOT TESTED** | No automated test; RPC role-check reviewed (`20260619102000`) |
| 15 | Approved modifications trigger re-analysis | **NOT TESTED** | `modificationReanalysis.ts` has no test |
| 16 | Re-analysis history stored | **NOT TESTED** | `risk_reanalysis_history` untested |
| 17 | Rejected modifications don't alter the original | **PASS by design** | RPC only mutates the source row inside the `IF approve` branch |
| 18 | Invalid status transitions blocked | **PASS live** | workflow tests 7, 8 |

### WF-01 — Risk-override DB constraint is DEAD (HIGH severity defect)

`supabase/migrations/20260727150000_risk_dbr_override_audit_columns.sql:32–34`:

```sql
CHECK (
  NOT (status = 'approved' AND eligibility_status = 'not_eligible' AND risk_override_reason IS NULL)
) NOT VALID
```

The constraint keys on `status = 'approved'`. The statuses actually producible by RLS `WITH CHECK` clauses, extracted from the migrations, are:

```
status IN ('pending', 'rejected')
status IN ('pending_audit_approval', 'rejected')
status IN ('audit_approved', 'rejected')
status IN ('pending_branch_manager_approval', 'pending')
```

`'approved'` is **not among them**. Since `20260727160000_audit_stage_workflow.sql` introduced the audit stage, Risk approval sets `pending_audit_approval` and final approval sets `audit_approved`. **The constraint can never fire.**

**Impact:** the database-level guarantee that a Risk approval of an *ineligible* application carries a written override reason no longer exists. Only the client-side check in `riskDecisionGate.ts` remains, and a stale client or a direct PostgREST call bypasses it. This is compliance-relevant.

**Fix:** change `status = 'approved'` to `status = 'pending_audit_approval'` and re-add the constraint. (The sibling audit constraint added in the *same* release correctly uses a live status, which is why it still works.)

### WF-OBS-1 — Customer signature is not enforced by the database (Medium)

`src/pages/CreditRisk.tsx:607–612` blocks submission without a signature, and `signature_data_url` is persisted. **No `NOT NULL` or CHECK constraint exists on that column**, so a direct API insert can create a "signed" loan request with no signature. Confirmed by the workflow tests themselves, which insert successfully without one.

---

## PHASE 10 — Account Opening and OCR QA

No real identity document was uploaded. No synthetic fixture was pushed through the live OCR pipeline during this audit; OCR behaviour was verified via the mocked pytest suite and by in-process endpoint probes.

| Item | Status | Evidence |
|---|---|---|
| Tesseract availability | **PASS** | Tesseract 5.5.3 present; `/health` reachable |
| ID image upload endpoint | **IMPLEMENTED, tested (mocked)** | `test_documents.py` |
| PDF ID input | **IMPLEMENTED** | PyMuPDF rasterises page 1 at 300 dpi (`ocr.py:47–63`). **NOT TESTED** with a real PDF |
| OpenCV preprocessing (deskew, CLAHE, adaptive threshold, 2-pass merge) | **IMPLEMENTED** | `ocr.py:75–197`. **NOT unit-tested** |
| OCR failure behaviour | **PASS** | Missing Tesseract → 503; unreadable → 422 (`documents.py:47–61`) |
| Blurry/unreadable document behaviour | **IMPLEMENTED, NOT TESTED live** | Fixtures exist (`backend/test_images/blurry_id.png`) but no test consumes them |
| Identity-field extraction (regex-only, no AI) | **PASS** | `field_extraction.py:1–9`, `test_documents.py` |
| Staff review and correction | **IMPLEMENTED** | `Documents.tsx` editable form. **NOT TESTED** — E2E wizard test is `test.skip` |
| Employed path | **PASS live** | `bank_customers` insert verified, account-opening tests 11, 12 |
| Unemployed path | **IMPLEMENTED, NOT TESTED** | `unemployed_customers` has no test coverage at all |
| Employment-proof extraction (LLM-only, no regex fallback) | **PASS (mocked)** | `test_employment_extractor.py`, 6 tests |
| LLM output normalisation | **PASS** | salary/currency/status normalisers, incl. hallucinated-value rejection |
| Invalid currency handling | **PASS** | `_parse_currency` → `""`, never a guess |
| Invalid salary handling | **PASS** | `_parse_salary` rejects bool, non-numeric → `None` |
| Exact national-ID matching | **PASS** | pure tests 1, 4 + live test 9 (seed row BOP-100001 retrieved correctly) |
| Name-only candidate never auto-applied | **PASS** | pure test 2 |
| Ambiguous name behaviour | **PASS** | pure test 3 |
| Salary mismatch warning (>15%) | **PASS** | pure test 8 |
| Missing-financial-data sentinel | **PASS live** | test 12 — stored as `unresolved_needs_review`, never a random number |
| Duplicate national-ID handling | **PASS live** | test 13 — DB returns `23505`; app reuses the row |
| Concurrent national-ID handling | **PASS by design, NOT TESTED** | Race caught at `bankCustomers.ts:263–272` |
| Cross-category duplicate handling | **IMPLEMENTED, NOT TESTED** | `accountOpening.ts:47–78` |
| DB-generated account number | **PASS live** | test 11 — `BOP-1#####` generated by trigger |
| Employed number family `BOP-1NNNNN` | **PASS live** | test 11 |
| Unemployed number family `BOP-N` | **NOT TESTED** | — |
| **Field-length validation at DB level** | **FAIL live** | **API-03 — CHECK constraint missing (see Phase 5)** |
| Signature capture | **IMPLEMENTED, NOT TESTED** | `SignaturePad.tsx`; E2E wizard test skipped |
| PDF generation (WeasyPrint, bilingual, two-copy) | **IMPLEMENTED, NOT TESTED live** | `form_generator.py`, templates present |
| PDF storage (Supabase Storage, signed URLs) | **IMPLEMENTED, NOT TESTED** | `useDocuments.ts:187–231` |
| Document metadata row | **IMPLEMENTED** | best-effort insert, `Documents.tsx` |
| Temporary in-memory document state | **CONFIRMED LIMITATION** | `store.py:30` — module-level dict |
| Behaviour after FastAPI restart | **CONFIRMED** | All in-flight documents and generated PDFs are lost. Single-instance by construction. |
| Permission checks | **PASS** | See Phase 12 SEC-02 — but header-based only |

**Endpoints confirmed live** (from the running app's own OpenAPI schema):

```
POST /accounts/open-new
POST /documents/extract-employment-proof
POST /documents/extract-id
POST /documents/{document_id}/extract-employment-fields
POST /documents/{document_id}/extract-fields
POST /documents/{document_id}/generate-form
GET  /documents/{document_id}/pdf
GET  /health
```

---

## PHASE 11 — AI Assistant and RAG QA

### Intent classification — covered by `chatHybrid.test.ts` (49 tests, all passing)

| Intent | Status |
|---|---|
| policy / customer / hybrid / greeting / capability / general | **PASS** — all six classified |
| advisory behaviour (`isAdvisory`, `seeksSpecificTerm`) | **PASS** |
| missing account number → `missing_identifier` | **PASS** |
| ambiguous multiple account numbers | **PASS** |
| follow-up account-number inheritance from history | **PASS** |

### Policy retrieval

| Item | Status | Evidence |
|---|---|---|
| Remote `policy-search` reachable + input validation | **PASS live** | assistant tests 3, 4 |
| Embedding request | **IMPLEMENTED, NOT TESTED live** | Live test gated off (no credits spent) |
| pgvector `match_policy_chunks` | **IMPLEMENTED, NOT TESTED live** | `20260620100000_policy_chunks.sql` |
| Default match count `4`, threshold `0.3` | **CONFIRMED (code)** | `policy-search/index.ts:76` |
| Local keyword fallback | **PASS** | `chatHybrid.test.ts` |
| Arabic normalisation (diacritics, letter variants, article) | **PASS** | `rag.ts:96–110` + tests |
| English stemming/stop-words | **PASS** | `rag.ts:112–131` + tests |
| No-policy-found response | **PASS** | `chatHybrid.test.ts` |

### Customer lookup

| Item | Status |
|---|---|
| Exact account number only; no name-based lookup | **PASS** — `chatCustomerLookup.ts:208–221`, tested |
| Case normalisation (upper-cased, trimmed) | **PASS** |
| Not-found behaviour, never fabricated | **PASS** |
| Customer source labelling | **PASS** |
| Recent-assessment context (best-effort, never throws) | **PASS** |

### Affordability

| Item | Status |
|---|---|
| Reuses the deterministic calculator (no new rules) | **PASS** — imports `loanCalculator`/`loanEligibility`/`loanProducts` |
| Terms 1–30 years searched | **PASS** |
| Minimum amount (8,000 USD equivalent) → `below_minimum` | **PASS** |
| Eligible term recommendation (shortest eligible) | **PASS** |
| Not-affordable result with best attempt | **PASS** |
| Missing inputs → clarification, never guessed | **PASS** |

### Answer composition

| Item | Status |
|---|---|
| OpenRouter composition | **IMPLEMENTED, NOT TESTED live** (credits gate off) |
| Context passed to model (policy + customer + advisory) | **CONFIRMED (code)** |
| Source labels (`file`/`database`/`both`/`general`/`clarification`/`not_found`) | **PASS** |
| Citation construction (localized, per-chunk) | **PASS** |
| **Final source override** — model's claim is overridden client-side | **PASS** — `chatAnswerComposition.ts:118–124` |
| General-answer behaviour clears citations | **PASS** |
| Not-found / clarification behaviour | **PASS** |
| Deterministic fallback when AI unavailable | **PASS** |
| 15-second timeout | **CONFIRMED (code)** — `assistantChat.ts:110` |
| Chat persistence + owner isolation | **PASS live** — assistant tests 5, 6 |
| Input validation before any OpenRouter call | **PASS live** — assistant tests 1–4 |

### Feature reality check

| Feature | Status | Evidence |
|---|---|---|
| **Streaming** | **NOT IMPLEMENTED** | 0 matches for `stream: true`, `text/event-stream`, `ReadableStream`, `EventSource` across `src/`, `supabase/functions/`, `backend/` |
| **Persisted feedback** | **PARTIAL (UI only)** | Thumbs up/down render; `handleFeedback(_messageId, _positive)` ignores both arguments and shows a toast (`AIAssistant.tsx:169–173`). 0 persistence calls. |
| **Confidence scores** | **NOT IMPLEMENTED (chat)** | `risk_confidence` column exists but `creditScoring.ts:427` always writes `null`. Chat exposes no confidence. OCR/employment extraction do return confidence values. |
| **Chat export** | **NOT IMPLEMENTED** | 0 matches; only per-message clipboard copy |
| **Administrative ingestion screen** | **NOT IMPLEMENTED** | 0 matches in `src/pages`/`src/components`. Ingestion is a manual CLI script (`npm run ingest:policies`) |
| **Scheduled reports** | **NOT IMPLEMENTED** | 0 matches for cron/schedule/pg_cron |

---

## PHASE 12 — Security and Privacy QA

| ID | Finding | Status | Severity |
|---|---|---|---|
| **SEC-01** | **RLS role source is user-writable `user_metadata`** | **CONFIRMED (code) — NOT exploited** | **CRITICAL** |
| **SEC-02** | **FastAPI trusts a client-supplied `X-User-Role` header** | **CONFIRMED — verified live** | **CRITICAL** |
| SEC-03 | Deployed OTP function accepts expired codes | **CONFIRMED — verified live** | **HIGH** |
| SEC-04 | Demo recovery delivers codes for *any* account to one fixed inbox | **CONFIRMED (by design, documented)** | **HIGH** (prototype-only) |
| SEC-05 | CORS wildcard everywhere | **CONFIRMED** | Medium |
| SEC-06 | 3 of 5 Edge Functions perform no in-function caller verification | **CONFIRMED** | Medium |
| SEC-07 | Raw OCR text (full national-ID PII) logged at INFO | **CONFIRMED (code)** | Medium |
| SEC-08 | No storage-bucket RLS policies in version control | **CONFIRMED** | Medium |
| SEC-09 | No file-size limit on uploads | **CONFIRMED** | Medium |
| SEC-10 | Secrets not exposed in browser bundle | **PASS** | Info |
| SEC-11 | SQL injection protections in the modification RPC | **PASS** | Info |
| SEC-12 | Audit-log immutability | **PASS by design** | Info |
| SEC-13 | No account enumeration on recovery | **PASS (verified live)** | Info |

### SEC-02 — FastAPI authorisation, verified live in-process

Probing `POST /documents/extract-id` with different headers:

| `X-User-Role` sent | HTTP response |
|---|---|
| *(no header)* | **403** |
| `risk_department` | **403** |
| `audit_department` | **403** |
| `branch_employee` | **400** (authorisation passed; rejected only for an empty file) |

`backend/services/auth.py:10–18` checks membership in a two-element set. **There is no JWT verification and no cryptographic binding to a Supabase session**, even though `src/lib/accountApi.ts:106–111` does forward a bearer token — the server ignores it. Combined with `allow_origins=["*"]` (`backend/main.py:47–53`), any client that can reach the service can drive OCR, LLM extraction (spending credits), PDF generation, and PDF retrieval by asserting a role string.

**Note:** `allow_origins=["*"]` together with `allow_credentials=True` is an invalid CORS combination — browsers reject wildcard-with-credentials, so the credentialed path silently does not work as written.

### SEC-06 — Edge Function caller verification

| Function | In-function caller check |
|---|---|
| `admin-users` | ✅ verifies JWT then requires `profiles.role = 'branch_manager'` via service-role read |
| `assistant-chat` | ❌ none |
| `credit-assessment` | ❌ none |
| `policy-search` | ❌ none — and it executes **service-role** queries |
| `demo-password-reset` | ❌ none (intentional — that is the flow) |

Supabase's platform JWT gate applies unless a function was deployed with `--no-verify-jwt`. **`supabase/config.toml` does not exist and no deploy script is in VCS, so the deployed flags are unknown — NOT TESTED.** If `policy-search` were deployed without JWT verification it becomes an unauthenticated endpoint running privileged queries and consuming OpenRouter credits per request.

### SEC-07 — PII in logs

`backend/routers/documents.py:63–68` and `:104–109` log the **complete raw OCR text** of an identity document at INFO level; `:115` additionally logs extracted first/last name, DOB, father, mother, and ID number. No redaction, no retention policy.

**Not exercised during this audit** — the running FastAPI log contained **0** `raw_text` entries because no document was uploaded.

### SEC-09 — Upload validation

`ALLOWED_TYPES` restricts to JPEG/PNG/PDF by content-type *or* file extension (`documents.py:20–25`, `:36`, `:161`). **A `grep` for `max_size|MAX_FILE|content_length|limit` returned 0 matches** — there is no file-size cap, so an arbitrarily large upload is read fully into memory and pushed through OpenCV.

### SEC-11 — SQL injection (positive finding)

`review_loan_modification_request()` validates `field_name` against a 10-entry allow-list, re-validates the column against `information_schema.columns`, and builds the UPDATE with `format('UPDATE public.%I SET %I = $1::%s WHERE id = $2', ...)` — identifier quoting plus a parameterised value. **No injection surface.**

### DATA-01 — Suspected leftover test row (unverified)

The failing test API-03 inserted a `bank_customers` row with `customer_name = 'Short Id'`, `national_id = '123'`. The suite's cleanup deletes only `national_id LIKE '999%'`, so **this row is very likely still present in the live database**, holding a real `BOP-1NNNNN` account number.

**This could not be confirmed.** The read-only verification script was blocked by the environment's safety classifier, and that denial was respected rather than circumvented.

**Operator action required — run manually in the Supabase SQL Editor:**

```sql
-- Inspect (read-only) before deleting anything:
SELECT id, account_number, customer_name, national_id, created_at
FROM public.bank_customers
WHERE customer_name IN ('Short Id', 'No National Id', 'Duplicate Attempt', 'Should Be Blocked')
   OR char_length(national_id) < 7
   OR national_id LIKE '999%';

-- Also confirm no QA workflow rows survived:
SELECT id, status, account_number FROM public.approval_requests
WHERE notes LIKE '[qa-integration-test]%';
```

Also note: the account-opening and loan-workflow suites **permanently consumed `BOP-1NNNNN` sequence values**. Deleting the rows does not rewind the sequence. This was disclosed to and accepted by the operator before execution.

---

## PHASE 13 — Performance and Reliability QA

Only safe local measurements were taken. **No load test was run.**

| Item | Measured / observed | Status |
|---|---|---|
| Deterministic calculation execution | 229 unit tests in **361 ms** total — pure, synchronous, no I/O | OBSERVATION |
| FastAPI `/health` | Reachable, `{"status":"ok","llm_fallback_configured":true}` | PASS |
| FastAPI unknown route | HTTP 404, no crash | PASS |
| API response behaviour | RLS suite 24 tests in 9.3s; workflow 8 tests in 9.7s (includes 4 logins/test) | OBSERVATION — **not a latency benchmark** |
| OCR processing with fixtures | **NOT TESTED** — fixtures exist but no test drives them |
| AI timeout handling | 12 s (credit), 15 s (assistant) — code-confirmed, not exercised | OBSERVATION |
| Retry behaviour | One fallback-model retry on `upstream_error`/`network_error` only; never on 401/402/429 | **PASS** — 5 pytest tests |
| Fallback behaviour | Deterministic explanation + template chat answer | **PASS** — unit tested |
| Realtime subscriptions | 14 channels across 6 tables | OBSERVATION — not tested |
| Bundle size | **1,047.30 kB (305.89 kB gzip)**, Vite warns >500 kB | OBSERVATION |
| Code splitting | **1 chunk**; no `manualChunks`, no `rollupOptions` | **NOT IMPLEMENTED** |
| In-memory document store | `store.py:30` module-level dict | **CONFIRMED LIMITATION** |
| Multiple-worker limitation | Two replicas cannot share document state → **single-instance by construction** | **CONFIRMED** |
| Restart behaviour | All in-flight documents and PDFs lost | **CONFIRMED** |
| Missing-service behaviour | Frontend surfaces "OCR API server is not running" | PASS (code) |

### Non-functional targets — explicitly NOT validated

| SRS target | Status | Why |
|---|---|---|
| **500 ms API response** | **NOT TESTED** | No latency benchmark was run. Observed durations include auth round-trips and are not comparable. |
| **50,000 concurrent users** | **NOT TESTED / FUTURE TARGET** | No load test. **Architecturally contradicted** for the document service, which cannot run more than one instance. |
| **99.98% uptime** | **NOT TESTED / FUTURE TARGET** | No monitoring, no uptime instrumentation, no SLA measurement exists. |
| **RTO of 1 hour** | **NOT TESTED / FUTURE TARGET** | No documented or tested recovery procedure. |
| **RPO of 15 minutes** | **NOT TESTED / FUTURE TARGET** | No backup/restore configuration in-repo. |
| **80% code coverage** | **NOT MEASURED** | **No coverage tool is installed or configured** — no `c8`, `nyc`, `istanbul`, `--experimental-test-coverage`, or `pytest-cov`. No coverage number can be claimed. |

---

## PHASE 14 — UI and Accessibility QA

**Command:** `npm run e2e` (Playwright, Chromium, HTTPS dev server auto-started)

### Three full runs were executed, and they did not agree

| Run | Configuration | Passed | Failed | Skipped | Failing tests |
|---|---|---|---|---|---|
| 1 | default (`fullyParallel: true`) | **43** | 1 | 6 | `smoke-all-pages :: Audit Monitoring` |
| 2 | default, JSON reporter | 41 | 3 | 6 | `dashboard :: risk_department`, `monitoring`, `role-access :: risk /audit-log` |
| 3 | `--workers=1` | 39 | 5 | 6 | 3× `auth.spec`, `audit.spec`, `credit-risk.spec` |

**A different set of tests failed each time**, and serial execution was *worse* than parallel — ruling out simple parallel contention.

### Root cause established

| Diagnostic | Result |
|---|---|
| Re-ran run-1's failing test in isolation, 3× | **3/3 PASSED** (5.1s, 4.8s, 5.1s) |
| Re-ran run-3's failing `auth.spec.ts` after a cooldown | **4/4 PASSED** (14.6s) |
| Failure signature | Login submits, page stays on `/auth`, 5 s URL assertion times out. In one case even the *invalid-credentials* alert failed to appear — i.e. the auth request itself did not complete. |

**Conclusion: the failures are caused by Supabase Auth (GoTrue) throttling, induced by this audit's own ~150 sign-ins across four shared accounts within a few minutes — not by any product defect.** Every failing test passes once the auth endpoint recovers.

**This is nevertheless a real test-suite reliability defect** and must be reported as such: `playwright.config.ts` sets `fullyParallel: true` with `workers: undefined` (unbounded locally) and every test logs in fresh. `playwright.api.config.ts` already solved this exact problem by forcing `workers: 1` and documenting why; the UI config never received the same treatment. Recommended fixes: cache/reuse `storageState` per role instead of re-authenticating per test, and bound `workers`.

### Page-level results (best observed run)

| Area | Result |
|---|---|
| Login page renders (email, password, button) | **PASS** |
| Invalid credentials show an error without navigating | **PASS** |
| Authenticated user redirected away from `/auth` | **PASS** |
| Login as `branch_employee` reaches dashboard | **PASS** |
| Role-based dashboard (4 roles) | **PASS** |
| Navigation | **PASS** (3 tests) |
| Unauthorized routes redirect | **PASS** (7 role-access tests) |
| Credit assessment page opens; New Assessment dialog opens | **PASS** |
| Approvals page | **PASS** (3 tests) |
| Documents page | **PASS** (2 tests) |
| AI Assistant page | **PASS** (2 tests) |
| User Management page | **PASS** (2 tests) |
| Audit Log page | **PASS** |
| Audit Loan Approvals page (tabs render) | **PASS** |
| Audit Monitoring page | **PASS** |
| Smoke: every major page opens for its role | **PASS** (10 tests) |

### The 6 skipped E2E tests are unconditional `test.skip(...)` in source — not environment-gated

| Spec | Skipped test |
|---|---|
| `credit-risk.spec.ts:33` | submits a new credit assessment end-to-end |
| `approvals.spec.ts:39` | approves a pending request |
| `audit.spec.ts:23` | audit-approves a request with a decision note |
| `documents.spec.ts:33` | completes the account-opening wizard end-to-end |
| `user-management.spec.ts:31` | creates a new user |
| `ai-assistant.spec.ts:33` | receives and displays a policy-grounded answer with citations |

**Every write-path user journey is unimplemented at the UI level.** The E2E suite proves pages *render* and routes are *guarded*; it does not prove any business flow completes through the interface. (The equivalent flows are covered at the API layer by suites API-03 to API-06.)

### Not covered by any test

| Item | Status |
|---|---|
| Arabic/English switching | **NOT TESTED** |
| RTL behaviour | **NOT TESTED** |
| Responsive / mobile layout | **NOT TESTED** |
| Mobile navigation | **NOT TESTED** |
| Onboarding tour | **NOT TESTED** |
| Global help overlay | **NOT TESTED** (unit-tested only at `helpDialogDetection.ts`) |
| Dialog accessibility, button labels, keyboard navigation | **NOT TESTED** |
| Form validation messages, loading states, empty states | **NOT TESTED** |

### Onboarding-tour interference — recorded separately as requested

**No onboarding-tour interference was observed in any of the three runs.** All observed failures had the auth-throttling signature described above. Since the tour is session-scoped (`onboardingSession.ts`) and every E2E test starts a fresh browser context, the tour *can* appear on first visit; it did not cause a failure here. **Status: NOT REPRODUCED in this audit** — retained as a watch item, not a current defect.

### Accessibility

**No accessibility audit was run.** No axe-core, no Lighthouse, no WCAG tooling is present in the repository. **WCAG 2.1 AA compliance cannot be claimed and must not be stated in the SRS.**

---

## PHASE 15 — Documentation and SRS Gap Analysis

> No SRS file exists in the repository (`SRS.md`, `SRS.pdf`, `docs/` all absent). `QA/SRS_Baseline.md` states the requirements were *reconstructed* from code. The table below evaluates claims commonly present in the SRS text and in `PROJECT_ROADMAP.md`, against evidence gathered here.

| SRS section | SRS claim | QA evidence | Actual status | Required correction / recommended wording |
|---|---|---|---|---|
| Executive Summary | "AI-powered credit scoring" | AI is narrative-only; sealed by `mergeAiNarrativeIntoSnapshot`; 229 tests incl. injection immunity | **CONTRADICTED BY IMPLEMENTATION** | "Credit risk is computed by a deterministic, itemised calculation engine. AI produces an optional natural-language explanation of an already-final result and cannot alter any figure." |
| Executive Summary | ML / LightGBM model | 0 matches for every ML framework | **NOT IMPLEMENTED** | "The system contains no machine-learning model, training pipeline, or weights file. Scoring is a documented weighted formula reproducible by hand." |
| Proposed Solution | 4-stage approval workflow | 8/8 live workflow tests + 2 integration tests | **IMPLEMENTED AND VERIFIED** | Keep. Add: "Verified end-to-end against the live database on 2026-08-26." |
| Tools & Technologies | Azure | 0 matches | **NOT IMPLEMENTED** | Remove all Azure references. "The platform runs on Supabase (managed) with a locally hosted FastAPI document service." |
| Tools & Technologies | Docker / containerisation | No Dockerfile; Docker used only in a throwaway test script | **NOT IMPLEMENTED** | "Neither service is containerised. Docker appears only in a local test script that reproduces a database-sequence defect." |
| Tools & Technologies | Redis / caching layer | 0 matches | **NOT IMPLEMENTED** | "No external cache. PostgreSQL is the only data store." |
| Tools & Technologies | FastAPI as "the backend" | 8 endpoints; writes to no database | **PARTIALLY IMPLEMENTED** (scope narrower than claim) | "FastAPI is a single-purpose document service (OCR, employment-proof extraction, PDF generation). It holds no data and performs no database write." |
| Architecture | Supabase as primary backend | Verified live across auth, RLS, Realtime, Storage, 5 Edge Functions | **IMPLEMENTED AND VERIFIED** | Keep. |
| Architecture | Scalability / 50,000 concurrent users | Document service keeps state in a process-local dict | **CONTRADICTED BY IMPLEMENTATION** | "The frontend and Supabase scale as static/managed components. The document service is single-instance by design and requires externalised state before it can be replicated. No load testing has been performed." |
| Database | RLS on all sensitive tables | 22/22 live RLS tests | **IMPLEMENTED AND VERIFIED** | Keep. |
| Database | Input-validation constraints | **Live insert of a 3-char national_id succeeded** | **PARTIALLY IMPLEMENTED** | "Validation constraints are defined in migration `20260716100000`. As of 2026-08-26 they were verified **absent** from the live database; the migration must be applied." |
| Database | Migrations define the schema | `approval_requests` has no `CREATE TABLE`; 2 migrations exist solely to remove out-of-band objects | **PARTIALLY IMPLEMENTED** | "The migration set is a partial, corrective record layered over a schema partly created outside version control. It is not sufficient to provision a fresh environment." |
| Functional Reqs | Deterministic EMI / DBR 50% / age 70 | 33 engine tests incl. both boundaries | **IMPLEMENTED AND VERIFIED** | Keep. |
| Functional Reqs | Policy-grounded RAG assistant | Intent + composition unit-tested; live retrieval not exercised | **IMPLEMENTED BUT PARTIALLY VERIFIED** | "Implemented with pgvector retrieval and a local keyword fallback. Live embedding retrieval was not exercised in QA to avoid external AI cost." |
| Functional Reqs | Streaming responses | 0 matches | **NOT IMPLEMENTED** | "Answers are returned complete; streaming is not implemented." |
| Functional Reqs | User feedback capture | Handler ignores both arguments; 0 persistence calls | **CONTRADICTED BY IMPLEMENTATION** | "Feedback controls appear in the interface but are not connected to storage. No feedback is recorded." |
| Functional Reqs | Reports / export | 0 matches; only clipboard copy | **NOT IMPLEMENTED** | "No reporting or export capability exists. PDF generation is limited to the account-opening form." |
| Functional Reqs | Demo password recovery | 6/8 live tests pass; **2 fail** | **PARTIALLY IMPLEMENTED** | "Prototype-only. As of 2026-08-26 the deployed function does not create a code row on request and accepts expired codes; the deployed build does not match the repository source." |
| Non-Functional | 500 ms API response | No benchmark run | **NOT TESTED** | Mark as **FUTURE TARGET — not measured**. |
| Non-Functional | 99.98% uptime | No monitoring exists | **NOT TESTED / FUTURE WORK** | Mark as **FUTURE TARGET**. |
| Non-Functional | RTO 1h / RPO 15min | No procedure, no backup config | **NOT TESTED / FUTURE WORK** | Mark as **FUTURE TARGET**. |
| Non-Functional | 80% code coverage | **No coverage tool installed** | **NOT MEASURED** | "Coverage is not instrumented. 402 automated test cases exist (229 unit, 46 backend, 77 API/integration, 50 UI E2E). No percentage may be claimed." |
| Non-Functional | Monitoring / observability | No tooling; a debug `console.log` still ships | **NOT IMPLEMENTED** | "No monitoring, error tracking, or alerting is configured." |
| Non-Functional | WCAG 2.1 AA | No accessibility audit tooling | **NOT TESTED** | Remove any compliance claim. "Accessibility has not been formally audited." |
| Testing Process | CI/CD pipeline | `.github/` absent; no CI config of any kind | **NOT IMPLEMENTED** | "GitHub is used for source control only. There is no CI/CD pipeline; lint, type-check, build, and tests are executed manually." |
| Testing Process | Build passes | `npm run build` exit 0 | **IMPLEMENTED AND VERIFIED** | "The production build succeeds. Note that TypeScript type-checking and ESLint currently fail and are not enforced by any gate." |
| Testing Process | Automated test suite | 388/392 passing | **IMPLEMENTED AND VERIFIED** | Use the exact numbers in §17. |
| Risk Management | Security posture | SEC-01 Critical, SEC-02 Critical | **CONTRADICTED** if "secure" is claimed | "Two critical authorisation weaknesses are open: RLS trusts a user-writable JWT claim, and the document service trusts an unsigned role header." |
| Work Breakdown / User Manual | — | Not assessed | **NOT TESTED** | Out of QA scope. |

---

## PHASE 16 — SRS Test-Result Tables (ready to copy)

### Table 1 — Authentication

| ID | Test Case | Type | Preconditions | Steps | Test Data | Expected | Actual | Status | Evidence | Priority |
|---|---|---|---|---|---|---|---|---|---|---|
| TC-AUTH-01 | Valid login issues a session with matching role claim | API | 4 role accounts exist | `signInWithPassword` per role; read role claim | 4 role credentials (redacted) | Session issued; claim matches role | 4/4 succeeded | **PASS** | `test:api` | High |
| TC-AUTH-02 | Invalid password rejected | API | Account exists | Sign in with wrong password | redacted | No session | No session | **PASS** | `auth.api.spec.ts:17` | High |
| TC-AUTH-03 | Anonymous cannot read protected table | API | — | Anon SELECT | — | 0 rows / error | 0 rows | **PASS** | `auth.api.spec.ts:27` | High |
| TC-AUTH-04 | Session retrieval reflects issued session | API | Logged in | `getSession()` | — | Session returned | Session returned | **PASS** | `auth.api.spec.ts:45` | Medium |
| TC-AUTH-05 | UI login reaches dashboard | E2E | Dev server up | Fill form, submit | employee creds | Redirect `/dashboard` | Reached | **PASS** | `auth.spec.ts:34` | High |
| TC-AUTH-06 | Invalid credentials show an error, no navigation | E2E | Dev server up | Submit bad creds | — | Alert visible, stay on `/auth` | Alert shown | **PASS** | `auth.spec.ts:17` | Medium |
| TC-AUTH-07 | Password minimum length | Static | — | Inspect login schema | — | Documented minimum | **6 characters** | **PASS (=6)** | `Auth.tsx:17` | Medium |
| TC-AUTH-08 | Role change requires re-auth | API | — | — | — | New role not effective until re-login | Not tested — reason: unconditional `test.skip` in `auth.api.spec.ts:57`; never implemented | **SKIPPED** | — | Medium |
| TC-AUTH-09 | Suspended user cannot log in | API | — | — | — | Login blocked | Not tested — reason: no code path reads `profiles.status`; feature does not exist | **NOT TESTED** | `AUTH-OBS-1` | High |
| TC-AUTH-10 | Logout clears session | E2E | Logged in | Click logout | — | Redirect to `/auth` | Not tested — reason: no E2E logout test exists | **NOT TESTED** | — | Medium |

### Table 2 — Credit Assessment (deterministic engine)

| ID | Test Case | Type | Preconditions | Steps | Test Data | Expected | Actual | Status | Evidence | Priority |
|---|---|---|---|---|---|---|---|---|---|---|
| TC-CR-01 | EMI matches textbook annuity formula | Unit | — | `calculateLoanPayment` | P=100000, r=12%, n=1y | Exact match | Match | **PASS** | `loanEngine.test.ts:36` | High |
| TC-CR-02 | Zero-interest straight-line split | Unit | — | Same | P=12000, r=0, n=1y | 1000/mo, 0 interest | Exact | **PASS** | `:50` | High |
| TC-CR-03 | Total repayment identity | Unit | — | Same | P=45000, 8.5%, 7y | `interest = repaid − P` | Holds | **PASS** | `:57` | Medium |
| TC-CR-04 | Negative / zero inputs safe | Unit | — | Same | P=−500; n=0 | 0, no NaN/throw | 0 | **PASS** | `:73` | Medium |
| TC-CR-05 | **DBR exactly 50% → eligible** | Unit | — | `evaluateEligibility` | 1000+1000 / 4000 | eligible | eligible | **PASS** | `:86` | High |
| TC-CR-06 | **DBR above 50% → not eligible** | Unit | — | Same | ratio > 0.5 | not_eligible + reason | not_eligible | **PASS** | `:99` | High |
| TC-CR-07 | **Age at maturity exactly 70 → eligible** | Unit | — | Same | age+term = 70 | eligible | eligible | **PASS** | `:112` | High |
| TC-CR-08 | **Age at maturity 71 → not eligible** | Unit | — | Same | age+term = 71 | not_eligible | not_eligible | **PASS** | `:125` | High |
| TC-CR-09 | Unknown age skips the rule | Unit | — | Same | age = null | Rule skipped | Skipped | **PASS** | `:138` | Medium |
| TC-CR-10 | Score clamped to [0,100] | Unit | — | `computeFormulaRiskScore` | extremes | In range | In range | **PASS** | `:169` | High |
| TC-CR-11 | Category thresholds low/medium/high | Unit | — | Same | boundary scores | 40 / 70 bands | Correct | **PASS** | `:186` | High |
| TC-CR-12 | Ineligible forces High regardless of score | Unit | — | `applyEligibilityOverride` | medium score + ineligible | category=high | high | **PASS** | `:198` | High |
| TC-CR-13 | Ineligible forces reject recommendation | Unit | — | `serializeRiskExplanation` | ineligible | reject | reject | **PASS** | `:336` | High |
| TC-CR-14 | Score is additive and itemised | Unit | — | Sum contributions | — | base+Σ = score | Holds | **PASS** | `:212` | Medium |
| TC-CR-15 | Rate resolution for all product×currency | Unit | — | `resolveEffectiveAnnualRate` | 3×3 | All resolve | All resolve | **PASS** | `:221` | Medium |
| TC-CR-16 | **AI cannot alter any figure** | Unit | — | `mergeAiNarrativeIntoSnapshot` | adversarial narrative | Only 3 fields change | Only 3 changed | **PASS** | `:389`, `:404`, `:431` | **Critical** |

### Table 3 — Internal AI Assistant

| ID | Test Case | Type | Preconditions | Steps | Test Data | Expected | Actual | Status | Evidence | Priority |
|---|---|---|---|---|---|---|---|---|---|---|
| TC-AI-01 | `assistant-chat` rejects a request missing `query` | API | Function deployed | POST without query | `{}` | 400, no LLM call | 400 | **PASS** | `test:assistant` | High |
| TC-AI-02 | `assistant-chat` rejects non-POST | API | Deployed | GET | — | 405 | 405 | **PASS** | same | Medium |
| TC-AI-03 | `policy-search` rejects missing `query` | API | Deployed | POST without query | `{}` | 400 | 400 | **PASS** | same | High |
| TC-AI-04 | `policy-search` rejects non-POST | API | Deployed | GET | — | 405 | 405 | **PASS** | same | Medium |
| TC-AI-05 | Chat history persists, owner-only | API | Employee session | Insert conversation + messages, read as owner | QA-namespaced | Persisted, owner-only | Persisted | **PASS** | same | High |
| TC-AI-06 | Message role constrained to user/assistant | API | Session | Insert role='system' | — | Rejected | Rejected | **PASS** | same | Medium |
| TC-AI-07 | Intent classification (6 intents) | Unit | — | `classifyIntent` | EN+AR samples | Correct intent | Correct | **PASS** | `chatHybrid.test.ts` | High |
| TC-AI-08 | Source override when customer not found | Unit | — | `resolveFinalSource` | not_found | Forced `not_found` | Forced | **PASS** | `chatHybrid.test.ts` | High |
| TC-AI-09 | Live answer composition returns real text | API | Credits enabled | Ask a greeting | — | Non-empty answer | Not tested — reason: `RUN_LIVE_OPENROUTER_TESTS=false`; no external AI credits spent by policy | **SKIPPED** | `test:assistant` | Low |
| TC-AI-10 | Streaming responses | — | — | — | — | Tokens streamed | Not tested — reason: feature not implemented (0 code matches) | **NOT APPLICABLE** | Phase 11 | Low |
| TC-AI-11 | Feedback persisted | — | — | Click thumbs up | — | Row stored | Not tested — reason: handler discards both arguments; no storage exists | **NOT APPLICABLE** | `AIAssistant.tsx:169` | Low |

### Table 4 — Account Opening / OCR

| ID | Test Case | Type | Preconditions | Steps | Test Data | Expected | Actual | Status | Evidence | Priority |
|---|---|---|---|---|---|---|---|---|---|---|
| TC-ACC-01 | Exact national-ID match returns real data | API | Seed row present | SELECT by national_id | `402156789012` | BOP-100001, income 4500 | Match | **PASS** | `test:account-opening` | High |
| TC-ACC-02 | Unknown national ID returns null, never fabricated | API | — | SELECT | QA id | null | null | **PASS** | same | High |
| TC-ACC-03 | New customer gets DB-generated `BOP-1#####` | API | Employee session | INSERT without account_number | QA row | Trigger assigns number | Assigned | **PASS** | same | High |
| TC-ACC-04 | Unresolved profile stored as honest sentinel | API | Employee session | INSERT unresolved | QA row | `unresolved_needs_review` | Correct | **PASS** | same | High |
| TC-ACC-05 | Duplicate national ID rejected at DB (23505) | API | Row exists | INSERT duplicate | QA id | Error 23505 | 23505 | **PASS** | same | High |
| TC-ACC-06 | Missing national_id rejected (NOT NULL) | API | Employee session | INSERT without id | — | Error | Error | **PASS** | same | High |
| TC-ACC-07 | **national_id shorter than 7 chars rejected** | API | Employee session | INSERT `'123'` | `'123'` | CHECK violation | **Insert SUCCEEDED — constraint absent from live DB** | **FAIL** | `test:account-opening`, `API-03` | **High** |
| TC-ACC-08 | risk_department cannot open an account | API | Risk session | INSERT | QA row | Blocked | Blocked | **PASS** | same | High |
| TC-ACC-09 | audit_department cannot open an account | API | Audit session | INSERT | QA row | Blocked | Blocked | **PASS** | same | High |
| TC-ACC-10 | Name-only match never auto-applied | Unit | — | `resolveEmploymentMatch` | 1 name hit | `possible_match` | Correct | **PASS** | pure block | High |
| TC-ACC-11 | Ambiguous names surfaced, not applied | Unit | — | Same | 2 name hits | `ambiguous` | Correct | **PASS** | pure block | High |
| TC-ACC-12 | Salary mismatch >15% flagged | Unit | — | `isSalaryMismatch` | 4000 vs 3000 | true | true | **PASS** | pure block | Medium |
| TC-ACC-13 | ID OCR on a real image | Integration | Tesseract, fixture | Upload, extract | synthetic fixture | Fields extracted | Not tested — reason: no test drives the fixtures; live OCR not exercised to avoid handling identity documents | **NOT TESTED** | `backend/test_images/` | Medium |
| TC-ACC-14 | Account-opening wizard end-to-end (UI) | E2E | Dev server, creds | Complete wizard | synthetic | Customer created | Not tested — reason: unconditional `test.skip` at `documents.spec.ts:33` | **SKIPPED** | — | High |
| TC-ACC-15 | Unemployed customer path | API | — | INSERT unemployed | — | `BOP-N`, not loan-eligible | Not tested — reason: no test covers `unemployed_customers` | **NOT TESTED** | — | Medium |

### Table 5 — Branch Manager Approval

| ID | Test Case | Type | Preconditions | Steps | Test Data | Expected | Actual | Status | Evidence | Priority |
|---|---|---|---|---|---|---|---|---|---|---|
| TC-BM-01 | New request enters `pending_branch_manager_approval` | API | Employee session | INSERT | QA request | Status set, scoring fields present | Confirmed | **PASS** | `test:loan-workflow` #1 | High |
| TC-BM-02 | Manager approval → `pending` | API | Gated row | UPDATE as manager | — | `pending`, `manager_decision_by` set | Confirmed | **PASS** | #3 | High |
| TC-BM-03 | Row becomes visible to Risk after approval | API | Approved | SELECT as risk | — | 1 row | 1 row | **PASS** | #3 | High |
| TC-BM-04 | Manager rejection is soft | API | Gated row | Reject | — | `rejected`, row kept | Kept | **PASS** | #4 | High |
| TC-BM-05 | Manager cannot re-decide past their gate | API | Row now `pending` | UPDATE as manager | — | Blocked | Blocked | **PASS** | #8 | High |
| TC-BM-06 | Manager approval via UI | E2E | Dev server | Click approve | — | Status changes | Not tested — reason: unconditional `test.skip` at `approvals.spec.ts:39` | **SKIPPED** | — | Medium |

### Table 6 — Risk Department Approval

| ID | Test Case | Type | Preconditions | Steps | Test Data | Expected | Actual | Status | Evidence | Priority |
|---|---|---|---|---|---|---|---|---|---|---|
| TC-RD-01 | Risk cannot see a manager-gated row | API | Gated row | SELECT as risk | — | 0 rows | 0 rows | **PASS** | `test:loan-workflow` #2 | High |
| TC-RD-02 | Risk cannot update a manager-gated row | API | Gated row | UPDATE as risk | — | Blocked | Blocked | **PASS** | #2 | High |
| TC-RD-03 | Risk approval → `pending_audit_approval` | API | `pending` row | Approve as risk | — | Status + `risk_decision_by` | Confirmed | **PASS** | #3 | High |
| TC-RD-04 | Row becomes visible to Audit | API | Approved | SELECT as audit | — | 1 row | 1 row | **PASS** | #3 | High |
| TC-RD-05 | Risk rejection is soft | API | `pending` row | Reject | — | `rejected`, kept | Kept | **PASS** | #5 | High |
| TC-RD-06 | **DB blocks approving an ineligible row without an override reason** | API | ineligible row | Approve without reason | — | CHECK violation | Not tested — reason: **constraint is dead** (keys on unreachable status `'approved'`); testing it would assert broken behaviour. See WF-01 | **FAIL (by inspection)** | `20260727150000:32–34` | **High** |
| TC-RD-07 | Client gate requires an override reason | Unit | — | `canSubmitApproval` | ineligible, empty reason | false | false | **PASS** | `riskDecisionGate.test.ts` | High |

### Table 7 — Audit Department Approval

| ID | Test Case | Type | Preconditions | Steps | Test Data | Expected | Actual | Status | Evidence | Priority |
|---|---|---|---|---|---|---|---|---|---|---|
| TC-AD-01 | Audit sees only post-Risk rows and its own rejections | API | Mixed rows | SELECT as audit | — | Filtered set | Correct | **PASS** | `test:rls` #13 | High |
| TC-AD-02 | Audit approval → `audit_approved` (final) | API | `pending_audit_approval` | Approve | — | Status + `approved_at` + `audit_decision_by` | Confirmed | **PASS** | `test:loan-workflow` #3 | High |
| TC-AD-03 | Audit rejection is soft; note persists; `approved_at` null | API | Audit-gated row | Reject with note | note text | `rejected`, note kept, `approved_at` null | Confirmed | **PASS** | #6 | High |
| TC-AD-04 | Audit cannot act on a manager-gated row | API | Gated row | Approve as audit | — | Blocked | Blocked | **PASS** | #7 | High |
| TC-AD-05 | Audit cannot approve a row missing eligibility data | API | row w/ null eligibility | Approve | — | CHECK violation | Not tested — reason: would require seeding an invalid row; constraint reviewed and **is effective** (keys on the live status `audit_approved`) | **NOT TESTED** | `20260727160000:156` | Medium |
| TC-AD-06 | Audit approval via UI | E2E | Dev server | Click approve + note | — | Status changes | Not tested — reason: unconditional `test.skip` at `audit.spec.ts:23` | **SKIPPED** | — | Medium |

### Table 8 — Loan Modification / Re-analysis

| ID | Test Case | Type | Preconditions | Steps | Test Data | Expected | Actual | Status | Evidence | Priority |
|---|---|---|---|---|---|---|---|---|---|---|
| TC-MOD-01 | Only `risk_department` may review | API | — | Call RPC as non-risk | — | Exception | Not tested — reason: no automated test exists for the RPC | **NOT TESTED** | `20260619102000:46` | High |
| TC-MOD-02 | Field allow-list enforced | API | — | Review with disallowed field | — | Exception | Not tested — reason: no test exists. Allow-list reviewed in source | **NOT TESTED** | same | High |
| TC-MOD-03 | SQL injection via `field_name` | API | — | Malicious field name | — | Rejected | Not tested — reason: no test exists. `%I` quoting + `information_schema` re-validation reviewed; no injection surface identified | **NOT TESTED** | same | High |
| TC-MOD-04 | Approved modification triggers re-analysis | Integration | — | Approve scoring field | — | Score recomputed, history row | Not tested — reason: `modificationReanalysis.ts` has no test coverage | **NOT TESTED** | — | High |
| TC-MOD-05 | Failed re-analysis marks `failed`, never shows a stale score | Integration | — | Force failure | — | `reanalysis_status='failed'` | Not tested — reason: as above | **NOT TESTED** | — | High |
| TC-MOD-06 | Rejected modification leaves the case unchanged | API | — | Reject | — | Source row untouched | Not tested — reason: no test exists. Verified by inspection (mutation is inside the `IF approve` branch) | **NOT TESTED** | same | Medium |
| TC-MOD-07 | Reason is mandatory | Schema | — | Insert without reason | — | NOT NULL violation | Not tested — reason: no test; `reason TEXT NOT NULL` confirmed in schema | **NOT TESTED** | `20260619101000` | Medium |

### Table 9 — Role-Based Access Control

| ID | Test Case | Type | Expected | Actual | Status | Evidence | Priority |
|---|---|---|---|---|---|---|---|
| TC-RBAC-01 | Anon sees 0 rows in `profiles` | API | 0 rows | 0 rows | **PASS** | `test:rls` #1 | High |
| TC-RBAC-02 | Anon sees 0 rows in `approval_requests` | API | 0 rows | 0 rows | **PASS** | #2 | High |
| TC-RBAC-03 | Anon sees 0 rows in `audit_logs` | API | 0 rows | 0 rows | **PASS** | #3 | High |
| TC-RBAC-04 | Anon sees 0 rows in `documents` | API | 0 rows | 0 rows | **PASS** | #4 | High |
| TC-RBAC-05 | Anon UPDATE on `approval_requests` blocked | API | Blocked | Blocked | **PASS** | #5 | **Critical** |
| TC-RBAC-06 | Anon INSERT into `profiles` blocked | API | Blocked | Blocked | **PASS** | #6 | High |
| TC-RBAC-07 | Employee/risk/audit see only own profile | API | 1 own row | Own only | **PASS** | #7–#9 | High |
| TC-RBAC-08 | Manager sees all profiles | API | All rows | Matches admin ground truth | **PASS** | #10 | Medium |
| TC-RBAC-09 | Employee sees only own requests | API | Own only | Own only | **PASS** | #11 | High |
| TC-RBAC-10 | Risk never sees manager-gated rows | API | Filtered | Filtered | **PASS** | #12 | High |
| TC-RBAC-11 | `audit_logs` readable by risk only | API | Risk yes; others 0 | Correct | **PASS** | #16–#19 | High |
| TC-RBAC-12 | Audit sees 0 documents | API | 0 rows | 0 rows | **PASS** | #20 | Medium |
| TC-RBAC-13 | UI route guards redirect unauthorised roles | E2E | Redirect | Redirect | **PASS** | `role-access.spec.ts` ×7 | High |
| TC-RBAC-14 | **`user_metadata.role` cannot be self-escalated** | API | Rejected | Not tested — reason: no disposable account; the call would permanently mutate a real account. Prohibited by operating rule 10 | **NOT TESTED** | `supabase-rls.api.spec.ts:161`; **SEC-01** | **Critical** |

### Table 10 — Security and Data Integrity

| ID | Test Case | Type | Expected | Actual | Status | Evidence | Priority |
|---|---|---|---|---|---|---|---|
| TC-SEC-01 | No secret in the browser bundle | Static | 0 occurrences | 0 for all 8 tokens searched | **PASS** | Phase 2 STA-08 | **Critical** |
| TC-SEC-02 | FastAPI rejects a caller with no role header | API | 403 | 403 | **PASS** | in-process probe | High |
| TC-SEC-03 | FastAPI rejects `risk_department` / `audit_department` | API | 403 | 403 both | **PASS** | in-process probe | High |
| TC-SEC-04 | **FastAPI role header is cryptographically bound to a session** | API | Forged header rejected | **`X-User-Role: branch_employee` alone granted access (400, not 403)** | **FAIL** | **SEC-02** | **Critical** |
| TC-SEC-05 | OTP codes stored hashed, never plaintext | API | SHA-256 digest | Not tested — reason: blocked by the upstream failure TC-SEC-07 (no row was created to inspect) | **BLOCKED** | `test:demo-password-reset` #1 | High |
| TC-SEC-06 | No account enumeration on recovery | API | Identical response | Identical | **PASS** | #2 | High |
| TC-SEC-07 | **`request` creates a verification-code row** | API | Row created | **No row created** | **FAIL** | **API-07 F1** | High |
| TC-SEC-08 | **Expired code is rejected** | API | HTTP 401 | **HTTP 200 — session issued from an expired code** | **FAIL** | **API-07 F2** | **High** |
| TC-SEC-09 | Wrong code rejected and counted | API | 401, attempts+1 | Correct | **PASS** | #4 | High |
| TC-SEC-10 | Attempt limit enforced | API | Locked out | Locked out | **PASS** | #6 | High |
| TC-SEC-11 | Consumed code cannot be reused | API | 401 | 401 | **PASS** | #7 | High |
| TC-SEC-12 | Codes table default-denies anon | API | 0 rows / error | Blocked | **PASS** | #8 | High |
| TC-SEC-13 | Audit log is append-only | Schema | No UPDATE/DELETE policy | Confirmed by inspection | **PASS (design)** | `20260619100000` | High |
| TC-SEC-14 | Upload file-size limit | Static | Limit enforced | **No size limit in code** | **FAIL** | SEC-09 | Medium |
| TC-SEC-15 | Storage bucket policies in VCS | Static | Defined | **0 migrations define them** | **FAIL** | SEC-08 | Medium |
| TC-SEC-16 | Raw OCR PII not logged | Static | Redacted | **Full raw OCR text logged at INFO** | **FAIL** | SEC-07 | Medium |

### Table 11 — UI and Usability

| ID | Test Case | Type | Expected | Actual | Status | Evidence | Priority |
|---|---|---|---|---|---|---|---|
| TC-UI-01 | Login page renders all controls | E2E | Rendered | Rendered | **PASS** | `auth.spec.ts:8` | High |
| TC-UI-02 | Dashboard loads for all four roles | E2E | Loads | Loads (4) | **PASS** | `dashboard.spec.ts` | High |
| TC-UI-03 | Navigation between pages | E2E | Works | Works (3) | **PASS** | `navigation.spec.ts` | Medium |
| TC-UI-04 | Every major page opens for its role | E2E | Opens | 10/10 | **PASS** | `smoke-all-pages.spec.ts` | High |
| TC-UI-05 | Unauthorized route redirects | E2E | Redirect | 7/7 | **PASS** | `role-access.spec.ts` | High |
| TC-UI-06 | New Assessment dialog opens | E2E | Opens | Opens | **PASS** | `credit-risk.spec.ts` | Medium |
| TC-UI-07 | Arabic/English switching + RTL | E2E | Layout mirrors | Not tested — reason: no E2E test covers language switching or RTL | **NOT TESTED** | — | Medium |
| TC-UI-08 | Responsive / mobile navigation | E2E | Adapts | Not tested — reason: no viewport-varying test exists | **NOT TESTED** | — | Medium |
| TC-UI-09 | Onboarding tour + help overlay | E2E | Behaves | Not tested — reason: no E2E test. **No tour interference observed** in 3 full runs | **NOT TESTED** | Phase 14 | Low |
| TC-UI-10 | Keyboard navigation / dialog a11y | E2E | Accessible | Not tested — reason: no accessibility tooling in the repository | **NOT TESTED** | Phase 14 | Medium |
| TC-UI-11 | WCAG 2.1 AA compliance | Audit | Compliant | Not tested — reason: no axe-core/Lighthouse; **no compliance claim may be made** | **NOT TESTED** | Phase 14 | Medium |
| TC-UI-12 | E2E suite is deterministic | E2E | Same result each run | **3 runs → 3 different failure sets; all failures pass in isolation** | **FAIL (test reliability)** | Phase 14 | High |

### Table 12 — Error Handling and Fallback

| ID | Test Case | Type | Expected | Actual | Status | Evidence | Priority |
|---|---|---|---|---|---|---|---|
| TC-ERR-01 | Deterministic explanation when AI is unavailable | Unit | Bilingual text, never blank | Never empty (EN+AR) | **PASS** | `loanEngine.test.ts:249` | High |
| TC-ERR-02 | AI failure preserves `result_source='formula'` | Unit | Formula retained | Retained | **PASS** | `:426` | High |
| TC-ERR-03 | LLM 401 → `invalid_api_key`, not network error | Backend | Distinct code | Distinct | **PASS** | `test_llm_client.py` | Medium |
| TC-ERR-04 | LLM 402 → `insufficient_credits` | Backend | Distinct | Distinct | **PASS** | same | Medium |
| TC-ERR-05 | LLM 429 → `rate_limit`, no retry | Backend | No retry | No retry | **PASS** | same | Medium |
| TC-ERR-06 | Connection failure → `network_error` | Backend | Distinct | Distinct | **PASS** | same | Medium |
| TC-ERR-07 | Fallback model retried on upstream error only | Backend | 2 calls | 2 calls | **PASS** | same | Medium |
| TC-ERR-08 | No retry on 401/402 with a different model | Backend | 1 call | 1 call | **PASS** | same | Medium |
| TC-ERR-09 | Employment extraction failure returns empty, never guesses | Backend | All-empty + warning | Correct | **PASS** | `test_documents.py` | High |
| TC-ERR-10 | Unreadable ID → 422 with guidance | Backend | 422 | 422 | **PASS** | `test_documents.py` | High |
| TC-ERR-11 | Missing Tesseract → 503 | Backend | 503 | Not tested — reason: Tesseract is installed locally; simulating absence would require modifying the environment | **NOT TESTED** | `ocr.py:200` | Low |
| TC-ERR-12 | Unknown FastAPI route → 404, no crash | API | 404 | 404 | **PASS** | `test:api` | Low |
| TC-ERR-13 | Frontend surfaces "OCR API not running" | E2E | Message shown | Not tested — reason: would require stopping the API mid-E2E | **NOT TESTED** | `accountApi.ts:113` | Low |
| TC-ERR-14 | Schema-cache error produces an actionable message | Unit | Named missing columns | Correct | **PASS** | `schemaVerification.test.ts` | Medium |

---

## PHASE 17 — Final Quality Summary

### Overall QA summary — automated test cases

| Metric | Count |
|---|---|
| **Total test cases defined** | **402** |
| Total executed | 392 |
| **Total passed** | **388** |
| **Total failed** | **4** |
| Total blocked | 0 |
| Total skipped | 10 |
| Total not tested | (see per-phase tables) |
| Total not applicable | 2 (streaming, feedback persistence — features do not exist) |

Breakdown:

| Suite | Defined | Passed | Failed | Skipped | Exit |
|---|---|---|---|---|---|
| Unit (`npm test`) | 229 | 229 | 0 | 0 | 0 |
| Backend (`pytest`) | 46 | 46 | 0 | 0 | 0 |
| API + Integration (7 suites) | 77 | 70 | 3 | 4 | 1 (two suites) |
| UI E2E (best run) | 50 | 43 | 1 (flaky) | 6 | 1 |

### QA check-level summary (this audit's own checks, as recorded in `QA_RESULTS_FOR_SRS.json`)

| Metric | Count |
|---|---|
| Defined | 55 |
| Executed | 44 |
| Pass | 18 |
| Fail | 17 |
| Blocked | 1 |
| Skipped | 1 |
| Not tested | 8 |
| Not applicable | 2 |
| Observation | 8 |

> These are **audit-level checks**, not individual automated test cases — the 402/388/4/10 figures above are the test-case totals. `Executed` = defined minus blocked, not-tested, and not-applicable. Note that several `FAIL` entries record the confirmed **absence of a claimed capability** (no CI/CD, no storage bucket policies, no upload size limit, no `.env.example`) rather than a broken feature; the genuinely broken items are the four listed under Critical failures and High-priority fixes.

### Critical failures

| ID | Finding | Status |
|---|---|---|
| **SEC-01** | **RLS authorises from `auth.jwt() -> 'user_metadata' ->> 'role'`, which an authenticated user can rewrite via `supabase.auth.updateUser()`. Any employee could grant themselves `branch_manager`.** Confirmed from code and acknowledged in the project's own migration. **Not exploited** — no disposable account, prohibited by operating rule 10. | **NOT TESTED — Critical** |
| **SEC-02** | **The FastAPI document service authorises solely on an unsigned `X-User-Role` header.** Verified live: no header → 403, `risk_department` → 403, `branch_employee` → 400 (access granted). Combined with wildcard CORS, any reachable client can drive OCR, LLM extraction, and PDF retrieval. | **FAIL — Critical** |

### High-priority fixes, ranked

**1 — Security**
1. Migrate every RLS policy from `user_metadata.role` to `app_metadata.role`. `admin-users` already writes `app_metadata.role`; nothing reads it. Backfill existing users, then require re-login. *(SEC-01)*
2. Replace the `X-User-Role` header check with Supabase JWT verification in FastAPI; restrict CORS to known origins. *(SEC-02)*
3. Redeploy `demo-password-reset` from source and re-run its suite — the live build accepts expired OTP codes. *(SEC-03 / API-07)*
4. Add a file-size limit to upload endpoints. *(SEC-09)*
5. Redact or remove raw-OCR/PII logging. *(SEC-07)*
6. Commit Storage bucket policies to version control. *(SEC-08)*

**2 — Data integrity**
7. Apply `20260716100000_input_validation_guardrails.sql` to the live database and re-run `test:account-opening`. *(API-03)*
8. Verify and clean the suspected leftover rows using the SQL in DATA-01.
9. Reconcile the migration set with the live schema, starting with a `CREATE TABLE` for `approval_requests`.

**3 — Authentication / authorisation**
10. Enforce `profiles.status` at login — suspension is currently decorative. *(AUTH-OBS-1)*
11. Create a disposable test account so SEC-01 can actually be tested.

**4 — Loan-workflow correctness**
12. Fix the dead override constraint: `status = 'approved'` → `status = 'pending_audit_approval'`. *(WF-01)*
13. Add a `NOT NULL` / CHECK on `signature_data_url`, or document that signature capture is UI-only. *(WF-OBS-1)*
14. Add tests for the modification/re-analysis pipeline — currently the largest untested business flow.

**5 — Test reliability**
15. Reuse `storageState` per role instead of re-authenticating per E2E test; bound `workers` in `playwright.config.ts`. *(TC-UI-12)*
16. Implement the 6 skipped E2E write-path journeys.
17. Install a coverage tool — no coverage figure can currently be claimed.

**6 — Deployment readiness**
18. Add CI running `tsc --noEmit`, `lint`, `test`, `build` on every push. Add a `typecheck` npm script.
19. Fix the 6 TypeScript errors and 6 ESLint errors.
20. Declare `python-dotenv` explicitly.
21. Add code splitting (single 1,047 kB chunk).
22. Remove the empty `supabase/functions/manage-users/` directory and the shipped debug `console.log` in `useStats.ts:217`.

**7 — Documentation accuracy** — see §"SRS claims that must be changed".

### SRS claims safe to keep (evidence-backed)

- Four roles: `branch_employee`, `branch_manager`, `risk_department`, `audit_department`.
- Deterministic credit engine: EMI/annuity, **50% DBR cap**, **age-at-maturity 70 cap** — both boundaries unit-tested inclusively.
- Itemised weighted risk score with `low<40 / medium 40–69 / high≥70`.
- **AI cannot alter any computed figure** — structurally sealed and injection-tested.
- Four-stage loan workflow with soft rejection and blocked stage-skipping — **verified live, 8/8**.
- PostgreSQL RLS enforcing per-role visibility — **verified live, 22/22**.
- Sequence/trigger-generated account numbers, never client-computed — **verified live**.
- Exact national-ID matching; name matches require confirmation.
- Honest provenance tracking, including an unresolved sentinel — never fabricated financial data.
- Bilingual EN/AR RAG assistant with pgvector plus a local keyword fallback.
- Per-user chat history with owner-only isolation — **verified live**.
- Append-oriented audit logging via database triggers.
- No secret is shipped to the browser bundle.
- Production build succeeds.
- Supabase is the primary backend platform; FastAPI is a document-processing microservice only.

### SRS claims that must be changed

| Claim | Correction |
|---|---|
| "AI-powered / ML credit scoring", any LightGBM or model reference | Deterministic engine; **no ML model exists** |
| Azure anywhere | **Not used** |
| Docker / containerisation | **No Dockerfile**; Docker only in a local test script |
| Redis / caching layer | **Not used** |
| CI/CD pipeline | **Does not exist** |
| Streaming AI responses | **Not implemented** |
| User feedback captured | **UI-only stub; nothing is stored** |
| Reports / export | **Not implemented** |
| Monitoring / observability | **Not implemented** |
| 500 ms response, 50k users, 99.98% uptime, RTO 1h, RPO 15min | **Not measured — mark as future targets** |
| 80% code coverage | **Not instrumented — no figure may be claimed** |
| WCAG 2.1 AA compliance | **Not audited** |
| 8-character password minimum | **Verified as 6 characters** |
| "Validation constraints enforced in the database" | **Verified absent from the live database** |
| "Migrations define the schema" | Partial, corrective record only |
| "Secure" without qualification | Two critical authorisation weaknesses are open |

### SRS claims to mark as future work

Streaming responses · persisted feedback and analytics · chat export · administrative policy-ingestion UI · scheduled reports · monitoring, alerting, and structured logging · CI/CD pipeline · containerisation · load and performance validation · disaster-recovery RTO/RPO procedures · code-coverage instrumentation · formal accessibility audit · horizontal scaling of the document service (blocked by its in-memory store) · live interest-rate and FX feeds (all rates are configured constants) · MFA and a password-change UI.

### Presentation / demo advice

Demonstrate these live — each is backed by passing evidence from this audit:

1. **The four-stage loan workflow, end-to-end.** Strongest asset: 8/8 live tests. Log in as each of the four roles and show a request move `pending_branch_manager_approval → pending → pending_audit_approval → audit_approved`. Then show Risk being unable to see a manager-gated request — visible proof that RLS, not the UI, enforces the rule.
2. **The deterministic credit engine with AI explicitly disabled.** Set `VITE_CREDIT_AI_FALLBACK=false` and show a complete bilingual result. This makes the "AI explains, never decides" architecture self-evident.
3. **The DBR and age boundary cases.** Enter values landing on exactly 50% DBR and exactly age 70, then one unit past each. The inclusive/exclusive behaviour is unit-tested and reads as genuine banking rigour.
4. **`npm test` live** — 229 tests in under half a second.
5. **Account opening** through to a database-generated `BOP-1NNNNN` number, highlighting that the number comes from a Postgres sequence, never from the client.
6. **The AI assistant answering a policy question with citations**, then asking about a non-existent account to show it reports "not found" rather than inventing a customer.

Avoid demonstrating live: the forgot-password flow (two confirmed live failures), the UI account-opening wizard and any UI approve/reject action (no E2E coverage; not validated through the interface), and anything framed as a performance or uptime claim.

### Final recommendation

> ## **Requires implementation fixes before submission.**

The engineering core is genuinely strong, and much of it is now backed by live evidence rather than code reading: the four-stage workflow, the RLS model, and the deterministic engine with its sealed AI boundary all passed against the real system. The SRS can make those claims confidently.

However, four issues make "ready after documentation corrections" inaccurate:

1. **SEC-01** — RLS authorises from a claim the user can rewrite. This is a critical authorisation flaw in a *banking* platform, and the remediation is small because `admin-users` already writes `app_metadata.role`.
2. **SEC-02** — the document service accepts an unsigned role header, verified live.
3. **API-03** — a validation constraint the repository defines is **absent from the live database**, and a malformed record was accepted during this audit.
4. **API-07** — the deployed OTP function **accepts expired codes**, indicating the deployed build does not match the repository.

Items 3 and 4 also mean the running system does not match the repository, so any SRS statement describing "the system" is currently ambiguous about which system it describes.

Fixes 1, 2, 3, 4 and the dead override constraint (WF-01) are each small and well-localised. Once they are applied and `test:account-opening` plus `demo-password-reset` re-run clean, this project moves to **ready after documentation corrections** — with a QA record that is considerably stronger than most projects at this stage.

---

## Final Safety Check

| Assertion | Verified |
|---|---|
| No source file was modified | ✅ `git status --porcelain` empty; `git diff --stat` empty; HEAD unchanged at `5cf3f18` |
| No migration was applied | ✅ No migration command was executed |
| No Edge Function was deployed | ✅ No `supabase functions deploy` was executed |
| No live user was created, updated, deleted, or deactivated | ✅ No `admin-users` call and no auth-admin mutation was made |
| No real customer record was modified | ⚠️ **Qualified.** No *pre-existing* customer record was modified. QA-namespaced rows were created and cleaned up under explicit operator approval. One suspected leftover row remains unverified — see **DATA-01**. Live account-number sequence values were consumed permanently, as disclosed and accepted. |
| No secret value was printed | ✅ Only variable *names* and character *counts*. Bundle scan reported occurrence counts only. |
| All skipped tests include a reason | ✅ All 10 documented in Phase 5 and Phase 14 |
| No fake test result was created | ✅ Every result traces to a recorded command, exit code, and log file |
| Repository evidence vs. live verification distinguished | ✅ Marked throughout as *(code)* / *live* / *NOT TESTED* |
| Implemented vs. future requirements distinguished | ✅ Phase 15 and Phase 17 |
| **Suitability for SRS submission explicitly stated** | ✅ **Requires implementation fixes before submission** |

### Commands executed during this audit

**Read-only inspection:** `git rev-parse`, `git status`, `git log`, `git ls-files`, `git diff --stat`, `git check-ignore`, `ls`, `find`, `wc`, `cat`/`sed`/`head`/`tail`, `grep`, `curl` (localhost `/health` and a 404 probe), `pip list`, `importlib` probes, in-process `TestClient` probes.

**Executed with side effects (all disclosed):** `npx tsc --noEmit` · `npm run lint` · `npm run build` (regenerated gitignored `dist/`) · `npm test` · `pytest -p no:cacheprovider` · `npm run dev:api` (started, then stopped) · `npm run test:api` · `npm run test:rls` · `npm run test:account-opening` · `npm run test:loan-workflow` · `npm run test:assistant` · `npm run test:integration` · `npx playwright test tests/api/demo-password-reset.api.spec.ts` · `npm run e2e` (×2) · `npx playwright test --workers=1` · isolated single-test re-runs.

**Blocked and not worked around:** a service-role read-only leftover-row verification script (safety classifier denial) — recorded as **DATA-01**.

**Log evidence:** all raw output retained in the session scratchpad at
`/tmp/claude-1000/-home-abdullah-.../scratchpad/` — `tsc.log`, `lint.log`, `build.log`, `unit.log`, `pytest.log`, `test-api.log`, `test-rls.log`, `test-acc.log`, `test-wf.log`, `test-ai.log`, `test-int.log`, `test-dpr.log`, `test-e2e.log`, `e2e.json`, `e2e-serial.json`, `e2e-auth-retry.log`, `fastapi.log`.
