/**
 * Pure decision logic for matching a customer's REAL financial profile
 * during the "Employment Proof Upload" step of Open New Account.
 *
 * Kept free of any Supabase import (unlike bankCustomers.ts, which performs
 * the actual queries and calls into this module) so the matching decision
 * itself can be unit tested directly with `node --test`, following the same
 * split already used by chatAnswerComposition.ts / chatCustomerLookup.ts.
 *
 * Matching rules (deliberately conservative — the business requirement is
 * that financial data must never be silently invented or misassigned):
 *   - national_id is the ONLY identifier ever used to auto-apply an existing
 *     customer's real financial data. bank_customers.national_id has a
 *     UNIQUE database constraint (see
 *     20260711100000_bank_customers_account_sequence.sql), so this lookup
 *     can never be ambiguous.
 *   - customer_name has no uniqueness constraint, so a name-only match is
 *     NEVER auto-applied — it is surfaced as one or more candidates that a
 *     staff member must explicitly confirm before the data is used. This is
 *     the "secondary matching...only when safe and explainable" case from
 *     the business requirement: name alone isn't safe enough to assign
 *     silently, since two different customers can share the same name.
 *     (bank_customers has no date-of-birth column, so the other suggested
 *     secondary key — name + DOB — isn't available here; using name alone
 *     as an AUTO-FILL source would be exactly the "weak matching" the
 *     business rule prohibits, so it's used only as a review hint.)
 */
import type { BankCustomerRecord } from './bankCustomers.ts';

export type EmploymentMatchOutcome =
  | { kind: 'matched'; customer: BankCustomerRecord }
  | { kind: 'possible_match'; candidates: BankCustomerRecord[] }
  | { kind: 'ambiguous'; candidates: BankCustomerRecord[] }
  | { kind: 'not_found' };

/**
 * Decides the match outcome from already-fetched rows — performs no I/O
 * itself. `nationalIdMatch` must come from an exact national_id lookup;
 * `nameMatches` from a name-only lookup that should only be consulted (by
 * the caller) when the national_id lookup found nothing.
 */
export function resolveEmploymentMatch(
  nationalIdMatch: BankCustomerRecord | null,
  nameMatches: BankCustomerRecord[]
): EmploymentMatchOutcome {
  if (nationalIdMatch) {
    return { kind: 'matched', customer: nationalIdMatch };
  }
  if (nameMatches.length === 0) {
    return { kind: 'not_found' };
  }
  if (nameMatches.length === 1) {
    return { kind: 'possible_match', candidates: nameMatches };
  }
  return { kind: 'ambiguous', candidates: nameMatches };
}

/**
 * Detects a meaningful mismatch between a salary figure freshly extracted
 * from the employment-proof document and the salary already on file for a
 * `matched` customer — a distinct warning from "no match", used to prompt
 * staff to double-check rather than silently trusting either number.
 * Returns false when either figure is missing (nothing to compare).
 */
export function isSalaryMismatch(
  extractedSalary: number | null | undefined,
  onFileSalary: number | null | undefined,
  toleranceRatio = 0.15
): boolean {
  if (extractedSalary == null || onFileSalary == null) return false;
  if (!Number.isFinite(extractedSalary) || !Number.isFinite(onFileSalary)) return false;
  if (onFileSalary === 0) return extractedSalary !== 0;
  const diff = Math.abs(extractedSalary - onFileSalary);
  return diff / onFileSalary > toleranceRatio;
}

/** The subset of EmploymentExtractedFields (accountApi.ts) needed to decide
 * and build a fallback financial profile — kept as a local structural type
 * so this module never imports accountApi.ts (which has no Supabase
 * dependency either, but there's no reason to couple them). */
export interface ExtractedEmploymentFieldsForProfile {
  monthly_salary?: number | null;
  employer_name?: string;
  employment_status?: string;
  currency?: string;
  job_title?: string;
}

