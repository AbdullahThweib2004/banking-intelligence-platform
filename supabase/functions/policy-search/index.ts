// Supabase Edge Function: policy-search
// ---------------------------------------------------------------------------
// Query-time semantic retrieval for the AI Assistant policy RAG.
//   1. Receives a user question.
//   2. Embeds it with a multilingual embedding model (OpenAI text-embedding-3
//      models are multilingual, so Arabic and English queries both work).
//   3. Runs match_policy_chunks() (pgvector cosine similarity) via the service
//      role and returns the matched chunks (both languages + similarity).
//
// The function does NOT compose answers or call a chat model — answer text is
// built on the client strictly from the returned chunk content, preserving the
// "answer only from policy documents" rule.
//
// Request (POST JSON):  { query: string, matchCount?: number, matchThreshold?: number }
// Response:             { chunks: PolicyMatch[] }
//
// Deploy:   supabase functions deploy policy-search
// Secrets:  supabase secrets set OPENAI_API_KEY=sk-...
//           (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected by Supabase)
// ---------------------------------------------------------------------------

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const EMBEDDING_MODEL = Deno.env.get("EMBEDDING_MODEL") ?? "text-embedding-3-small";

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

async function embed(text: string): Promise<number[]> {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured");

  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: text }),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Embedding request failed (${res.status}): ${detail}`);
  }

  const data = await res.json();
  return data.data[0].embedding as number[];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  try {
    const { query, matchCount = 4, matchThreshold = 0.3 } = await req.json();

    if (!query || typeof query !== "string" || !query.trim()) {
      return json(400, { error: "Missing 'query'" });
    }

    const queryEmbedding = await embed(query.trim());

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data, error } = await admin.rpc("match_policy_chunks", {
      query_embedding: queryEmbedding,
      match_threshold: matchThreshold,
      match_count: matchCount,
    });

    if (error) return json(500, { error: error.message });

    return json(200, { chunks: data ?? [] });
  } catch (err) {
    return json(500, { error: err instanceof Error ? err.message : String(err) });
  }
});
