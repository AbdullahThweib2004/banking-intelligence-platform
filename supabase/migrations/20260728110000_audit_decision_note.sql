-- ============================================================================
-- Record Audit's decision note/comment so the submitting branch employee can
-- see WHY a request was finally approved or rejected, not just the status.
--
-- Idempotent + safe to re-run: column add is IF NOT EXISTS.
-- ============================================================================

DO $$
BEGIN
  IF to_regclass('public.approval_requests') IS NOT NULL THEN
    ALTER TABLE public.approval_requests ADD COLUMN IF NOT EXISTS audit_decision_note TEXT;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
