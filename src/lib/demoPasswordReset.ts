/**
 * Client wrapper for the demo-password-reset edge function — PROTOTYPE
 * ONLY. Verification codes for any bank-account email are delivered to one
 * fixed inbox, never to the account's own email; see
 * supabase/functions/demo-password-reset/index.ts's header comment for the
 * full design/limitations before touching this.
 */
import { supabase } from '@/integrations/supabase/client';

const EDGE_FUNCTION = 'demo-password-reset';

export interface RequestCodeResult {
  ok: boolean;
  message?: string;
}

export interface VerifyCodeResult {
  ok: boolean;
  error?: string;
}

/** Always resolves with a generic message — never reveals whether the email matched an account. */
export async function requestResetCode(email: string): Promise<RequestCodeResult> {
  const { data, error } = await supabase.functions.invoke(EDGE_FUNCTION, {
    body: { action: 'request', email },
  });
  if (error) {
    return { ok: false, message: 'Something went wrong. Please try again.' };
  }
  return data as RequestCodeResult;
}

/**
 * On a correct code, exchanges the edge function's real Supabase-issued
 * token_hash for an actual session via the standard verifyOtp call — this
 * is the same client-side call any real magic-link flow uses. The account's
 * password is never read or written anywhere in this path.
 */
export async function verifyResetCode(email: string, code: string): Promise<VerifyCodeResult> {
  const { data, error } = await supabase.functions.invoke(EDGE_FUNCTION, {
    body: { action: 'verify', email, code },
  });

  if (error || !data?.ok) {
    return { ok: false, error: data?.error ?? 'Invalid or expired code.' };
  }

  const { error: otpError } = await supabase.auth.verifyOtp({
    token_hash: data.token_hash,
    type: data.type,
  });

  if (otpError) {
    return { ok: false, error: 'Could not complete sign-in. Please try again.' };
  }

  return { ok: true };
}
