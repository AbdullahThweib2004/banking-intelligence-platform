# QA Validation Hardening Report

**Date:** 2026-07-16
**Scope:** Full input-validation audit and hardening pass across every user-entry surface in the platform, ahead of an SRS update.
**Status:** CONDITIONAL PASS — all identified gaps fixed and tested; a small number of intentionally-deferred items are listed in §8.

---

## 1. Summary of the audit

I inspected every surface where a user types data that eventually reaches business logic or the database: the Credit Risk "New Assessment" form, the Credit Risk objection/modification dialog, the "Open New Account" OCR-review step, User Management's "create user" dialog, the hybrid chat assistant's loan-advisory parsing, and the `approval_requests`/`bank_customers` database schema itself.

**Finding: there was no shared validation layer anywhere in the app.** `zod` and `react-hook-form` are dependencies but are each used in exactly one place (`Auth.tsx`'s login form; a shadcn primitive nobody calls). Every other form validates inline with ad hoc `if` checks and `toast.error(...)`, and several fields had **no validation at all** beyond "is this non-empty." Numeric fields in particular relied on `Number(x) || 0`, which silently accepts negative numbers (`-500 || 0` evaluates to `-500`, not `0`) — this pattern was repeated at every money-shaped input in the app.

The three explicit examples in the request (age > 120, loan minimum, name length) turned out to be a representative sample of a broader pattern, not isolated issues — the same superficial "non-empty only" validation was present on nearly every field across four different pages plus the chat assistant.

---

## 2. Validation issues found

| # | Field / Surface | Issue | Severity |
|---|---|---|---|
| 1 | Customer name (New Assessment) | No max length — a 10,000-character string would be accepted and inserted | Medium |
| 2 | National ID (New Assessment) | No format/length check at all — any string, including empty-but-editable, was accepted | Medium |
| 3 | Monthly income / expenses / existing loans / monthly obligations (New Assessment) | Negative values silently accepted (`Number(x) \|\| 0` bug) | **High** |
| 4 | Loan amount (New Assessment) | No positive-number check; **no minimum-amount business rule existed anywhere** | **High** |
| 5 | Objection/modification "new value" (Credit Risk) | Zero validation regardless of which field was being edited — a modification could set `monthly_income` to `-999999` or `loan_amount` to `1` | **High** |
| 6 | Objection reason | No max length (unbounded text into the DB) | Low |
| 7 | First/last name (Open New Account) | No max length | Medium |
| 8 | **Date of birth (Open New Account)** | Only checked for non-empty — **never validated as a real, plausible date**; a future date or an implied age of 300 would pass silently | **High** |
| 9 | National ID (Open New Account) | Only checked for non-empty, no format validation | Medium |
| 10 | Father's/mother's name (Open New Account) | No max length | Low |
| 11 | Email (User Management) | Only checked for non-empty — no format validation client-side (server also only checks non-empty + role enum) | Medium |
| 12 | Full name (User Management) | No max length | Low |
| 13 | Loan amount (hybrid chat assistant) | The assistant would compute and recommend an installment term for any on-file or stated amount, including ones below what would ever be approved | Medium |
| 14 | **Database schema (`bank_customers`, `approval_requests`)** | **Zero numeric-range or length CHECK constraints existed anywhere** — every guarantee above depended entirely on the frontend never being bypassed or buggy | **High** |
| 15 | Client age (New Assessment) | Already validated 18–100 | None — already compliant, exceeds the 120 requirement |
| 16 | Loan term years (New Assessment) | Already validated 1–30 | None — already compliant |
| 17 | Loan type / currency (New Assessment) | Already enum-constrained via `<Select>` + DB CHECK | None — already compliant |

---

## 3. Changes made

### New shared validation module
Created `src/lib/validation.ts` — a single, pure, bilingual (EN/AR) module every surface now calls into, so a rule is defined exactly once:

- `validateName` / `MAX_NAME_LENGTH = 250` — trims, rejects >250 chars.
- `validateNotes` / `MAX_NOTES_LENGTH = 1000` — for free-text reasons/comments.
- `validateNationalId` / 7–15 digits-only — see §5 for exactly why this range.
- `validateNonNegativeAmount` — rejects negative and non-finite values.
- `validateLoanAmount` — rejects ≤0 and below the currency-aware minimum (see §5).
- `validateAge` / `validateDateOfBirth` (18–120, rejects future dates and unparseable strings, derives age) — for the Open New Account date-of-birth field.
- `validateLoanApplicantAge` (18–100) / `validateLoanTermYears` (1–30) — centralizes CreditRisk.tsx's own pre-existing, already-correct rules so they're shared and testable instead of duplicated inline.
- `validateEmail` — pragmatic format check.
- `validateObjectionFieldValue` — dispatches to the correct rule above based on which `approval_requests` column is being edited in the objection/modification flow.

### Loan-amount minimum (the explicit "8,000 USD or equivalent" rule)
Added to `src/lib/loanProducts.ts` (the module that already owns the app's one FX table):
```ts
export const MIN_LOAN_AMOUNT_USD = 8000;
export function getMinimumLoanAmount(currency: LoanCurrency): number {
  return convertCurrency(MIN_LOAN_AMOUNT_USD, 'USD', currency);
}
```
This **reuses the existing `convertCurrency`/`FX_TO_ILS` table** rather than inventing a second, independently-maintained conversion — see §5 for the exact numbers this produces today.

### Application code wired to the new module
- **`src/pages/CreditRisk.tsx`** — New Assessment submit handler now validates name, national ID, non-negative income/expenses/existing-loans/obligations, and loan amount (currency-aware minimum) before calling `assessCreditRisk()`. The objection dialog now validates the reason's length and the proposed new value using `validateObjectionFieldValue`.
- **`src/pages/Documents.tsx`** — Replaced the boolean-only `isReviewValid` with `getAccountReviewError()`, which runs every check and returns the *specific* failing message (name length, date-of-birth plausibility, ID format) instead of one generic "fill required fields" toast. Also added a `max` attribute to the date picker so the UI itself won't offer a future date.
- **`src/pages/UserManagement.tsx`** — Create-user dialog now validates full name length and email format before invoking the `admin-users` edge function.
- **`src/lib/chatAnswerComposition.ts` / `src/lib/assistantChat.ts` / `supabase/functions/assistant-chat/index.ts`** — Added a new `below_minimum` advisory outcome: when a loan amount (stated or on-file) is below the currency-equivalent minimum, the assistant now says so and asks for a larger amount instead of computing and presenting a term for it.

### Database guardrails
New migration `supabase/migrations/20260716100000_input_validation_guardrails.sql` adds CHECK constraints as a defense-in-depth backstop (see §5 for why the bounds were chosen the way they were):
- `bank_customers`: `monthly_income/monthly_expenses/existing_loans/loan_amount >= 0`, `customer_name` ≤250 chars, `national_id` 7–15 chars.
- `approval_requests`: the same non-negative checks (nullable-tolerant) plus `client_age` sanity-bounded 0–120, `loan_term_years` bounded 1–30, `customer_name` ≤250 chars, `national_id` ≤15 chars.

---

## 4. Files changed

| File | Change |
|---|---|
| `src/lib/validation.ts` | **New** — shared validation module |
| `src/lib/__tests__/validation.test.ts` | **New** — 56 tests |
| `src/lib/loanProducts.ts` | Added `MIN_LOAN_AMOUNT_USD`, `getMinimumLoanAmount()` |
| `src/pages/CreditRisk.tsx` | Wired validation into New Assessment submit + objection dialog |
| `src/pages/Documents.tsx` | Replaced `isReviewValid` with `getAccountReviewError()`; added date `max` |
| `src/pages/UserManagement.tsx` | Wired name/email validation into create-user |
| `src/lib/assistantChat.ts` | Added `below_minimum` to `AssistantAdvisoryResult` |
| `src/lib/chatAnswerComposition.ts` | Enforces the loan minimum in `buildAdvisoryResult`; formats the new outcome; `resolveFinalSource` maps it to `clarification` |
| `supabase/functions/assistant-chat/index.ts` | System prompt now explains the `below_minimum` case |
| `src/lib/__tests__/chatHybrid.test.ts` | +4 new tests; 1 pre-existing test's fixture updated (see §7) |
| `supabase/migrations/20260716100000_input_validation_guardrails.sql` | **New** — DB CHECK constraints |

---

## 5. Business rules enforced (and exactly how each was derived)

- **Name length ≤ 250 characters** — applied identically to customer name, first/last name, father's/mother's name, and User Management's full name. Trimmed before checking.
- **Loan amount minimum: 8,000 USD or currency equivalent.** The equivalent is computed by feeding `MIN_LOAN_AMOUNT_USD` through the app's existing `convertCurrency()`/`FX_TO_ILS` table — the same configured (not live) FX table already used for DBR currency normalization everywhere else. Today that resolves to:
  - USD 8,000
  - ILS 28,800.00
  - JOD 5,647.06
  If `FX_TO_ILS` is ever updated, these recompute automatically — they are never hardcoded a second time anywhere.
- **National ID: digits only, 7–15 characters.** There is no formally documented ID format anywhere in this project. This range was derived from the two things that *do* exist and agree: the seed data (12-digit numeric strings) and the OCR backend's own instruction to its extraction model (`backend/services/llm_extractor.py`: *"id_number: digits only, no spaces"*). 7–15 is deliberately wider than exactly-12 so a legitimate format variation isn't rejected, while still catching garbage input.
- **Date of birth → age 18–120.** 120 is the explicit outer bound requested; 18 reflects that every named party in this system is expected to be an adult, consistent with the pre-existing loan-applicant rule below. Future dates and unparseable strings are rejected outright, before age is even computed.
- **Loan-applicant age 18–100** and **loan term 1–30 years** — these are CreditRisk.tsx's own pre-existing rules, unchanged, now centralized into the shared module instead of being duplicated inline (so they can't drift from the DB/objection-flow copy).
- **Client age DB sanity bound 0–120, not 18–100.** The database intentionally uses a *looser* bound than the app's business rule. The DB's job here is to reject clearly-impossible data; the exact business threshold stays defined once, in `validation.ts`, so the two never have to be kept in sync by hand.
- **Non-negative money everywhere.** Applied uniformly to income, expenses, existing loans, obligations, and loan amount, at both the form layer and (new) the database layer.

---

## 6. Test cases added/updated

56 new tests in `src/lib/__tests__/validation.test.ts`, covering (per the explicit request):

| Requirement | Test(s) |
|---|---|
| Age > 120 rejected | ✅ `rejects an age above 120` |
| Negative age rejected | ✅ `rejects a negative age` (both `validateAge` and `validateLoanApplicantAge`) |
| Empty name rejected (required) | ✅ `rejects an empty name when required` |
| Name > 250 chars rejected | ✅ `rejects a name of 251 characters` |
| Loan amount below minimum rejected | ✅ 5 tests across USD/ILS/JOD |
| Valid loan amount accepted | ✅ `accepts an amount above the USD minimum` |
| Negative salary/expenses rejected | ✅ `validateNonNegativeAmount` suite (4 tests) |
| Unsupported currency rejected | Enforced structurally — `LoanCurrency` is a TypeScript union (`'ILS'\|'USD'\|'JOD'`) plus a DB CHECK constraint (pre-existing); there is no runtime "unsupported currency string" path to test against |
| Invalid national ID rejected | ✅ 8 tests: non-digits, too short, too long, both boundaries |
| Boundary cases at exact limits | ✅ Every rule has an exact-boundary test (18, 100, 120, 250, 1000, 8000, 28800, 30, 1) |
| Error messages shown correctly | ✅ Message content asserted (e.g. `/250/`, `/negative/i`, `/future/i`, `/digits/i`) in addition to pass/fail |

Plus **4 new tests** in `src/lib/__tests__/chatHybrid.test.ts` for the chat assistant's new `below_minimum` behavior (rejects on-file amount below minimum, rejects a stated amount below minimum, accepts the exact boundary, and confirms the source badge maps to "Clarification needed").

**1 pre-existing test updated:** `chatHybrid.test.ts`'s "computes a real term recommendation when the on-file loan amount is available" test used a `15,000 ILS` fixture, which is now correctly *below* the new ILS-equivalent minimum (28,800) — this was the new rule doing exactly its job, not a bug. The fixture was changed to `35,000 ILS`, comfortably above the threshold, with a comment explaining why.

### Database-level verification
The new migration was applied **verbatim** against a throwaway Docker Postgres container seeded with the real demo data (not the live Supabase project — no live credentials are available in this environment):
- ✅ Applied cleanly against the existing seed rows (zero violations of the new constraints).
- ✅ Re-ran the migration a second time — fully idempotent, no errors.
- ✅ Confirmed each constraint actually rejects bad data: negative income, a 251-character name, and a 3-digit national ID were all correctly rejected with the expected constraint name.
- ✅ Confirmed legitimate data still passes: a valid new row, and a legacy row with `NULL` `client_age`/`loan_term_years`, both inserted successfully.
- ✅ Confirmed the sanity bounds: `client_age = 150` rejected, `loan_term_years = 0` rejected.

---

## 7. Test results

```
npm test  → 181/181 pass, 36 suites (was 121/121 before this pass)
npx tsc --noEmit -p tsconfig.app.json → 6 pre-existing errors (AIChatContext.tsx), unrelated, unchanged
npx eslint . → 6 pre-existing errors, 15 pre-existing warnings, unchanged
npm run build → PASS, 981.25 kB / 289.12 kB gzip (grew ~6 kB from the new validation module)
```

No regressions. The 6 typecheck errors and 6 lint errors are the same pre-existing, unrelated issues documented in prior QA passes (`AIChatContext.tsx`, `tailwind.config.ts`, and `CreditRisk.tsx`'s long-standing ref casts) — none were introduced or touched by this work.

**Flows re-verified by code inspection (no live browser session available in this environment):**
- **Credit-risk assessment** — the new checks are additive guard clauses before the existing `assessCreditRisk()` call; when all pass, the flow is byte-for-byte the same as before.
- **Open New Account** — `getAccountReviewError()` gates the same "Continue" transition `isReviewValid` did; the actual `findOrCreateBankCustomerFromAccountOpening()` call site was not touched.
- **Duplicate national ID reuse** — `bankCustomers.ts` was not modified in this pass at all.
- **Hybrid chat assistant** — only a new branch (`below_minimum`) was added; all pre-existing routing (policy/customer/hybrid/greeting/capability/clarification/not-found) is unchanged.
- **Help system** — nothing under `src/components/help/`, `useHelpTarget.ts`, `useIsDialogOpen.ts`, or `helpDialogDetection.ts` was touched.

---

## 8. Remaining risks / limitations

1. **Email format is not re-validated server-side.** The `admin-users` edge function still only checks non-empty + role enum; Supabase Auth's own `createUser()` call is the real backstop against a malformed address reaching the database. Client-side format validation now exists, but a direct API call bypassing the UI would only be caught by Supabase Auth itself, not by this project's own code.
2. **The loan-amount minimum is not enforced at the database layer.** It requires a currency-aware conversion (`getMinimumLoanAmount`), which isn't expressible as a portable SQL CHECK constraint without duplicating the FX table in SQL. It is enforced at the New Assessment form, the objection/modification dispatch, and the chat assistant — the three places a loan amount can currently be set or changed — but a direct/manual database insert would not be blocked by it.
3. **`bank_customers.loan_amount` (the placeholder profile value set by `accountOpeningDefaults.ts`) does NOT carry the 8,000-minimum rule** — only a non-negative DB check. This is deliberate: that field represents a rough on-file profile value, not an actual loan being requested; the minimum is enforced where a real loan amount is actually decided (Credit Risk). This distinction is worth restating explicitly when the SRS is updated, so it isn't misread as an oversight.
4. **National ID's digits-only format is app-level only, not a DB constraint** — deliberately, so a future legitimate ID format change doesn't require a migration. Only the length (7–15) is enforced at the database layer.
5. **The DB migration has not been applied to any live Supabase project** — per this project's established workflow, the user applies migrations themselves via the Supabase SQL Editor. It has been verified in an isolated Docker container only.
6. **No live/browser testing was performed** — this environment has no live Supabase session or browser. All flow-preservation claims in §7 are code-level, not click-tested.

---

## 9. Recommended future improvements

1. Add a lightweight server-side (edge function or DB trigger) email-format check so the `admin-users` path doesn't rely solely on Supabase Auth as the only real backstop.
2. If a real onboarding/KYC financial questionnaire ever replaces `accountOpeningDefaults.ts`'s placeholder generator, apply the same `validateLoanAmount` minimum to whatever loan-amount field it captures.
3. Consider a Playwright/Cypress smoke test exercising one rejected case and one accepted case per form, now that there's a stable, shared validation module to assert against — this project's only structural E2E gap (documented in earlier QA passes) becomes cheaper to close now that the validation logic itself is centralized and already unit-tested.
4. If the national ID format is ever formally documented (a real Palestinian/Jordanian ID specification), tighten `validateNationalId` from the current deliberately-wide 7–15-digit range to the exact real format.
