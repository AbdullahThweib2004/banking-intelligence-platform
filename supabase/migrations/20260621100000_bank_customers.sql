-- ============================================================================
-- Bank customer master data for New Assessment account-number lookup.
--
-- Employees look up a customer by account_number, auto-fill the assessment
-- form, then submit an approval_requests row (assessment snapshot).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.bank_customers (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_number   TEXT NOT NULL UNIQUE,
  customer_name    TEXT NOT NULL,
  national_id      TEXT NOT NULL,
  monthly_income   NUMERIC(12, 2) NOT NULL DEFAULT 0,
  monthly_expenses NUMERIC(12, 2) NOT NULL DEFAULT 0,
  existing_loans   NUMERIC(12, 2) NOT NULL DEFAULT 0,
  employment_type  TEXT NOT NULL,
  loan_amount      NUMERIC(12, 2) NOT NULL DEFAULT 0,
  loan_purpose     TEXT NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bank_customers_account_number_idx
  ON public.bank_customers (account_number);

ALTER TABLE public.bank_customers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bank_customers_select_authenticated ON public.bank_customers;
CREATE POLICY bank_customers_select_authenticated
  ON public.bank_customers
  FOR SELECT
  TO authenticated
  USING (true);

-- Snapshot columns on approval_requests (assessment submissions).
DO $$
BEGIN
  IF to_regclass('public.approval_requests') IS NOT NULL THEN
    ALTER TABLE public.approval_requests ADD COLUMN IF NOT EXISTS account_number TEXT;
    ALTER TABLE public.approval_requests ADD COLUMN IF NOT EXISTS national_id TEXT;
    ALTER TABLE public.approval_requests ADD COLUMN IF NOT EXISTS monthly_income NUMERIC(12, 2);
    ALTER TABLE public.approval_requests ADD COLUMN IF NOT EXISTS monthly_expenses NUMERIC(12, 2);
    ALTER TABLE public.approval_requests ADD COLUMN IF NOT EXISTS existing_loans NUMERIC(12, 2);
    ALTER TABLE public.approval_requests ADD COLUMN IF NOT EXISTS employment_type TEXT;
    ALTER TABLE public.approval_requests ADD COLUMN IF NOT EXISTS loan_purpose TEXT;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Seed 10 fake customers for credit-risk testing (idempotent upsert).
-- Account numbers: BOP-100001 … BOP-100010
-- ---------------------------------------------------------------------------
INSERT INTO public.bank_customers (
  account_number, customer_name, national_id,
  monthly_income, monthly_expenses, existing_loans,
  employment_type, loan_amount, loan_purpose
) VALUES
  ('BOP-100001', 'Ahmad Khalil Nasser',    '402156789012', 4500.00, 1800.00,  500.00,  'employed',      15000.00, 'personal'),
  ('BOP-100002', 'Sara Mahmoud Darwish',   '403987654321', 6200.00, 2200.00,    0.00,  'employed',      25000.00, 'car'),
  ('BOP-100003', 'Omar Youssef Hamdan',    '401234567890', 3200.00, 2100.00, 1200.00,  'self-employed', 10000.00, 'business'),
  ('BOP-100004', 'Layla Hassan Abu Ali',   '404567890123', 7800.00, 2500.00,  800.00,  'employed',      40000.00, 'home'),
  ('BOP-100005', 'Khaled Ibrahim Saleh',   '405678901234', 2800.00, 2400.00, 2000.00,  'employed',       8000.00, 'personal'),
  ('BOP-100006', 'Nour Sami Qasem',        '406789012345', 5500.00, 1900.00,  300.00,  'business',      35000.00, 'business'),
  ('BOP-100007', 'Rami Fadi Mansour',      '407890123456', 9100.00, 2800.00, 1500.00,  'employed',      50000.00, 'home'),
  ('BOP-100008', 'Dina Walid Shammah',     '408901234567', 4100.00, 2000.00,  900.00,  'self-employed', 12000.00, 'car'),
  ('BOP-100009', 'Yousef Tariq Barakat',   '409012345678', 3600.00, 1700.00,    0.00,  'employed',      18000.00, 'personal'),
  ('BOP-100010', 'Maha Nabil Zayed',       '400123456789', 6800.00, 2300.00, 2500.00,  'employed',      30000.00, 'car')
ON CONFLICT (account_number) DO UPDATE SET
  customer_name    = EXCLUDED.customer_name,
  national_id      = EXCLUDED.national_id,
  monthly_income   = EXCLUDED.monthly_income,
  monthly_expenses = EXCLUDED.monthly_expenses,
  existing_loans   = EXCLUDED.existing_loans,
  employment_type  = EXCLUDED.employment_type,
  loan_amount      = EXCLUDED.loan_amount,
  loan_purpose     = EXCLUDED.loan_purpose;
