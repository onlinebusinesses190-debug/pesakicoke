-- Add locked balance support for pending B2C withdrawals
ALTER TABLE public.wallets
  ADD COLUMN IF NOT EXISTS locked numeric(18,2) DEFAULT 0 NOT NULL;

-- Palpluss B2C withdrawals tracking table
CREATE TABLE IF NOT EXISTS public.b2c_withdrawals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  amount numeric(18,2) NOT NULL CHECK (amount >= 0),
  phone text NOT NULL,
  reference text UNIQUE NOT NULL,
  status text DEFAULT 'pending',
  provider_transaction_id text,
  provider_checkout_id text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_b2c_withdrawals_user ON public.b2c_withdrawals(user_id);
CREATE INDEX IF NOT EXISTS idx_b2c_withdrawals_reference ON public.b2c_withdrawals(reference);
CREATE INDEX IF NOT EXISTS idx_b2c_withdrawals_status ON public.b2c_withdrawals(status);

-- RPC to reserve locked funds (move from balance to locked)
CREATE OR REPLACE FUNCTION public.reserve_locked_funds(
  p_user_id uuid,
  p_amount numeric
) RETURNS boolean
LANGUAGE plpgsql
AS $$
DECLARE
  cur_balance numeric;
  cur_locked numeric;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN FALSE;
  END IF;

  SELECT balance, locked INTO cur_balance, cur_locked
  FROM public.wallets
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF cur_balance IS NULL THEN
    cur_balance := 0;
  END IF;

  IF cur_locked IS NULL THEN
    cur_locked := 0;
  END IF;

  IF cur_balance < p_amount THEN
    RETURN FALSE;
  END IF;

  UPDATE public.wallets
  SET balance = balance - p_amount,
      locked = locked + p_amount,
      updated_at = now()
  WHERE user_id = p_user_id;

  RETURN TRUE;
END;
$$ SECURITY DEFINER;

-- RPC to release locked funds (move from locked back to balance)
CREATE OR REPLACE FUNCTION public.release_locked_funds(
  p_user_id uuid,
  p_amount numeric
) RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  cur_balance numeric;
  cur_locked numeric;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN;
  END IF;

  SELECT balance, locked INTO cur_balance, cur_locked
  FROM public.wallets
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF cur_balance IS NULL THEN
    cur_balance := 0;
  END IF;

  IF cur_locked IS NULL THEN
    cur_locked := 0;
  END IF;

  UPDATE public.wallets
  SET balance = cur_balance + p_amount,
      locked = GREATEST(0, cur_locked - p_amount),
      updated_at = now()
  WHERE user_id = p_user_id;
END;
$$ SECURITY DEFINER;
