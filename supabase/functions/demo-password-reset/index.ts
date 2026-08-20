// Supabase Edge Function: demo-password-reset
// ---------------------------------------------------------------------------
// DEMO-ONLY alternate login flow. Confirmed by the project owner as a
// prototype-only behavior, NOT to be reused in production:
//
//   A verification code for ANY existing bank-account email is delivered to
//   ONE FIXED inbox (the DEMO_RESET_RECIPIENT_EMAIL secret), never to the
//   account's own email. See supabase/migrations/20260821090000_demo_
//   password_reset_codes.sql for the full limitations note — this
//   collapses per-account isolation on this one flow and must never exist
//   in anything with real users or real money.
//
// This function NEVER reads or writes auth.users.encrypted_password. The
// actual session is issued by real Supabase Auth machinery
// (admin.auth.admin.generateLink + the browser's own supabase.auth.
// verifyOtp) — this function's own 6-digit code check is only a gate in
// front of that real token, not a substitute for it. See the "verify"
// branch below for exactly where that handoff happens.
//
// Actions (POST JSON body):
//   { action: 'request', email }
//     -> ALWAYS { ok: true, message: "..." }, identical whether or not the
//        email matched a real account, so this endpoint never reveals
//        account existence.
//   { action: 'verify', email, code }
//     -> { ok: true, token_hash, type: 'magiclink' } on a correct, unused,
//        unexpired code (attempts under the limit) — the browser then
//        calls supabase.auth.verifyOtp({ token_hash, type }) itself.
//     -> { ok: false, error } (identical generic message for wrong code,
//        expired code, too many attempts, or unknown email) otherwise.
//
// Secrets (supabase secrets set ...):
//   RESEND_API_KEY             - Resend transactional email API key.
//   DEMO_RESET_RECIPIENT_EMAIL - the one fixed inbox codes are sent to.
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are injected automatically.
//
// Deploy: supabase functions deploy demo-password-reset
// ---------------------------------------------------------------------------

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CODE_LENGTH = 6;
const CODE_TTL_MINUTES = 10;
const MAX_ATTEMPTS = 5;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Identical response whether or not the email matched a real account —
// this is what makes the request endpoint non-enumerating.
const GENERIC_REQUEST_RESPONSE = {
  ok: true,
  message: "If that account exists, a verification code has been sent.",
};

// Identical response for every verify failure mode — wrong code, expired,
// too many attempts, or an email with no account at all.
const GENERIC_VERIFY_ERROR = { ok: false, error: "Invalid or expired code." };

function generateCode(): string {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  const n = new DataView(bytes.buffer).getUint32(0) % 10 ** CODE_LENGTH;
  return n.toString().padStart(CODE_LENGTH, "0");
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Constant-time comparison so a wrong-code check can't leak how many
// leading characters matched via response timing.
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function sendCodeEmail(bankEmail: string, code: string) {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  const recipient = Deno.env.get("DEMO_RESET_RECIPIENT_EMAIL");
  if (!apiKey || !recipient) {
    throw new Error("Email is not configured (RESEND_API_KEY / DEMO_RESET_RECIPIENT_EMAIL missing)");
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: "BoP Intelligence Platform (demo) <onboarding@resend.dev>",
      to: [recipient],
      subject: `[DEMO] Password reset code for ${bankEmail}`,
      text:
        `PROTOTYPE ONLY — this code was requested for the bank account "${bankEmail}" ` +
        `but is delivered here because this demo has no per-user recovery email configured.\n\n` +
        `Verification code: ${code}\n\n` +
        `Expires in ${CODE_TTL_MINUTES} minutes. If you didn't expect this, ignore it.`,
    }),
  });

  if (!res.ok) {
    throw new Error(`Resend API error (${res.status}): ${await res.text()}`);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) {
    return json(500, { error: "Function is missing Supabase env vars" });
  }
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "Invalid JSON body" });
  }

  const action = body.action;
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!email) return json(400, { error: "email is required" });

  try {
    if (action === "request") {
      // Existence check via `profiles` (which stores email — see
      // admin-users/index.ts's own upsert) rather than GoTrue's admin
      // listUsers, which has no email filter in the installed SDK version.
      const { data: profile } = await admin.from("profiles").select("id").eq("email", email).maybeSingle();

      if (profile?.id) {
        const code = generateCode();
        const codeHash = await sha256Hex(code);
        const expiresAt = new Date(Date.now() + CODE_TTL_MINUTES * 60_000).toISOString();

        // Supersede any prior unconsumed code for this email so there's
        // never ambiguity about which code is current.
        await admin
          .from("demo_password_reset_codes")
          .update({ consumed_at: new Date().toISOString() })
          .eq("email", email)
          .is("consumed_at", null);

        const { error: insertErr } = await admin.from("demo_password_reset_codes").insert({
          user_id: profile.id,
          email,
          code_hash: codeHash,
          expires_at: expiresAt,
        });

        if (insertErr) {
          console.error("[demo-password-reset] failed to store code:", insertErr.message);
          return json(200, GENERIC_REQUEST_RESPONSE); // never leak internal state
        }

        try {
          await sendCodeEmail(email, code);
        } catch (sendErr) {
          console.error("[demo-password-reset] failed to send email:", (sendErr as Error).message);
        }
      }

      return json(200, GENERIC_REQUEST_RESPONSE); // identical regardless of match
    }

    if (action === "verify") {
      const code = typeof body.code === "string" ? body.code.trim() : "";
      if (!code) return json(400, { error: "code is required" });

      const { data: row } = await admin
        .from("demo_password_reset_codes")
        .select("id, code_hash, attempts, expires_at, consumed_at")
        .eq("email", email)
        .is("consumed_at", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!row) return json(401, GENERIC_VERIFY_ERROR);
      if (row.attempts >= MAX_ATTEMPTS) return json(401, GENERIC_VERIFY_ERROR);
      if (new Date(row.expires_at).getTime() < Date.now()) return json(401, GENERIC_VERIFY_ERROR);

      // Count this attempt BEFORE checking correctness, so a client can
      // never dodge the attempt limit by aborting requests early.
      await admin.from("demo_password_reset_codes").update({ attempts: row.attempts + 1 }).eq("id", row.id);

      const submittedHash = await sha256Hex(code);
      if (!timingSafeEqual(submittedHash, row.code_hash)) {
        return json(401, GENERIC_VERIFY_ERROR);
      }

      // Correct — consume it (single-use) before minting anything.
      await admin
        .from("demo_password_reset_codes")
        .update({ consumed_at: new Date().toISOString() })
        .eq("id", row.id);

      // The real session comes from here, not from this function directly
      // — see the module header. Never touches the password.
      const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
        type: "magiclink",
        email,
      });

      if (linkErr || !link?.properties?.hashed_token) {
        console.error("[demo-password-reset] generateLink failed:", linkErr?.message);
        return json(500, { ok: false, error: "Could not complete sign-in. Please try again." });
      }

      return json(200, { ok: true, token_hash: link.properties.hashed_token, type: "magiclink" });
    }

    return json(400, { error: `Unknown action: ${action}` });
  } catch (e) {
    console.error("[demo-password-reset] unhandled error:", e);
    return json(500, { ok: false, error: "Something went wrong. Please try again." });
  }
});
