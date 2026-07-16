/**
 * Shared, bilingual field-level validation used across every user-entry
 * surface that accepts the same kind of value — Credit Risk assessments
 * (new + objection/modification), Open New Account, and User Management.
 *
 * Pure functions only: no React, no Supabase. Every rule lives here exactly
 * once, so the same value is judged the same way everywhere it's entered —
 * this is deliberately the single place these business rules are defined,
 * per the QA hardening pass this module was written for.
 *
 * Convention: every validator returns a ValidationResult. `valid: false`
 * always carries a ready-to-display bilingual message (hand it straight to
 * `toast.error(language === 'ar' ? message.ar : message.en)`).
 *
 * Relative imports use explicit `.ts` extensions so this module (and its
 * unit tests) resolve correctly under Node's plain `--test` runner, in
 * addition to Vite/tsc — same convention as loanCalculator.ts etc.
 */
import { getMinimumLoanAmount, MIN_LOAN_AMOUNT_USD, type LoanCurrency } from './loanProducts.ts';

export interface BilingualMessage {
  en: string;
  ar: string;
}

export interface ValidationResult {
  valid: boolean;
  message?: BilingualMessage;
}

const ok: ValidationResult = { valid: true };

function fail(en: string, ar: string): ValidationResult {
  return { valid: false, message: { en, ar } };
}

// ---------------------------------------------------------------------------
// Names / short free text
// ---------------------------------------------------------------------------

/** Applies to every "person/customer name"-shaped field app-wide. */
export const MAX_NAME_LENGTH = 250;

export function validateName(
  name: string,
  options: { required?: boolean; label?: BilingualMessage } = {}
): ValidationResult {
  const trimmed = name.trim();
  const required = options.required ?? true;
  const label = options.label ?? { en: 'This field', ar: 'هذا الحقل' };

  if (!trimmed) {
    return required ? fail(`${label.en} is required.`, `${label.ar} مطلوب.`) : ok;
  }
  if (trimmed.length > MAX_NAME_LENGTH) {
    return fail(
      `${label.en} must be ${MAX_NAME_LENGTH} characters or fewer (currently ${trimmed.length}).`,
      `${label.ar} يجب ألا يتجاوز ${MAX_NAME_LENGTH} حرفًا (الطول الحالي ${trimmed.length}).`
    );
  }
  return ok;
}

/** Applies to free-text notes/comments/reasons — deliberately longer than a name field. */
export const MAX_NOTES_LENGTH = 1000;

export function validateNotes(
  text: string,
  options: { required?: boolean; label?: BilingualMessage; maxLength?: number } = {}
): ValidationResult {
  const trimmed = text.trim();
  const required = options.required ?? false;
  const label = options.label ?? { en: 'This field', ar: 'هذا الحقل' };
  const maxLength = options.maxLength ?? MAX_NOTES_LENGTH;

  if (!trimmed) {
    return required ? fail(`${label.en} is required.`, `${label.ar} مطلوب.`) : ok;
  }
  if (trimmed.length > maxLength) {
    return fail(
      `${label.en} must be ${maxLength} characters or fewer (currently ${trimmed.length}).`,
      `${label.ar} يجب ألا يتجاوز ${maxLength} حرفًا (الطول الحالي ${trimmed.length}).`
    );
  }
  return ok;
}

// ---------------------------------------------------------------------------
// National ID
// ---------------------------------------------------------------------------

export const MIN_NATIONAL_ID_LENGTH = 7;
export const MAX_NATIONAL_ID_LENGTH = 15;
const NATIONAL_ID_PATTERN = /^\d+$/;

/**
 * Digits-only, 7-15 characters.
 *
 * WHY THIS RANGE: there is no formally documented national-ID format
 * anywhere in this project. The two things that DO exist — this app's own
 * seed data (`supabase/migrations/20260621100000_bank_customers.sql`, all 10
 * rows are 12-digit numeric strings) and the OCR extraction convention
 * (`backend/services/llm_extractor.py`: "id_number: digits only, no
 * spaces") — both agree on "digits only". 7-15 is deliberately WIDER than
 * exactly-12 so a legitimate format variation isn't rejected, while still
 * catching obviously-wrong values (letters, a single stray digit, a
 * 40-character garbage string from a bad OCR read).
 */
export function validateNationalId(
  id: string,
  options: { required?: boolean } = {}
): ValidationResult {
  const trimmed = id.trim();
  const required = options.required ?? true;

  if (!trimmed) {
    return required ? fail('National ID is required.', 'رقم الهوية مطلوب.') : ok;
  }
  if (!NATIONAL_ID_PATTERN.test(trimmed)) {
    return fail('National ID must contain digits only.', 'يجب أن يتكون رقم الهوية من أرقام فقط.');
  }
  if (trimmed.length < MIN_NATIONAL_ID_LENGTH || trimmed.length > MAX_NATIONAL_ID_LENGTH) {
    return fail(
      `National ID must be between ${MIN_NATIONAL_ID_LENGTH} and ${MAX_NATIONAL_ID_LENGTH} digits.`,
      `يجب أن يتكون رقم الهوية من ${MIN_NATIONAL_ID_LENGTH} إلى ${MAX_NATIONAL_ID_LENGTH} رقمًا.`
    );
  }
  return ok;
}

