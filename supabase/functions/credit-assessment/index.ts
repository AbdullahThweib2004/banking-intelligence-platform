// Supabase Edge Function: credit-assessment
// ---------------------------------------------------------------------------
// AI-powered credit risk assessment. The AI is the SOURCE OF TRUTH for the
// score, category, recommended action and explanation. The client only builds
// the structured financial payload (deterministic feature engineering) and
// renders / persists what the AI returns.
//
// Request (POST JSON):
//   {
//     input: {
//       monthly_income, monthly_expenses, existing_loans,
//       requested_loan_amount, employment_type, loan_purpose
//     },
//     derived: { ...derived financial features... }
//   }
//
// Response: { result: AiCreditResult } | { error: string }
//
// Deterministic: temperature 0, JSON-only response_format.
//
// Deploy:   supabase functions deploy credit-assessment
// Secrets:  supabase secrets set OPENROUTER_API_KEY=sk-or-v1-...
//           (optional) supabase secrets set CREDIT_MODEL=openai/gpt-4o-mini
// ---------------------------------------------------------------------------

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
const CREDIT_MODEL = Deno.env.get("CREDIT_MODEL") ?? "openai/gpt-4o-mini";

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

const SYSTEM_PROMPT = `You are a senior bank credit risk officer for a retail bank.
You assess loan applications strictly from the structured financial fields provided.
You must respond with ONLY a single valid JSON object and nothing else: no markdown,
no code fences, no commentary before or after.

Scoring rules:
- "score" is an integer from 0 (lowest risk) to 100 (highest risk).
- "category": "low" if score < 40, "medium" if 40-69, "high" if score >= 70.
- Higher debt service ratio, higher loan-to-income ratio, negative disposable income,
  and unstable employment increase risk. Strong income and positive disposable income
  reduce risk.
- "recommended_action": "approve" for low risk, "manual_review" for medium/borderline,
  "reject" for high risk or negative disposable income.
- "confidence" is a number between 0 and 1 reflecting certainty given the inputs.
- "top_factors": 3 to 6 items, each { "label", "impact" (one of "high"|"medium"|"low"),
  "direction" (one of "increases risk"|"decreases risk"), "value" (short string) }.
- "summary": one or two professional sentences, no markdown.
- Echo back the provided derived_features unchanged.
- "result_source" must be the string "ai".
- "assessed_at" must be the provided assessment timestamp.

Return JSON shaped exactly:
{
  "score": number,
  "category": "low" | "medium" | "high",
  "confidence": number,
  "summary": string,
  "top_factors": [ { "label": string, "impact": string, "direction": string, "value": string } ],
  "derived_features": object,
  "recommended_action": "approve" | "manual_review" | "reject",
  "assessed_at": string,
  "result_source": "ai"
}`;

async function callModel(payload: unknown, assessedAt: string): Promise<string> {
  const apiKey = Deno.env.get("OPENROUTER_API_KEY");
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is not configured");

  const userMessage = JSON.stringify({
    instruction:
      "Assess this loan application and return the strict JSON result object.",
    assessment_timestamp: assessedAt,
    application: payload,
  });

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
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userMessage },
      ],
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`AI request failed (${res.status}): ${detail}`);
  }

  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new Error("AI returned an empty response");
  }
  return content;
}

function extractJson(text: string): unknown {
  // Defensive: strip accidental code fences and locate the JSON object.
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

    if (!input || typeof input !== "object") {
      return json(400, { error: "Missing 'input' financial payload" });
    }

    const assessedAt = new Date().toISOString();
    const content = await callModel({ input, derived }, assessedAt);
    const parsed = extractJson(content) as Record<string, unknown>;

    // Force server-controlled fields regardless of model drift.
    parsed.result_source = "ai";
    if (typeof parsed.assessed_at !== "string") {
      parsed.assessed_at = assessedAt;
    }

    return json(200, { result: parsed });
  } catch (err) {
    return json(500, { error: err instanceof Error ? err.message : String(err) });
  }
});
