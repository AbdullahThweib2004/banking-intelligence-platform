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
