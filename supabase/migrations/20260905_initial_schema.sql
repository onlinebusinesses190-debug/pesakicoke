-- Supabase migration: initial schema for Pesaki app
-- Run with the migration runner scripts/run-migrations.mjs

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- wallets table
CREATE TABLE IF NOT EXISTS public.wallets (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  balance numeric(18,2) DEFAULT 0 NOT NULL,
  demo_balance numeric(18,2) DEFAULT 0 NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_wallets_user_id ON public.wallets(user_id);

-- wallet_ledger table
CREATE TABLE IF NOT EXISTS public.wallet_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  type text NOT NULL,
  mode text NOT NULL,
  amount numeric(18,2) NOT NULL CHECK (amount >= 0),
  description text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_wallet_ledger_user_id ON public.wallet_ledger(user_id);
CREATE INDEX IF NOT EXISTS idx_wallet_ledger_created_at ON public.wallet_ledger(created_at DESC);

-- profiles (minimal example)
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text,
  email text,
  phone text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_profiles_phone ON public.profiles(phone);
CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);

-- mpesa_deposits
CREATE TABLE IF NOT EXISTS public.mpesa_deposits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  amount numeric(18,2) NOT NULL CHECK (amount >= 0),
  phone text,
  checkout_request_id text UNIQUE,
  mpesa_receipt text,
  status text DEFAULT 'pending',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mpesa_deposits_user ON public.mpesa_deposits(user_id);
CREATE INDEX IF NOT EXISTS idx_mpesa_deposits_checkout ON public.mpesa_deposits(checkout_request_id);

-- minimal prediction + spin tables used by the app
CREATE TABLE IF NOT EXISTS public.predictions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  market text,
  stake numeric(18,2) NOT NULL,
  side text,
  result jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.spin_prizes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL,
  weight int NOT NULL DEFAULT 1,
  amount numeric(18,2) NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.spin_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  prize_id uuid REFERENCES public.spin_prizes(id),
  amount numeric(18,2) NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- --------------------------------------------------------------------------------
-- RPC functions
-- credit_wallet, debit_wallet and transfer_wallet
-- --------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.credit_wallet(
  p_user_id uuid,
  p_amount numeric,
  p_mode text,
  p_description text
) RETURNS numeric
LANGUAGE plpgsql
AS $$
DECLARE
  new_balance numeric;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.wallets(user_id, balance, demo_balance, created_at, updated_at)
    VALUES (p_user_id, 0, 0, now(), now())
    ON CONFLICT (user_id) DO NOTHING;

  IF lower(p_mode) = 'real' THEN
    UPDATE public.wallets
    SET balance = COALESCE(balance,0) + p_amount,
        updated_at = now()
    WHERE user_id = p_user_id
    RETURNING balance INTO new_balance;
  ELSE
    UPDATE public.wallets
    SET demo_balance = COALESCE(demo_balance,0) + p_amount,
        updated_at = now()
    WHERE user_id = p_user_id
    RETURNING demo_balance INTO new_balance;
  END IF;

  INSERT INTO public.wallet_ledger (user_id, type, mode, amount, description, created_at)
  VALUES (p_user_id, 'credit', 'credit', p_amount, p_description, now());

  RETURN new_balance;
END;
$$ SECURITY DEFINER;

-- debit_wallet
CREATE OR REPLACE FUNCTION public.debit_wallet(
  p_user_id uuid,
  p_amount numeric,
  p_mode text,
  p_description text
) RETURNS numeric
LANGUAGE plpgsql
AS $$
DECLARE
  cur_balance numeric;
  new_balance numeric;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.wallets(user_id, balance, demo_balance, created_at, updated_at)
    VALUES (p_user_id, 0, 0, now(), now())
    ON CONFLICT (user_id) DO NOTHING;

  IF lower(p_mode) = 'real' THEN
    SELECT balance INTO cur_balance FROM public.wallets WHERE user_id = p_user_id FOR UPDATE;
  ELSE
    SELECT demo_balance INTO cur_balance FROM public.wallets WHERE user_id = p_user_id FOR UPDATE;
  END IF;

  IF cur_balance IS NULL THEN
    cur_balance := 0;
  END IF;

  IF cur_balance < p_amount THEN
    RETURN NULL;
  END IF;

  IF lower(p_mode) = 'real' THEN
    UPDATE public.wallets
    SET balance = balance - p_amount,
        updated_at = now()
    WHERE user_id = p_user_id
    RETURNING balance INTO new_balance;
  ELSE
    UPDATE public.wallets
    SET demo_balance = demo_balance - p_amount,
        updated_at = now()
    WHERE user_id = p_user_id
    RETURNING demo_balance INTO new_balance;
  END IF;

  INSERT INTO public.wallet_ledger (user_id, type, mode, amount, description, created_at)
  VALUES (p_user_id, 'debit', 'debit', p_amount, p_description, now());

  RETURN new_balance;
