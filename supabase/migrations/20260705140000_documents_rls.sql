-- ============================================================================
-- Documents table RLS — ensures DELETE (and other CRUD) persist in Supabase.
--
-- Without a DELETE policy, Supabase returns success but deletes 0 rows, so the
-- UI removes the row locally but it reappears after refresh.
--
-- Idempotent: policies are dropped before recreate. Table is created only if
-- missing (safe when the table already exists in your project).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  type text NOT NULL DEFAULT 'other',
  file_path text,
  size text,
  status text NOT NULL DEFAULT 'pending',
  upload_date date,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  confidence numeric,
  extracted_fields integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS documents_user_id_idx ON public.documents (user_id);
CREATE INDEX IF NOT EXISTS documents_created_at_idx ON public.documents (created_at DESC);

ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

-- Branch roles can read all documents on the Documents page.
DROP POLICY IF EXISTS "documents_select_roles" ON public.documents;
CREATE POLICY "documents_select_roles"
  ON public.documents
  FOR SELECT
  TO authenticated
  USING (
    (auth.jwt() -> 'user_metadata' ->> 'role')
      IN ('branch_employee', 'branch_manager', 'risk_department')
  );

DROP POLICY IF EXISTS "documents_insert_roles" ON public.documents;
CREATE POLICY "documents_insert_roles"
  ON public.documents
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (auth.jwt() -> 'user_metadata' ->> 'role')
      IN ('branch_employee', 'branch_manager', 'risk_department')
    AND user_id = auth.uid()
  );

DROP POLICY IF EXISTS "documents_update_own" ON public.documents;
CREATE POLICY "documents_update_own"
  ON public.documents
  FOR UPDATE
  TO authenticated
  USING (
    (auth.jwt() -> 'user_metadata' ->> 'role')
      IN ('branch_employee', 'branch_manager', 'risk_department')
    AND user_id = auth.uid()
  )
  WITH CHECK (user_id = auth.uid());

-- Employees delete their own rows; managers and risk can delete any row.
DROP POLICY IF EXISTS "documents_delete_roles" ON public.documents;
CREATE POLICY "documents_delete_roles"
  ON public.documents
  FOR DELETE
  TO authenticated
  USING (
    (auth.jwt() -> 'user_metadata' ->> 'role')
      IN ('branch_employee', 'branch_manager', 'risk_department')
    AND (
      user_id = auth.uid()
      OR (auth.jwt() -> 'user_metadata' ->> 'role')
         IN ('branch_manager', 'risk_department')
    )
  );

-- Realtime DELETE payloads include the row id (for multi-tab sync).
ALTER TABLE public.documents REPLICA IDENTITY FULL;

-- Enable Realtime replication (no-op if already added).
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.documents;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