/**
 * Whether an employment-proof extraction result contains anything real
 * worth using as a fallback financial profile. `false` for a genuinely empty
 * result (extraction failed / AI unavailable / document unreadable) — the
 * caller must fall back to `unresolved_needs_review` in that case, never a
 * guess.
 */
export function hasUsableEmploymentData(
  fields: ExtractedEmploymentFieldsForProfile | null | undefined
): boolean {
  if (!fields) return false;
  return (
    fields.monthly_salary != null ||
    !!fields.employer_name?.trim() ||
    !!fields.employment_status?.trim()
  );
}

/** The subset of ResolvedFinancialProfile (bankCustomers.ts) needed to
 * detect an empty/placeholder profile — kept local for the same reason as
 * ExtractedEmploymentFieldsForProfile above. */
export interface FinancialProfileValuesForEmptyCheck {
  monthlyIncome: number;
  employmentType: string;
  jobRole: string | null;
}

/**
 * True when a resolved financial profile carries no real signal at all —
 * income is 0, employment type is the 'unknown' sentinel, and there's no
 * job role. This catches a DIFFERENT case from `source === 'unresolved_needs_review'`:
 * a database match CAN exist (a real row, found by exact national_id) while
 * still being genuinely empty — e.g. a legacy/stray row created outside
 * this app's account-opening flow entirely (see
 * 20260711120000_fix_bank_customers_account_sequence.sql's documented
 * "BOP-200013"-style stray-row incident) whose financial_profile_source
 * defaulted to 'unknown' because nothing ever populated it.
 *
 * INCIDENT: without this check, once ANY database match was found — even
 * an empty one — the UI treated it as fully authoritative and refused to
 * let a *successful* employment-proof extraction fill in the real values,
 * silently showing 0/'unknown' tagged "From Database" as if it were
 * verified real data. This is what callers use to decide whether a
 * database match should still be eligible for a same-session upgrade from
 * fresh extraction, exactly like refreshStaleFinancialProfile does for the
 * persisted row itself.
 */
export function isFinancialProfileEmpty(profile: FinancialProfileValuesForEmptyCheck): boolean {
  return profile.monthlyIncome === 0 && profile.employmentType === 'unknown' && !profile.jobRole;
}

export interface ExtractedFinancialProfile {
  monthlyIncome: number;
  monthlyExpenses: number;
  existingLoans: number;
  employmentType: string;
  loanAmount: number;
  loanPurpose: string;
  salaryCurrency: string;
  jobRole: string | null;
  source: 'employment_proof_extracted';
}

/**
 * Builds the fallback financial profile from the employment proof's own
 * extracted fields — used whenever no database match exists (or the
 * national_id/name lookup itself failed) but the document yielded real,
 * customer-provided data. This is the fix for a real incident: extraction
 * would populate `employmentFields` for display, but nothing ever copied it
 * into the applied `financialProfile` unless a staff member noticed and
 * clicked a separate "use extracted data" button — silently leaving the
 * profile at 0 / 'unknown' / unresolved even when good data had already been
 * extracted. See src/pages/Documents.tsx for where this is now called
 * automatically instead of being opt-in.
 *
 * Only monthly_salary and employment_status/currency/job_title have a
 * document-derived equivalent — expenses/existing-loans/loan-amount/purpose
 * have no equivalent on a payslip or employment letter, so they stay at
 * their neutral 0/'unknown' defaults, same as the database's own NOT-NULL
 * defaults, never guessed.
 */
export function buildFinancialProfileFromEmploymentFields(
  fields: ExtractedEmploymentFieldsForProfile
): ExtractedFinancialProfile {
  return {
    monthlyIncome: fields.monthly_salary ?? 0,
    monthlyExpenses: 0,
    existingLoans: 0,
    employmentType: fields.employment_status?.trim() || 'unknown',
    loanAmount: 0,
    loanPurpose: 'unknown',
    salaryCurrency: fields.currency?.trim() || 'ILS',
    jobRole: fields.job_title?.trim() || null,
    source: 'employment_proof_extracted',
  };
}
