-- ============================================================================
-- pgvector-backed knowledge base for the AI Assistant (policy RAG v2).
--
-- Stores one row per policy section, with both English and Arabic title/content
-- and a single multilingual embedding used for semantic retrieval. Retrieval is
-- done via match_policy_chunks() (cosine similarity).
--
-- Embedding model: openai/text-embedding-3-small via OpenRouter -> 1536 dims.
-- If you switch to a model with different dimensions, update vector(1536) here
-- and re-run ingestion.
-- ============================================================================

-- 1. pgvector extension.
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Table.
CREATE TABLE IF NOT EXISTS public.policy_chunks (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_name         TEXT NOT NULL,
  section_title_en  TEXT NOT NULL,
  section_title_ar  TEXT NOT NULL,
  content_en        TEXT NOT NULL DEFAULT '',
  content_ar        TEXT NOT NULL DEFAULT '',
  embedding         vector(1536),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Natural key so ingestion can upsert cleanly.
CREATE UNIQUE INDEX IF NOT EXISTS policy_chunks_file_section_idx
  ON public.policy_chunks (file_name, section_title_en);

-- Approximate-nearest-neighbour index for cosine similarity.
CREATE INDEX IF NOT EXISTS policy_chunks_embedding_idx
  ON public.policy_chunks
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- 3. RLS: readable by authenticated users; writes happen via the service role
-- (ingestion) which bypasses RLS. Retrieval goes through match_policy_chunks
-- (SECURITY DEFINER) so it works regardless of these policies.
ALTER TABLE public.policy_chunks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS policy_chunks_select_authenticated ON public.policy_chunks;
CREATE POLICY policy_chunks_select_authenticated
  ON public.policy_chunks
  FOR SELECT
  TO authenticated
  USING (true);

-- 4. Semantic search function.
CREATE OR REPLACE FUNCTION public.match_policy_chunks(
  query_embedding vector(1536),
  match_threshold float DEFAULT 0.3,
  match_count int DEFAULT 4
)
RETURNS TABLE (
  id               UUID,
  file_name        TEXT,
  section_title_en TEXT,
  section_title_ar TEXT,
  content_en       TEXT,
  content_ar       TEXT,
  similarity       float
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    pc.id,
    pc.file_name,
    pc.section_title_en,
    pc.section_title_ar,
    pc.content_en,
    pc.content_ar,
    1 - (pc.embedding <=> query_embedding) AS similarity
  FROM public.policy_chunks pc
  WHERE pc.embedding IS NOT NULL
    AND 1 - (pc.embedding <=> query_embedding) > match_threshold
  ORDER BY pc.embedding <=> query_embedding
  LIMIT match_count;
$$;

GRANT EXECUTE ON FUNCTION public.match_policy_chunks(vector, float, int)
  TO authenticated, service_role;