// ---------------------------------------------------------------------------
// Monetary amounts (income, expenses, obligations, existing loans)
// ---------------------------------------------------------------------------

export function validateNonNegativeAmount(value: number, label: BilingualMessage): ValidationResult {
  if (!Number.isFinite(value)) {
    return fail(`${label.en} must be a valid number.`, `${label.ar} يجب أن يكون رقمًا صحيحًا.`);
  }
  if (value < 0) {
    return fail(`${label.en} cannot be negative.`, `${label.ar} لا يمكن أن يكون سالبًا.`);
  }
  return ok;
}

// ---------------------------------------------------------------------------
// Loan amount — positive + bank-wide minimum, currency-aware
// ---------------------------------------------------------------------------

/**
 * Loan amount must be a positive number, and at least 8,000 USD or the
 * equivalent in the loan's own currency (see loanProducts.ts's
 * getMinimumLoanAmount / MIN_LOAN_AMOUNT_USD for exactly how "equivalent" is
 * computed — reuses the app's one existing FX table, never a separate guess).
 */
export function validateLoanAmount(amount: number, currency: LoanCurrency): ValidationResult {
  if (!Number.isFinite(amount) || amount <= 0) {
    return fail('Loan amount must be a positive number.', 'يجب أن يكون مبلغ القرض رقمًا موجبًا.');
  }
  const minimum = getMinimumLoanAmount(currency);
  if (amount < minimum) {
    const minRounded = Math.round(minimum * 100) / 100;
    return fail(
      `Loan amount must be at least ${currency} ${minRounded.toLocaleString()} (equivalent to USD ${MIN_LOAN_AMOUNT_USD.toLocaleString()}).`,
      `يجب ألا يقل مبلغ القرض عن ${minRounded.toLocaleString()} ${currency} (ما يعادل ${MIN_LOAN_AMOUNT_USD.toLocaleString()} دولار أمريكي).`
    );
  }
  return ok;
}

// ---------------------------------------------------------------------------
// Age — general realistic-age bounds (Open New Account / date of birth)
// ---------------------------------------------------------------------------

/**
 * General realistic-age bounds, used wherever an age is derived from a
 * date of birth rather than entered as a loan-applicant's age directly (see
 * validateLoanApplicantAge for that narrower, pre-existing rule). 120 is the
 * outer bound the QA hardening pass explicitly calls for; 18 reflects that
 * every named party in this system (account holder, loan applicant) is
 * expected to be an adult, consistent with validateLoanApplicantAge's floor.
 */
export const MIN_REALISTIC_AGE = 18;
export const MAX_REALISTIC_AGE = 120;

export function validateAge(age: number): ValidationResult {
  if (!Number.isFinite(age)) {
    return fail('Age must be a valid number.', 'يجب أن يكون العمر رقمًا صحيحًا.');
  }
  if (age < 0) {
    return fail('Age cannot be negative.', 'لا يمكن أن يكون العمر سالبًا.');
  }
  if (age < MIN_REALISTIC_AGE) {
    return fail(`Age must be at least ${MIN_REALISTIC_AGE}.`, `يجب أن يكون العمر ${MIN_REALISTIC_AGE} سنة على الأقل.`);
  }
  if (age > MAX_REALISTIC_AGE) {
    return fail(`Age must be ${MAX_REALISTIC_AGE} or less.`, `يجب ألا يتجاوز العمر ${MAX_REALISTIC_AGE} سنة.`);
  }
  return ok;
}

export interface DateOfBirthValidation extends ValidationResult {
  age?: number;
}

/**
 * Validates a date-of-birth string (expects the "YYYY-MM-DD" shape produced
 * by the native <input type="date"> used everywhere this is collected) and
 * derives the implied age. Rejects an unparseable string, a future date, and
 * any derived age outside [MIN_REALISTIC_AGE, MAX_REALISTIC_AGE] — so a
 * wildly wrong OCR read or typo can never reach the printed account-opening
 * form or the customer record.
 */
export function validateDateOfBirth(dateStr: string, referenceDate: Date = new Date()): DateOfBirthValidation {
  const trimmed = dateStr.trim();
  if (!trimmed) {
    return { valid: false, message: { en: 'Date of birth is required.', ar: 'تاريخ الميلاد مطلوب.' } };
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    return { valid: false, message: { en: 'Date of birth is not a valid date.', ar: 'تاريخ الميلاد غير صالح.' } };
  }

  if (parsed.getTime() > referenceDate.getTime()) {
    return {
      valid: false,
      message: { en: 'Date of birth cannot be in the future.', ar: 'لا يمكن أن يكون تاريخ الميلاد في المستقبل.' },
    };
  }

  let age = referenceDate.getFullYear() - parsed.getFullYear();
  const monthDiff = referenceDate.getMonth() - parsed.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && referenceDate.getDate() < parsed.getDate())) {
    age -= 1;
  }

  const ageCheck = validateAge(age);
  if (!ageCheck.valid) {
    return { ...ageCheck, age };
  }
  return { valid: true, age };
}

