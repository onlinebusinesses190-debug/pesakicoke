-- Add fee columns to mpesa_deposits
ALTER TABLE public.mpesa_deposits
  ADD COLUMN IF NOT EXISTS fee numeric(18,2) DEFAULT 0 NOT NULL,
  ADD COLUMN IF NOT EXISTS credited_amount numeric(18,2) DEFAULT 0 NOT NULL;

-- Add fee columns to b2c_withdrawals
ALTER TABLE public.b2c_withdrawals
  ADD COLUMN IF NOT EXISTS fee numeric(18,2) DEFAULT 0 NOT NULL,
  ADD COLUMN IF NOT EXISTS payout_amount numeric(18,2) DEFAULT 0 NOT NULL;
