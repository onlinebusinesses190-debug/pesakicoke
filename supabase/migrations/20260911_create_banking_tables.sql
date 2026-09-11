-- Banking Hub tables

CREATE TABLE IF NOT EXISTS public.banking_wallets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid UNIQUE NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  balance numeric(18,2) DEFAULT 0 NOT NULL CHECK (balance >= 0),
  locked numeric(18,2) DEFAULT 0 NOT NULL CHECK (locked >= 0),
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.banking_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount numeric(18,2) NOT NULL CHECK (amount >= 0),
  type text NOT NULL,
  mode text NOT NULL CHECK (mode IN ('credit', 'debit')),
  description text,
  status text DEFAULT 'completed',
  reference text,
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.locked_savings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount numeric(18,2) NOT NULL CHECK (amount > 0),
  duration_months integer NOT NULL CHECK (duration_months > 0),
  apy numeric(5,2) NOT NULL DEFAULT 10,
  start_date timestamptz DEFAULT now() NOT NULL,
  end_date timestamptz NOT NULL,
  status text DEFAULT 'active' CHECK (status IN ('active', 'matured', 'cancelled')),
  interest_earned numeric(18,2) DEFAULT 0,
  total_at_maturity numeric(18,2) DEFAULT 0,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.investments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount numeric(18,2) NOT NULL CHECK (amount > 0),
  duration_months integer NOT NULL CHECK (duration_months > 0),
  apy numeric(5,2) NOT NULL DEFAULT 12,
  start_date timestamptz DEFAULT now() NOT NULL,
  end_date timestamptz NOT NULL,
  status text DEFAULT 'active' CHECK (status IN ('active', 'matured', 'cancelled')),
  interest_earned numeric(18,2) DEFAULT 0,
  total_at_maturity numeric(18,2) DEFAULT 0,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.savings_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  target_amount numeric(18,2) NOT NULL CHECK (target_amount > 0),
  saved_amount numeric(18,2) DEFAULT 0 NOT NULL CHECK (saved_amount >= 0),
  apy numeric(5,2) DEFAULT 8,
  status text DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled')),
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.banking_deposits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount numeric(18,2) NOT NULL CHECK (amount > 0),
  phone text,
  checkout_request_id text UNIQUE NOT NULL,
  status text DEFAULT 'pending',
  mpesa_receipt text,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.loan_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount numeric(18,2) NOT NULL CHECK (amount > 0),
  duration_months integer NOT NULL CHECK (duration_months > 0),
  interest_rate numeric(5,2) NOT NULL DEFAULT 20,
  purpose text,
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'denied', 'disbursed', 'repaid')),
  reviewer_notes text,
  applied_at timestamptz DEFAULT now() NOT NULL,
  reviewed_at timestamptz,
  updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_banking_wallets_user ON public.banking_wallets(user_id);
CREATE INDEX IF NOT EXISTS idx_banking_ledger_user ON public.banking_ledger(user_id);
CREATE INDEX IF NOT EXISTS idx_locked_savings_user ON public.locked_savings(user_id);
CREATE INDEX IF NOT EXISTS idx_investments_user ON public.investments(user_id);
CREATE INDEX IF NOT EXISTS idx_savings_goals_user ON public.savings_goals(user_id);
CREATE INDEX IF NOT EXISTS idx_banking_deposits_user ON public.banking_deposits(user_id);
CREATE INDEX IF NOT EXISTS idx_banking_deposits_checkout ON public.banking_deposits(checkout_request_id);
CREATE INDEX IF NOT EXISTS idx_loan_applications_user ON public.loan_applications(user_id);
