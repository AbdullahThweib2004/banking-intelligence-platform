-- ============================================================================
-- Loan restriction flags on bank_customers + mark BOP-100004 / BOP-100005.
-- ============================================================================

ALTER TABLE public.bank_customers
  ADD COLUMN IF NOT EXISTS loan_restricted BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.bank_customers
  ADD COLUMN IF NOT EXISTS restriction_reason TEXT;

UPDATE public.bank_customers
SET
  loan_restricted = false,
  restriction_reason = NULL
WHERE account_number NOT IN ('BOP-100004', 'BOP-100005');

UPDATE public.bank_customers
SET
  loan_restricted = true,
  restriction_reason = 'Restricted from loan applications — contact branch manager for details.'
WHERE account_number IN ('BOP-100004', 'BOP-100005');

-- Reconcile seed rows (idempotent).
INSERT INTO public.bank_customers (
  account_number, customer_name, national_id,
  monthly_income, monthly_expenses, existing_loans,
  employment_type, loan_amount, loan_purpose,
  loan_restricted, restriction_reason
) VALUES
  ('BOP-100001', 'Ahmad Khalil Nasser',    '402156789012', 4500.00, 1800.00,  500.00,  'employed',      15000.00, 'personal', false, NULL),
  ('BOP-100002', 'Sara Mahmoud Darwish',   '403987654321', 6200.00, 2200.00,    0.00,  'employed',      25000.00, 'car',      false, NULL),
  ('BOP-100003', 'Omar Youssef Hamdan',    '401234567890', 3200.00, 2100.00, 1200.00,  'self-employed', 10000.00, 'business', false, NULL),
  ('BOP-100004', 'Layla Hassan Abu Ali',   '404567890123', 7800.00, 2500.00,  800.00,  'employed',      40000.00, 'home',     true,  'Restricted from loan applications — contact branch manager for details.'),
  ('BOP-100005', 'Khaled Ibrahim Saleh',   '405678901234', 2800.00, 2400.00, 2000.00,  'employed',       8000.00, 'personal', true,  'Restricted from loan applications — contact branch manager for details.'),
  ('BOP-100006', 'Nour Sami Qasem',        '406789012345', 5500.00, 1900.00,  300.00,  'business',      35000.00, 'business', false, NULL),
  ('BOP-100007', 'Rami Fadi Mansour',      '407890123456', 9100.00, 2800.00, 1500.00,  'employed',      50000.00, 'home',     false, NULL),
  ('BOP-100008', 'Dina Walid Shammah',     '408901234567', 4100.00, 2000.00,  900.00,  'self-employed', 12000.00, 'car',      false, NULL),
  ('BOP-100009', 'Yousef Tariq Barakat',   '409012345678', 3600.00, 1700.00,    0.00,  'employed',      18000.00, 'personal', false, NULL),
  ('BOP-100010', 'Maha Nabil Zayed',       '400123456789', 6800.00, 2300.00, 2500.00,  'employed',      30000.00, 'car',      false, NULL)
ON CONFLICT (account_number) DO UPDATE SET
  customer_name      = EXCLUDED.customer_name,
  national_id        = EXCLUDED.national_id,
  monthly_income     = EXCLUDED.monthly_income,
  monthly_expenses   = EXCLUDED.monthly_expenses,
  existing_loans     = EXCLUDED.existing_loans,
  employment_type    = EXCLUDED.employment_type,
  loan_amount        = EXCLUDED.loan_amount,
  loan_purpose       = EXCLUDED.loan_purpose,
  loan_restricted    = EXCLUDED.loan_restricted,
  restriction_reason = EXCLUDED.restriction_reason;
