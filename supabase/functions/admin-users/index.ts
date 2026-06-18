// Supabase Edge Function: admin-users
// ---------------------------------------------------------------------------
// Secure, server-side user management for the User Management page.
// Uses the SERVICE ROLE key (never exposed to the browser) and only allows
// callers whose profile role is 'branch_manager'.
//
// Actions (POST JSON body):
//   { action: 'create', email, full_name, role, department }
//   { action: 'update', id, role?, status?, department?, full_name? }
//   { action: 'delete', id }
//
// Deploy:   supabase functions deploy admin-users
// Env:      SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are
//           injected automatically by Supabase at runtime.
// ---------------------------------------------------------------------------

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ROLES = ["branch_employee", "branch_manager", "risk_department"];

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function randomPassword(): string {
  // 16-char temp password with mixed character classes.
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  const base = btoa(String.fromCharCode(...bytes)).replace(/[^a-zA-Z0-9]/g, "");
  return `Bop!${base}9`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !serviceKey || !anonKey) {
    return json(500, { error: "Function is missing Supabase env vars" });
  }

  // Identify the caller from their JWT.
  const authHeader = req.headers.get("Authorization") ?? "";
  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const {
    data: { user: caller },
    error: callerErr,
  } = await callerClient.auth.getUser();
  if (callerErr || !caller) {
    return json(401, { error: "Unauthorized" });
  }

  // Service-role client for privileged operations.
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Authorize: only branch_manager may manage users (source of truth = profiles).
  const { data: callerProfile, error: profErr } = await admin
    .from("profiles")
    .select("role")
    .eq("id", caller.id)
    .single();
  if (profErr || callerProfile?.role !== "branch_manager") {
    return json(403, { error: "Forbidden: branch_manager role required" });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "Invalid JSON body" });
  }

  const action = body.action;

  try {
    if (action === "create") {
      const email = String(body.email ?? "").trim();
      const fullName = String(body.full_name ?? "").trim();
      const role = String(body.role ?? "");
      const department = body.department ? String(body.department) : null;

      if (!email || !role) {
        return json(400, { error: "email and role are required" });
      }
      if (!ALLOWED_ROLES.includes(role)) {
        return json(400, { error: `Invalid role: ${role}` });
      }

      const password = randomPassword();
      const { data: created, error: createErr } = await admin.auth.admin
        .createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { full_name: fullName, role, department },
          app_metadata: { role },
        });
      if (createErr || !created.user) {
        return json(400, { error: createErr?.message ?? "Failed to create user" });
      }

      // The on_auth_user_created trigger already inserted a profile row;
      // upsert to fill the extra fields (department/status/email/full_name).
      const { error: upsertErr } = await admin.from("profiles").upsert(
        {
          id: created.user.id,
          full_name: fullName,
          email,
          role,
          department,
          status: "active",
        },
        { onConflict: "id" },
      );
      if (upsertErr) {
        return json(400, { error: upsertErr.message });
      }

      return json(200, {
        ok: true,
        user: { id: created.user.id, email },
        tempPassword: password,
      });
    }

    if (action === "update") {
      const id = String(body.id ?? "");
      if (!id) return json(400, { error: "id is required" });

      const patch: Record<string, unknown> = {};
      if (body.role !== undefined) {
        if (!ALLOWED_ROLES.includes(String(body.role))) {
          return json(400, { error: `Invalid role: ${body.role}` });
        }
        patch.role = body.role;
      }
      if (body.status !== undefined) patch.status = body.status;
      if (body.department !== undefined) patch.department = body.department;
      if (body.full_name !== undefined) patch.full_name = body.full_name;

      if (Object.keys(patch).length > 0) {
        const { error: updErr } = await admin.from("profiles").update(patch).eq(
          "id",
          id,
        );
        if (updErr) return json(400, { error: updErr.message });
      }

      // Keep the JWT role claim in sync when role changes.
      if (body.role !== undefined || body.full_name !== undefined) {
        const meta: Record<string, unknown> = {};
        if (body.role !== undefined) meta.role = body.role;
        if (body.full_name !== undefined) meta.full_name = body.full_name;
        const appMeta = body.role !== undefined ? { role: body.role } : undefined;
        const { error: authUpdErr } = await admin.auth.admin.updateUserById(id, {
          user_metadata: meta,
          ...(appMeta ? { app_metadata: appMeta } : {}),
        });
        if (authUpdErr) return json(400, { error: authUpdErr.message });
      }

      return json(200, { ok: true });
    }

    if (action === "delete") {
      const id = String(body.id ?? "");
      if (!id) return json(400, { error: "id is required" });
      if (id === caller.id) {
        return json(400, { error: "You cannot delete your own account" });
      }
      const { error: delErr } = await admin.auth.admin.deleteUser(id);
      if (delErr) return json(400, { error: delErr.message });
      // profiles row is removed automatically via ON DELETE CASCADE.
      return json(200, { ok: true });
    }

    return json(400, { error: `Unknown action: ${action}` });
  } catch (e) {
    return json(500, { error: (e as Error).message ?? "Internal error" });
  }
});
