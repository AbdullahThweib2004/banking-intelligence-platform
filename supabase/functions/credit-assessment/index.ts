// Supabase Edge Function: credit-assessment
// ---------------------------------------------------------------------------
// AI EXPLANATION layer for credit risk assessment.
//
// IMPORTANT — this function does NOT compute the risk score, category,
// eligibility, or any monetary figure. Those are always computed
// deterministically on the client (src/lib/creditScoring.ts, backed by
// loanCalculator.ts / loanEligibility.ts / loanRiskScoring.ts) BEFORE this
// function is ever called. This function receives that already-final result
// and returns ONLY a natural-language explanation of it — it must not
// invent or override any number.
//
// Request:  { input: {...context}, formula_result: {...already-computed} }
// Response: { explanation: string }
//
// Deploy:   supabase functions deploy credit-assessment
// Secrets:  supabase secrets set OPENROUTER_API_KEY=sk-or-v1-...
//           (optional) supabase secrets set CREDIT_MODEL=krea/krea-2-medium
//           (optional) supabase secrets set CREDIT_MAX_TOKENS=350
// ---------------------------------------------------------------------------

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
const CREDIT_MODEL = Deno.env.get("CREDIT_MODEL") ?? "krea/krea-2-medium";
const MAX_TOKENS = Number(Deno.env.get("CREDIT_MAX_TOKENS") ?? "350");

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

const SYSTEM_PROMPT = `You are a senior bank credit risk officer writing a short explanation for a colleague.

You will be given a loan application's FINAL, already-decided figures: risk
score, risk category, eligibility status, debt burden ratio, age at loan
maturity, monthly installment, total interest, total repaid, interest rate,
and the top contributing factors. These numbers are FINAL and were computed
by the bank's deterministic calculation engine — you must NOT recompute,
question, contradict, or invent a different score/category/number. Your only
job is to explain them clearly in plain language.

Write a short, professional explanation (3-6 sentences, plain text, no
markdown, no code fences, no JSON) that:
- states the monthly installment, interest rate, and loan type in context
- explains the debt burden ratio relative to the 50% cap, and whether that
  drove the result
- explains the age-at-maturity check relative to the 70 cap, if relevant
- names the 1-3 largest contributing factors from top_contributions and
  whether each raises or lowers risk
- if eligibility_status is "not_eligible", clearly states the application is
  NOT eligible and why, and that rejection is recommended regardless of the
  numeric score
- ends with a short recommendation/caution note appropriate to the category

Respond with ONLY a single valid JSON object, no markdown, no code fences:
{ "explanation": string }`;

async function callModel(payload: unknown): Promise<string> {
  const apiKey = Deno.env.get("OPENROUTER_API_KEY");
  const aiConfigured = Boolean(apiKey);
  console.log("[credit-assessment] ai_configured:", aiConfigured, {
    model: CREDIT_MODEL,
    max_tokens: MAX_TOKENS,
    api_key: maskSecret(apiKey),
  });
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is not configured");

  const userMessage = JSON.stringify({
    instruction: "Explain this already-decided loan assessment result.",
    ...(payload as Record<string, unknown>),
  });

  console.log("[credit-assessment] calling OpenRouter for narrative explanation");
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
      temperature: 0.2,
      top_p: 1,
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
    const formulaResult = body?.formula_result;

    if (!formulaResult || typeof formulaResult !== "object") {
      return json(400, { error: "Missing 'formula_result' — the deterministic result must be computed first" });
    }
    if (typeof formulaResult.score !== "number" || typeof formulaResult.category !== "string") {
      return json(400, { error: "'formula_result' is missing score/category" });
    }

    console.log("[credit-assessment] explaining final result:", {
      score: formulaResult.score,
      category: formulaResult.category,
      eligibility_status: formulaResult.eligibility_status,
    });

    const content = await callModel({ input: body?.input, formula_result: formulaResult });
    const parsed = extractJson(content) as Record<string, unknown>;

    const explanation = typeof parsed.explanation === "string" ? parsed.explanation.trim() : "";
    if (!explanation) {
      return json(502, { error: "AI response missing an explanation" });
    }

    return json(200, { explanation });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[credit-assessment] failed:", message);
    return json(500, { error: message });
  }
});
