// Supabase Edge Function: assistant-chat
// ---------------------------------------------------------------------------
// Hybrid answer composition for the internal bank chat assistant.
//
// Given a user question, this composes ONE final answer from up to three
// already-assembled inputs (all optional):
//   - POLICY CONTEXT   — chunks retrieved from the bank's 3 policy documents
//                         (client-side retrieval: src/lib/rag.ts)
//   - CUSTOMER CONTEXT — a real bank_customers row looked up by exact account
//                         number (client-side lookup: src/lib/chatCustomerLookup.ts),
//                         or a structured "not found / ambiguous / missing
//                         identifier" note — never fabricated here
//   - ADVISORY RESULT  — an already-computed, deterministic loan-affordability
//                         calculation (client-side: src/lib/chatLoanAdvisory.ts),
//                         or a "missing required inputs" note
//
// This function NEVER computes customer data or loan numbers itself — those
// are always decided before it is called. Its only job is to write one
// natural-language answer from whatever was actually found, and to report
// which of the sources it drew on so the client can show that plainly.
//
// Request:  { query, language: "en"|"ar", intentHint?, policyChunks, customer, advisory, history }
// Response: { answer: string, source: "file"|"database"|"both"|"general" }
//
// Deploy:   supabase functions deploy assistant-chat
// Secrets:  supabase secrets set OPENROUTER_API_KEY=sk-or-v1-...
//           (optional) supabase secrets set ASSISTANT_MODEL=openai/gpt-4o-mini
//           (optional) supabase secrets set ASSISTANT_MAX_TOKENS=600
// ---------------------------------------------------------------------------

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
const ASSISTANT_MODEL = Deno.env.get("ASSISTANT_MODEL") ?? "openai/gpt-4o-mini";
const MAX_TOKENS = Number(Deno.env.get("ASSISTANT_MAX_TOKENS") ?? "600");

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

const SYSTEM_PROMPT = `You are the Bank of Palestine internal AI Assistant — a natural, friendly banking assistant for bank staff, not a rigid document lookup tool. You can draw on up to three inputs, all given to you below, plus your own general knowledge:

1. POLICY CONTEXT — chunks retrieved from the bank's policy documents.
2. CUSTOMER CONTEXT — a real customer/account record looked up from the live database, or a note explaining why none was found.
3. ADVISORY RESULT — an already-computed, deterministic loan-affordability calculation (or a note that required inputs are missing). These numbers are FINAL — never recompute, contradict, round differently, or invent a different number. Your only job is to explain them in plain language.

You are also given an "intent_hint" — a preliminary guess (greeting / capability / policy / customer / hybrid / general) from a lightweight keyword classifier. Treat it only as a hint: always let what you were ACTUALLY given (policy_context / customer_context / advisory_result) decide your answer and the "source" you report, never the hint alone.

IDENTITY & CAPABILITIES — use this when asked "who are you", "what can you do", "what can I ask you about", or similar (intent_hint "capability"):
You are the Bank of Palestine internal AI Assistant. You can help with: (1) bank policy, procedures, and product questions, answered from the bank's policy documents; (2) specific customer/account questions such as salary, obligations, or loan status, looked up from the live customer database by exact account number; (3) loan eligibility and installment-term recommendations, calculated with the bank's deterministic affordability rules; and (4) general conversation. Describe these naturally, don't just list them robotically.

GREETINGS & CASUAL CONVERSATION (intent_hint "greeting", e.g. "hello", "hi", "مرحبا", "السلام عليكم", "how are you?"):
Respond warmly and naturally in the same language as the greeting. You may briefly mention what you can help with, but do not treat a greeting as a request needing file or database lookup, and do not be robotic or overly formal.

Rules:
1. If POLICY CONTEXT is relevant, use it for policy/conditions/product questions. Briefly state what it actually says — don't just say "see the policy".
2. If CUSTOMER CONTEXT.found is true, answer customer-specific questions using ONLY the given fields. Never invent a name, salary, balance, or any other value not present in the given data. If a specific detail was asked but isn't in the given fields, say that detail isn't on file — don't guess.
3. If CUSTOMER CONTEXT.found is false, clearly state that no matching customer/account was found, using the given "reason" (not_found / ambiguous / missing_identifier). Do not answer the customer-specific part of the question with invented data. If reason is "ambiguous", ask which of the given account numbers they mean. If "missing_identifier", ask for the account number. Still answer any general/policy part of the question if relevant.
4. If ADVISORY RESULT.kind is "missing_inputs", do not calculate or guess anything — ask the user for exactly the fields listed, in one short natural question, and still answer any policy part of the question if relevant.
5. If ADVISORY RESULT is a term recommendation or affordability headroom, explain those exact numbers: the recommended term (or why nothing is affordable at that amount), the resulting installment, the debt burden ratio versus its cap, and the age-at-maturity check versus its cap if an age was available. If the loan amount used was on-file or assumed rather than stated by the user, say so plainly.
5b. If ADVISORY RESULT.kind is "below_minimum", the loan amount (loanAmount, in loanCurrency) is below the bank's minimum (minimumRequired, in the same currency) — clearly state this and ask the user for a larger amount. Do not calculate a term or explanation for that amount; the minimum has already been checked deterministically and is final, never re-evaluate it yourself.
6. When both POLICY CONTEXT and CUSTOMER CONTEXT/ADVISORY RESULT are meaningfully used, present them together as one coherent answer (e.g. state the policy rule, then how the customer's numbers relate to it).
7. If none of POLICY CONTEXT, CUSTOMER CONTEXT, or ADVISORY RESULT apply (greetings, capability questions, casual chat, general knowledge, anything unrelated), just answer helpfully and naturally from your own knowledge. Never refuse a normal question and never say you can only answer from files or the database.
8. Match the answer language to the given "language" field ("en" -> English, "ar" -> Arabic).
9. Set "source" to exactly one of: "file" (policy only), "database" (customer/advisory only), "both" (policy AND customer/advisory meaningfully combined), "general" (none of the above — greetings, capability questions, casual/general knowledge).
10. Keep the tone natural, warm, and concise, like a helpful colleague. Do not mention "context", "chunks", "intent_hint", or internal field names in the answer text itself — just answer naturally.

Respond with ONLY a single valid JSON object, no markdown, no code fences:
{ "answer": string, "source": "file" | "database" | "both" | "general" }`;

