// Supabase Edge Function: credit-assessment
// ---------------------------------------------------------------------------
// AI-powered credit risk assessment. The AI is the SOURCE OF TRUTH for the
// score, category, recommended action and explanation.
//
// Deploy:   supabase functions deploy credit-assessment
// Secrets:  supabase secrets set OPENROUTER_API_KEY=sk-or-v1-...
//           (optional) supabase secrets set CREDIT_MODEL=openai/gpt-4o-mini
//           (optional) supabase secrets set CREDIT_MAX_TOKENS=400
// ---------------------------------------------------------------------------

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
const CREDIT_MODEL = Deno.env.get("CREDIT_MODEL") ?? "openai/gpt-4o-mini";
// Keep low enough for OpenRouter credit budgets (HTTP 402 when too high).
// Slim JSON output (no derived_features echo) fits comfortably in ~400 tokens.
const MAX_TOKENS = Number(Deno.env.get("CREDIT_MAX_TOKENS") ?? "400");

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

function maskSecret(value: string | undefined): string {
  if (!value) return "(missing)";
  if (value.length <= 8) return "***";
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

const SYSTEM_PROMPT = `You are a senior bank credit risk officer for a retail bank.
Assess loan applications strictly from the structured financial fields provided.
Respond with ONLY a single valid JSON object — no markdown, no code fences.

Scoring rules:
- "score": integer 0 (lowest risk) to 100 (highest risk).
- "category": "low" if score < 40, "medium" if 40-69, "high" if score >= 70.
- Higher debt service ratio, higher loan-to-income ratio, negative disposable income,
  and unstable employment increase risk.
- "recommended_action": "approve" | "manual_review" | "reject".
- "confidence": number 0-1.
- "top_factors": exactly 3 items, each { "label", "impact" ("high"|"medium"|"low"),
  "direction" ("increases risk"|"decreases risk"), "value" (short string) }.
- "summary": one professional sentence, no markdown.
- "result_source": "ai".
- "assessed_at": use the provided assessment timestamp.

Do NOT include derived_features in your response — the server adds them.

Return JSON shaped exactly:
{
  "score": number,
  "category": "low" | "medium" | "high",
  "confidence": number,
  "summary": string,
  "top_factors": [ { "label": string, "impact": string, "direction": string, "value": string } ],
  "recommended_action": "approve" | "manual_review" | "reject",
  "assessed_at": string,
  "result_source": "ai"
}`;

async function callModel(payload: unknown, assessedAt: string): Promise<string> {
  const apiKey = Deno.env.get("OPENROUTER_API_KEY");
  const aiConfigured = Boolean(apiKey);
  console.log("[credit-assessment] ai_configured:", aiConfigured, {
    model: CREDIT_MODEL,
    max_tokens: MAX_TOKENS,
    api_key: maskSecret(apiKey),
  });
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is not configured");

  const userMessage = JSON.stringify({
    instruction:
      "Assess this loan application and return the strict JSON result object.",
    assessment_timestamp: assessedAt,
    application: payload,
  });

  console.log("[credit-assessment] ai_attempted: true — calling OpenRouter");
  const res = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "http://localhost:8080",
      "X-Title": "Palestine Intel Hub",
    },
    body: JSON.stringify({
      model: CREDIT_MODEL,
      temperature: 0,
      top_p: 1,
      seed: 7,
      max_tokens: MAX_TOKENS,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userMessage },
      ],
    }),
  });

  console.log("[credit-assessment] OpenRouter HTTP status:", res.status);
  if (!res.ok) {
    const detail = await res.text();
    console.error("[credit-assessment] OpenRouter error body:", detail);
    throw new Error(`AI request failed (${res.status}): ${detail}`);
  }

  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  const finishReason = data?.choices?.[0]?.finish_reason;
  console.log("[credit-assessment] finish_reason:", finishReason);
  console.log(
    "[credit-assessment] raw AI content:",
    typeof content === "string" ? content.slice(0, 2000) : String(content),
  );
  if (finishReason === "length") {
    throw new Error(
      `AI response truncated (max_tokens=${MAX_TOKENS}). Increase CREDIT_MAX_TOKENS or add OpenRouter credits.`,
    );
  }
  if (typeof content !== "string" || !content.trim()) {
    throw new Error("AI returned an empty response");
  }
  return content;
}

function extractJson(text: string): unknown {
  const cleaned = text.replace(/```json/gi, "").replace(/```/g, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start !== -1 && end !== -1 && end > start) {
      return JSON.parse(cleaned.slice(start, end + 1));
    }
    throw new Error("AI response was not valid JSON");
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  try {
    const body = await req.json();
    const input = body?.input;
    const derived = body?.derived;

    console.log("[credit-assessment] payload keys:", {
      inputKeys: input && typeof input === "object" ? Object.keys(input) : null,
      derivedKeys: derived && typeof derived === "object" ? Object.keys(derived) : null,
    });

    if (!input || typeof input !== "object") {
      return json(400, { error: "Missing 'input' financial payload" });
    }

    const assessedAt = new Date().toISOString();
    const content = await callModel({ input, derived }, assessedAt);
    const parsed = extractJson(content) as Record<string, unknown>;
    console.log("[credit-assessment] parsed result:", {
      score: parsed?.score,
      category: parsed?.category,
      recommended_action: parsed?.recommended_action,
      factors: Array.isArray(parsed?.top_factors) ? parsed.top_factors.length : 0,
      result_source: "ai",
    });

    parsed.result_source = "ai";
    parsed.assessed_at =
      typeof parsed.assessed_at === "string" ? parsed.assessed_at : assessedAt;
    // Server-controlled: use deterministic derived features from the client payload.
    if (derived && typeof derived === "object") {
      parsed.derived_features = derived;
    }

    return json(200, { result: parsed });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[credit-assessment] failed:", message);
    return json(500, { error: message });
  }
});
