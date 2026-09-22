-- Migration: Add is_demo and reference_id columns to wallet_ledger
-- Also update RPC functions to track real vs demo transactions

-- ─── Add columns to wallet_ledger ──────────────────────────────────────
ALTER TABLE public.wallet_ledger 
  ADD COLUMN IF NOT EXISTS is_demo boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS reference_id text;

-- ─── Update credit_wallet to set is_demo ─────────────────────────────────
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
  v_is_demo boolean := false;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN NULL;
  END IF;

  IF lower(p_mode) = 'real' THEN
    v_is_demo := false;
  ELSE
    v_is_demo := true;
  END IF;

  INSERT INTO public.wallets(user_id, balance, demo_balance, created_at, updated_at)
    VALUES (p_user_id, 0, 10000, now(), now())
    ON CONFLICT (user_id) DO NOTHING;

  IF v_is_demo THEN
    UPDATE public.wallets
    SET demo_balance = COALESCE(demo_balance,0) + p_amount,
        updated_at = now()
    WHERE user_id = p_user_id
    RETURNING demo_balance INTO new_balance;
  ELSE
    UPDATE public.wallets
    SET balance = COALESCE(balance,0) + p_amount,
        updated_at = now()
    WHERE user_id = p_user_id
    RETURNING balance INTO new_balance;
  END IF;

  INSERT INTO public.wallet_ledger (user_id, type, mode, amount, description, created_at, is_demo)
  VALUES (p_user_id, 'deposit', 'credit', p_amount, p_description, now(), v_is_demo);

  RETURN new_balance;
END;
$$ SECURITY DEFINER;

-- ─── Update debit_wallet to set is_demo ─────────────────────────────────
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
  v_is_demo boolean := false;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN NULL;
  END IF;

  IF lower(p_mode) = 'real' THEN
    v_is_demo := false;
  ELSE
    v_is_demo := true;
  END IF;

  INSERT INTO public.wallets(user_id, balance, demo_balance, created_at, updated_at)
    VALUES (p_user_id, 0, 0, now(), now())
    ON CONFLICT (user_id) DO NOTHING;

  IF v_is_demo THEN
    SELECT demo_balance INTO cur_balance FROM public.wallets WHERE user_id = p_user_id FOR UPDATE;
  ELSE
    SELECT balance INTO cur_balance FROM public.wallets WHERE user_id = p_user_id FOR UPDATE;
  END IF;

  IF cur_balance IS NULL THEN
    cur_balance := 0;
  END IF;

  IF cur_balance < p_amount THEN
    RETURN NULL;
  END IF;

  IF v_is_demo THEN
    UPDATE public.wallets
    SET demo_balance = demo_balance - p_amount,
        updated_at = now()
    WHERE user_id = p_user_id
    RETURNING demo_balance INTO new_balance;
  ELSE
    UPDATE public.wallets
    SET balance = balance - p_amount,
        updated_at = now()
    WHERE user_id = p_user_id
    RETURNING balance INTO new_balance;
  END IF;

  INSERT INTO public.wallet_ledger (user_id, type, mode, amount, description, created_at, is_demo)
  VALUES (p_user_id, 'withdrawal', 'debit', p_amount, p_description, now(), v_is_demo);

  RETURN new_balance;
END;
$$ SECURITY DEFINER;

-- ─── Update transfer_wallet to set is_demo ───────────────────────────────
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
  v_is_demo boolean := false;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN NULL;
  END IF;

  IF p_from_user_id = p_to_user_id THEN
    RAISE EXCEPTION 'Cannot transfer to self';
  END IF;

  IF lower(p_mode) = 'real' THEN
    v_is_demo := false;
  ELSE
    v_is_demo := true;
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

  IF v_is_demo THEN
    SELECT demo_balance INTO sender_balance FROM public.wallets WHERE user_id = p_from_user_id;
    SELECT demo_balance INTO recipient_balance FROM public.wallets WHERE user_id = p_to_user_id;
  ELSE
    SELECT balance INTO sender_balance FROM public.wallets WHERE user_id = p_from_user_id;
    SELECT balance INTO recipient_balance FROM public.wallets WHERE user_id = p_to_user_id;
  END IF;

  sender_balance := COALESCE(sender_balance,0);
  recipient_balance := COALESCE(recipient_balance,0);

  IF sender_balance < p_amount THEN
    RETURN NULL;
  END IF;

  IF v_is_demo THEN
    UPDATE public.wallets
    SET demo_balance = demo_balance - p_amount, updated_at = now()
    WHERE user_id = p_from_user_id
    RETURNING demo_balance INTO new_sender_balance;

    UPDATE public.wallets
    SET demo_balance = demo_balance + p_amount, updated_at = now()
    WHERE user_id = p_to_user_id
    RETURNING demo_balance INTO new_recipient_balance;
  ELSE
    UPDATE public.wallets
    SET balance = balance - p_amount, updated_at = now()
    WHERE user_id = p_from_user_id
    RETURNING balance INTO new_sender_balance;

    UPDATE public.wallets
    SET balance = balance + p_amount, updated_at = now()
    WHERE user_id = p_to_user_id
    RETURNING balance INTO new_recipient_balance;
  END IF;

  INSERT INTO public.wallet_ledger (user_id, type, mode, amount, description, created_at, is_demo)
  VALUES
    (p_from_user_id, 'transfer', 'debit', p_amount, p_description, now(), v_is_demo);

  INSERT INTO public.wallet_ledger (user_id, type, mode, amount, description, created_at, is_demo)
  VALUES
    (p_to_user_id, 'transfer', 'credit', p_amount, COALESCE(p_description, 'Transfer received'), now(), v_is_demo);

  RETURN new_sender_balance;
END;
$$ SECURITY DEFINER;
