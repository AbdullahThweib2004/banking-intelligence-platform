# Validation Testing Report

**Date:** 2026-07-06; **rebased 2026-07-13**  
**Method:** Static code review of form handlers and API contracts

## Credit Risk — New Assessment

| Field | Rule (expected) | Implementation | Status |
|-------|-----------------|----------------|--------|
| Customer account | Required for lookup | Validates before fetch | **PASS** |
| Customer name | Required non-empty | `trim()` check + toast | **PASS** |
| Loan amount | Required, numeric | Parsed and validated | **PASS** |
| Loan-restricted customer | Block assessment | `loan_restricted` check | **PASS** static |
| Negative income | Clamped in scoring | `buildDerivedFeatures` UT | **PASS** |
| **Loan type [new]** | Required selection | `LOAN_PRODUCT_IDS` Select, validated on submit | **PASS** static |
| **Currencies [new]** | Required selection | `LOAN_CURRENCIES` Select ×2 (loan/salary) | **PASS** static |
| **Client age [new]** | 18–100 range | Client-side range check before submit | **PASS** static |
| **Loan term (years) [new]** | 1–30 range | Client-side range check before submit | **PASS** static |
| **DBR cap (50%) [new]** | Hard eligibility gate, not just a warning | `loanEligibility.ts` `evaluateEligibility()` — UT | **PASS** |
| **Age-at-maturity cap (70) [new]** | Hard eligibility gate | Same as above — UT | **PASS** |

## Objection / Modification Dialog

| Field | Rule | Implementation | Status |
|-------|------|----------------|--------|
| Reason | Required | Submit disabled when empty | **PASS** |
| Modification type | Required selection | Select component | **PASS** static |

## Documents — Upload

| Field | Rule | Implementation | Status |
|-------|------|----------------|--------|
| File required | Must select file | Upload handler check | **PASS** static |
| File type | Accept images/PDF | Input accept attr | Partial — server validation unverified |
| Max size | Reasonable limit | Not explicitly capped in frontend | **GAP** |

## Account Opening Wizard

| Field | Rule | Implementation | Status |
|-------|------|----------------|--------|
| ID image upload | Required for OCR | Wizard step validation | **PASS** static |
| Extracted fields | User can edit | Form editable | **PASS** static |
| Loan-restricted | Block open | API + customer check | Partial |
| **National ID uniqueness [new]** | No duplicate `bank_customers` rows | DB `UNIQUE(national_id)` constraint + app-level find-first check | **PASS** — container-verified; live BLOCKED |
| **Missing/incomplete OCR fields [new]** | Placeholder defaults, never a hard failure | `accountOpeningDefaults.ts` fills clearly-labeled temporary values | **PASS** static |
| **Account number generation [new]** | Never computed client-side | DB sequence + `BEFORE INSERT` trigger only | **PASS** — container-verified; confirmed no client-side arithmetic via `grep` |

## Auth

| Field | Rule | Implementation | Status |
|-------|------|----------------|--------|
| Email format | Valid email | Supabase Auth validation | **PASS** (delegated) |
| Password | Min length | Supabase Auth | **PASS** (delegated) |
| Empty submit | Prevented | Form disabled / error | **PASS** static |

## User Management

| Field | Rule | Implementation | Status |
|-------|------|----------------|--------|
| Email unique | No duplicates | Edge function + Supabase | **BLOCKED** live |
| Role selection | Valid enum | Dropdown limited to 3 roles | **PASS** static |

## API validation (FastAPI)

| Endpoint | Server-side validation | Status |
|----------|------------------------|--------|
| POST /documents/extract-id | File type/size checks in router | Partial — not fully reviewed |
| POST /accounts/open-new | Payload schema via Pydantic | **PASS** static |
| Role header | **Only checks header value** | **FAIL** BUG-001 |

## Edge cases tested (unit)

| Case | Test | Result |
|------|------|--------|
| Zero loan principal | UT estimateMonthlyLoanPayment | **PASS** |
| Negative monthly income | UT buildDerivedFeatures clamp | **PASS** |
| Whitespace-only name | trim() in submit handler | **PASS** static |

## Gaps

1. No max file size validation visible on frontend upload
2. No duplicate document name prevention
3. Server-side role validation missing on FastAPI (security, not validation UX)

## Conclusion

Client-side validation is **reasonable for demo**. Server-side validation on FastAPI auth is **insufficient** (BUG-001).
