-- Trim AI chat history to the latest 10 conversations per user (optional cleanup).
-- Safe to run after 20260622100000_ai_chat_history.sql.

CREATE OR REPLACE FUNCTION public.trim_ai_chat_history(p_user_id UUID, p_keep INT DEFAULT 10)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count INT;
BEGIN
  IF p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  WITH ranked AS (
    SELECT id,
           ROW_NUMBER() OVER (ORDER BY updated_at DESC) AS rn
    FROM public.ai_chat_conversations
    WHERE user_id = p_user_id
  ),
  removed AS (
    DELETE FROM public.ai_chat_conversations c
    USING ranked r
    WHERE c.id = r.id
      AND r.rn > p_keep
    RETURNING c.id
  )
  SELECT COUNT(*)::INT INTO deleted_count FROM removed;

  RETURN deleted_count;
END;
$$;

REVOKE ALL ON FUNCTION public.trim_ai_chat_history(UUID, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.trim_ai_chat_history(UUID, INT) TO authenticated;