END;
$$ SECURITY DEFINER;

-- transfer_wallet
CREATE OR REPLACE FUNCTION public.transfer_wallet(
  p_from_user_id uuid,
  p_to_user_id uuid,
  p_amount numeric,
  p_mode text,
  p_description text
) RETURNS numeric
LANGUAGE plpgsql
AS $$
DECLARE
  sender_balance numeric;
  recipient_balance numeric;
  new_sender_balance numeric;
  new_recipient_balance numeric;
  first_id uuid;
  second_id uuid;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN NULL;
  END IF;

  IF p_from_user_id = p_to_user_id THEN
    RAISE EXCEPTION 'Cannot transfer to self';
  END IF;

  INSERT INTO public.wallets(user_id, balance, demo_balance, created_at, updated_at)
    VALUES (p_from_user_id, 0, 0, now(), now())
    ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.wallets(user_id, balance, demo_balance, created_at, updated_at)
    VALUES (p_to_user_id, 0, 0, now(), now())
    ON CONFLICT (user_id) DO NOTHING;

  IF p_from_user_id < p_to_user_id THEN
    first_id := p_from_user_id;
    second_id := p_to_user_id;
  ELSE
    first_id := p_to_user_id;
    second_id := p_from_user_id;
  END IF;

  PERFORM 1 FROM public.wallets WHERE user_id = first_id FOR UPDATE;
  PERFORM 1 FROM public.wallets WHERE user_id = second_id FOR UPDATE;

  IF lower(p_mode) = 'real' THEN
    SELECT balance INTO sender_balance FROM public.wallets WHERE user_id = p_from_user_id;
    SELECT balance INTO recipient_balance FROM public.wallets WHERE user_id = p_to_user_id;
  ELSE
    SELECT demo_balance INTO sender_balance FROM public.wallets WHERE user_id = p_from_user_id;
    SELECT demo_balance INTO recipient_balance FROM public.wallets WHERE user_id = p_to_user_id;
  END IF;

  sender_balance := COALESCE(sender_balance,0);
  recipient_balance := COALESCE(recipient_balance,0);

  IF sender_balance < p_amount THEN
    RETURN NULL;
  END IF;

  IF lower(p_mode) = 'real' THEN
    UPDATE public.wallets
    SET balance = balance - p_amount, updated_at = now()
    WHERE user_id = p_from_user_id
    RETURNING balance INTO new_sender_balance;

    UPDATE public.wallets
    SET balance = balance + p_amount, updated_at = now()
    WHERE user_id = p_to_user_id
    RETURNING balance INTO new_recipient_balance;
  ELSE
    UPDATE public.wallets
    SET demo_balance = demo_balance - p_amount, updated_at = now()
    WHERE user_id = p_from_user_id
    RETURNING demo_balance INTO new_sender_balance;

    UPDATE public.wallets
    SET demo_balance = demo_balance + p_amount, updated_at = now()
    WHERE user_id = p_to_user_id
    RETURNING demo_balance INTO new_recipient_balance;
  END IF;

  INSERT INTO public.wallet_ledger (user_id, type, mode, amount, description, created_at)
  VALUES
    (p_from_user_id, 'transfer', 'debit', p_amount, p_description, now());

  INSERT INTO public.wallet_ledger (user_id, type, mode, amount, description, created_at)
  VALUES
    (p_to_user_id, 'transfer', 'credit', p_amount, COALESCE(p_description, 'Transfer received'), now());

  RETURN new_sender_balance;
END;
$$ SECURITY DEFINER;

-- Touch trigger for updated_at
CREATE OR REPLACE FUNCTION public.touch_wallets_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_wallets_updated_at ON public.wallets;
CREATE TRIGGER trg_wallets_updated_at
  BEFORE UPDATE ON public.wallets
  FOR EACH ROW EXECUTE FUNCTION public.touch_wallets_updated_at();
