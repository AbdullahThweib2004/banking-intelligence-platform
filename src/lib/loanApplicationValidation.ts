/**
 * Pure validation for the Loan Application workflow's signature step. Kept
 * free of any Supabase import so it can be unit tested directly (see the
 * project's established convention: files touching the Supabase client are
 * not unit tested, only pure logic modules are).
 *
 * Customer-data-completeness and requested-amount validation are already
 * covered by the Credit Risk assessment form's own established rules
 * (src/lib/validation.ts — validateName, validateNationalId,
 * validateLoanAmount, etc.) before a risk assessment can even run, so this
 * module only adds the one net-new rule this workflow introduces: a
 * signature must be captured before the signed request can be submitted.
 */

export interface ValidationResult {
  ok: boolean;
  error?: string;
}

export function validateSignaturePresent(dataUrl: string | null, language: 'en' | 'ar'): ValidationResult {
  if (!dataUrl || dataUrl.trim().length === 0) {
    return {
      ok: false,
      error: language === 'ar'
        ? 'يجب على العميل التوقيع على المستند قبل الإرسال.'
        : 'The customer must sign the document before it can be submitted.',
    };
  }
  return { ok: true };
}