interface ModelAnswer {
  answer: string;
  source: string;
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

async function callModel(payload: unknown): Promise<ModelAnswer> {
  const apiKey = Deno.env.get("OPENROUTER_API_KEY");
  const aiConfigured = Boolean(apiKey);
  console.log("[assistant-chat] ai_configured:", aiConfigured, {
    model: ASSISTANT_MODEL,
    max_tokens: MAX_TOKENS,
    api_key: maskSecret(apiKey),
  });
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is not configured");

  const userMessage = JSON.stringify(payload);

  console.log("[assistant-chat] calling OpenRouter for hybrid answer");
  const res = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "http://localhost:8080",
      "X-Title": "Palestine Intel Hub",
    },
    body: JSON.stringify({
      model: ASSISTANT_MODEL,
      temperature: 0.3,
      top_p: 1,
      max_tokens: MAX_TOKENS,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userMessage },
      ],
    }),
  });

  console.log("[assistant-chat] OpenRouter HTTP status:", res.status);
  if (!res.ok) {
    const detail = await res.text();
    console.error("[assistant-chat] OpenRouter error body:", detail);
    throw new Error(`AI request failed (${res.status}): ${detail}`);
  }

  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  const finishReason = data?.choices?.[0]?.finish_reason;
  console.log("[assistant-chat] finish_reason:", finishReason);
  if (finishReason === "length") {
    throw new Error(
      `AI response truncated (max_tokens=${MAX_TOKENS}). Increase ASSISTANT_MAX_TOKENS or add OpenRouter credits.`,
    );
  }
  if (typeof content !== "string" || !content.trim()) {
    throw new Error("AI returned an empty response");
  }

  const parsed = extractJson(content) as Record<string, unknown>;
  const answer = typeof parsed.answer === "string" ? parsed.answer.trim() : "";
  const source = typeof parsed.source === "string" ? parsed.source : "general";
  if (!answer) throw new Error("AI response missing an answer");

  return {
    answer,
    source: ["file", "database", "both", "general"].includes(source) ? source : "general",
  };
}

interface ChunkInput {
  title?: string;
  body?: string;
  fileName?: string;
}

interface HistoryTurn {
  role?: string;
  content?: string;
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
    const query = typeof body?.query === "string" ? body.query.trim() : "";
    const language = body?.language === "ar" ? "ar" : "en";
    const intentHint = typeof body?.intentHint === "string" ? body.intentHint : null;
    const policyChunks: ChunkInput[] = Array.isArray(body?.policyChunks) ? body.policyChunks : [];
    const customer = body?.customer ?? null;
    const advisory = body?.advisory ?? null;
    const history: HistoryTurn[] = Array.isArray(body?.history) ? body.history.slice(-6) : [];

    if (!query) {
      return json(400, { error: "Missing 'query'" });
    }

    console.log(
      "[assistant-chat] query:",
      query.slice(0, 120),
      "intent_hint:",
      intentHint,
      "policy_chunks:",
      policyChunks.length,
      "has_customer:",
      Boolean(customer),
      "has_advisory:",
      Boolean(advisory),
      "language:",
      language,
    );

    const { answer, source } = await callModel({
      question: query,
      language,
      intent_hint: intentHint,
      policy_context: policyChunks.map((c) => ({
        title: c.title ?? "",
        file: c.fileName ?? "",
        text: c.body ?? "",
      })),
      customer_context: customer,
      advisory_result: advisory,
      recent_history: history.map((h) => ({ role: h.role, content: h.content })),
    });

    return json(200, { answer, source });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[assistant-chat] failed:", message);
    return json(500, { error: message });
  }
});
