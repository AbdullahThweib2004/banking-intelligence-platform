-- ============================================================================
-- Fix: approval_requests_status_check (defined outside this repo's tracked
-- migration history, same as approval_requests itself) does not allow the
-- new 'pending_branch_manager_approval' status introduced by
-- 20260727130000_branch_manager_gate_for_credit_assessments.sql, so every
-- "Submit to Branch Manager" insert fails with:
--   new row for relation "approval_requests" violates check constraint
--   "approval_requests_status_check"
--
-- This reconciles the constraint to include every status value actually used
-- across the app (src/pages/CreditRisk.tsx, src/pages/Approvals.tsx):
--   pending, approved, rejected, awaiting_approval (legacy),
--   pending_branch_manager_approval (new).
--
-- Idempotent + safe to re-run: constraint is dropped before being recreated.
-- No existing row's data is touched.
-- ============================================================================

DO $$
BEGIN
  IF to_regclass('public.approval_requests') IS NOT NULL THEN
    ALTER TABLE public.approval_requests DROP CONSTRAINT IF EXISTS approval_requests_status_check;
    ALTER TABLE public.approval_requests
      ADD CONSTRAINT approval_requests_status_check
      CHECK (status IN (
        'pending',
        'approved',
        'rejected',
        'awaiting_approval',
        'pending_branch_manager_approval'
      ));
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- Verify (optional, run in the SQL Editor):
--   SELECT pg_get_constraintdef(oid) FROM pg_constraint
--   WHERE conname = 'approval_requests_status_check';
-- ============================================================================
