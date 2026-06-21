-- ============================================================================
-- AI Assistant chat history — idempotent setup + grants + schema reload.
-- Safe to re-run. Apply via Supabase SQL Editor or: supabase db push
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.ai_chat_conversations (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title      TEXT NOT NULL DEFAULT 'New conversation',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_chat_conversations_user_updated_idx
  ON public.ai_chat_conversations (user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS public.ai_chat_messages (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id  UUID NOT NULL REFERENCES public.ai_chat_conversations(id) ON DELETE CASCADE,
  role             TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content          TEXT NOT NULL,
  sources          JSONB,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_chat_messages_conversation_idx
  ON public.ai_chat_messages (conversation_id, created_at ASC);

ALTER TABLE public.ai_chat_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_chat_messages ENABLE ROW LEVEL SECURITY;

-- Conversations: owner only.
DROP POLICY IF EXISTS ai_chat_conversations_select_own ON public.ai_chat_conversations;
CREATE POLICY ai_chat_conversations_select_own
  ON public.ai_chat_conversations FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS ai_chat_conversations_insert_own ON public.ai_chat_conversations;
CREATE POLICY ai_chat_conversations_insert_own
  ON public.ai_chat_conversations FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS ai_chat_conversations_update_own ON public.ai_chat_conversations;
CREATE POLICY ai_chat_conversations_update_own
  ON public.ai_chat_conversations FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS ai_chat_conversations_delete_own ON public.ai_chat_conversations;
CREATE POLICY ai_chat_conversations_delete_own
  ON public.ai_chat_conversations FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- Messages: only within the user's conversations.
DROP POLICY IF EXISTS ai_chat_messages_select_own ON public.ai_chat_messages;
CREATE POLICY ai_chat_messages_select_own
  ON public.ai_chat_messages FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.ai_chat_conversations c
      WHERE c.id = conversation_id AND c.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS ai_chat_messages_insert_own ON public.ai_chat_messages;
CREATE POLICY ai_chat_messages_insert_own
  ON public.ai_chat_messages FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.ai_chat_conversations c
      WHERE c.id = conversation_id AND c.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS ai_chat_messages_update_own ON public.ai_chat_messages;
CREATE POLICY ai_chat_messages_update_own
  ON public.ai_chat_messages FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.ai_chat_conversations c
      WHERE c.id = conversation_id AND c.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.ai_chat_conversations c
      WHERE c.id = conversation_id AND c.user_id = auth.uid()
    )
  );

-- PostgREST API access (required for browser client inserts/selects).
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.ai_chat_conversations TO authenticated, service_role;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.ai_chat_messages TO authenticated, service_role;

GRANT SELECT
  ON public.ai_chat_conversations TO anon;

GRANT SELECT
  ON public.ai_chat_messages TO anon;

-- Tell PostgREST to pick up the new tables immediately.
NOTIFY pgrst, 'reload schema';