// ---------------------------------------------------------------------------
// Loan-applicant age / loan term — centralizing CreditRisk.tsx's existing,
// already-correct inline rules (unchanged bounds, now reusable/testable).
// ---------------------------------------------------------------------------

/** Deliberately tighter than validateAge's 120 — a loan applicant's own stated age, not a generic date-of-birth-derived one. Matches the pre-existing CreditRisk.tsx rule. */
export const MIN_LOAN_APPLICANT_AGE = 18;
export const MAX_LOAN_APPLICANT_AGE = 100;

export function validateLoanApplicantAge(age: number): ValidationResult {
  if (!Number.isFinite(age) || age < MIN_LOAN_APPLICANT_AGE || age > MAX_LOAN_APPLICANT_AGE) {
    return fail(
      `Please enter a valid client age (${MIN_LOAN_APPLICANT_AGE}–${MAX_LOAN_APPLICANT_AGE}).`,
      `يرجى إدخال عمر صحيح للعميل (${MIN_LOAN_APPLICANT_AGE}–${MAX_LOAN_APPLICANT_AGE}).`
    );
  }
  return ok;
}

export const MIN_LOAN_TERM_YEARS = 1;
export const MAX_LOAN_TERM_YEARS = 30;

export function validateLoanTermYears(years: number): ValidationResult {
  if (!Number.isFinite(years) || years < MIN_LOAN_TERM_YEARS || years > MAX_LOAN_TERM_YEARS) {
    return fail(
      `Please enter a valid loan term in years (${MIN_LOAN_TERM_YEARS}–${MAX_LOAN_TERM_YEARS}).`,
      `يرجى إدخال مدة قرض صحيحة بالسنوات (${MIN_LOAN_TERM_YEARS}–${MAX_LOAN_TERM_YEARS})`
    );
  }
  return ok;
}

// ---------------------------------------------------------------------------
// Email
// ---------------------------------------------------------------------------

// Deliberately simple/pragmatic, not a full RFC 5322 implementation — this
// only needs to catch obviously-wrong input before it reaches Supabase Auth,
// which remains the real authority on email deliverability/validity.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateEmail(email: string, options: { required?: boolean } = {}): ValidationResult {
  const trimmed = email.trim();
  const required = options.required ?? true;

  if (!trimmed) {
    return required ? fail('Email is required.', 'البريد الإلكتروني مطلوب.') : ok;
  }
  if (!EMAIL_PATTERN.test(trimmed)) {
    return fail('Please enter a valid email address.', 'يرجى إدخال بريد إلكتروني صالح.');
  }
  return ok;
}

// ---------------------------------------------------------------------------
// Objection / modification "new value" dispatch — validates a proposed
// change to an approval_requests field the SAME way that field is validated
// when entered directly on the New Assessment form, based on which column
// is being edited (see EDITABLE_FIELDS in CreditRisk.tsx).
// ---------------------------------------------------------------------------

export type ObjectionFieldKey =
  | 'customer_name'
  | 'national_id'
  | 'monthly_income'
  | 'monthly_expenses'
  | 'existing_loans'
  | 'employment_type'
  | 'loan_amount'
  | 'loan_purpose'
  | 'amount'
  | 'notes';

/**
 * `loanCurrency` is only consulted for loan_amount/amount. When the caller
 * doesn't have currency context handy, the bank-wide minimum is still
 * enforced in ILS (this app's default currency) rather than skipped — a
 * modification request can never bypass the minimum just because currency
 * context wasn't threaded through to this call site.
 */
export function validateObjectionFieldValue(
  fieldKey: string,
  rawValue: string,
  loanCurrency: LoanCurrency = 'ILS'
): ValidationResult {
  const trimmed = rawValue.trim();

  switch (fieldKey as ObjectionFieldKey) {
    case 'customer_name':
      return validateName(trimmed, { label: { en: 'Customer name', ar: 'اسم العميل' } });
    case 'national_id':
      return validateNationalId(trimmed, { required: false });
    case 'monthly_income':
      return validateNonNegativeAmount(Number(trimmed), { en: 'Monthly income', ar: 'الدخل الشهري' });
    case 'monthly_expenses':
      return validateNonNegativeAmount(Number(trimmed), { en: 'Monthly expenses', ar: 'المصاريف الشهرية' });
    case 'existing_loans':
      return validateNonNegativeAmount(Number(trimmed), { en: 'Existing loans', ar: 'القروض الحالية' });
    case 'loan_amount':
    case 'amount':
      return validateLoanAmount(Number(trimmed), loanCurrency);
    case 'employment_type':
    case 'loan_purpose':
      return validateName(trimmed, { required: false, label: { en: 'This field', ar: 'هذا الحقل' } });
    case 'notes':
      return validateNotes(trimmed);
    default:
      return ok;
  }
}
