-- Migration: Update referral reward model
-- - Remove KES 100 minimum deposit threshold (fires on ANY deposit size)
-- - Pay 10% of every deposit to the referrer (instead of fixed KES 20)
-- - Pay KES 10 welcome bonus to referred user on first deposit (unchanged)
-- This SQL only modifies the process_referral_deposit RPC and does NOT
-- touch wallets, mpesa_deposits, withdrawal, or transfer logic.

-- Ensure first_deposit_id column exists on referrals table (text type for checkout_request_id)
ALTER TABLE IF EXISTS public.referrals
  ADD COLUMN IF NOT EXISTS first_deposit_id text;

-- ─── Recreate process_referral_deposit with new reward model ───────────
CREATE OR REPLACE FUNCTION public.process_referral_deposit(
  p_referred_user_id uuid,
  p_deposit_amount numeric,
  p_deposit_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  referral_record public.referrals%ROWTYPE;
  referrer_profile public.profiles%ROWTYPE;
  referred_profile public.profiles%ROWTYPE;
  referrer_bonus numeric;
  welcome_bonus numeric := 10;
BEGIN
  -- No minimum deposit threshold — fires on ANY deposit size
  IF p_deposit_amount IS NULL OR p_deposit_amount <= 0 THEN
    RETURN jsonb_build_object('processed', false, 'reason', 'invalid_amount');
  END IF;

  -- Find the pending referral record
  SELECT *
  INTO referral_record
  FROM public.referrals
  WHERE referred_user_id = p_referred_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('processed', false, 'reason', 'no_referral');
  END IF;

  -- Only process if still pending (not already qualified or rejected)
  IF referral_record.status <> 'pending' THEN
    RETURN jsonb_build_object(
      'processed', false,
      'reason', CASE WHEN referral_record.status = 'qualified' THEN 'already_qualified' ELSE 'not_pending' END
    );
  END IF;

  -- Fetch referrer profile
  SELECT *
  INTO referrer_profile
  FROM public.profiles
  WHERE id = referral_record.referrer_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('processed', false, 'reason', 'profile_not_found');
  END IF;

  -- Fetch referred user profile
  SELECT *
  INTO referred_profile
  FROM public.profiles
  WHERE id = p_referred_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('processed', false, 'reason', 'profile_not_found');
  END IF;

  -- Verify referral relationship integrity
  IF referred_profile.referred_by IS DISTINCT FROM referrer_profile.id THEN
    RETURN jsonb_build_object('processed', false, 'reason', 'referral_mismatch');
  END IF;

  -- Reject if referrer and referred are the same person
  IF referrer_profile.id = referred_profile.id
    OR (
      COALESCE(referrer_profile.email, '') <> ''
      AND lower(btrim(referrer_profile.email)) = lower(btrim(COALESCE(referred_profile.email, '')))
    )
    OR (
      public.normalize_referral_phone(referrer_profile.phone) IS NOT NULL
      AND public.normalize_referral_phone(referrer_profile.phone) = public.normalize_referral_phone(referred_profile.phone)
    ) THEN
    UPDATE public.referrals
    SET status = 'rejected',
        updated_at = now()
    WHERE id = referral_record.id;

    RETURN jsonb_build_object('processed', false, 'reason', 'duplicate_identity');
  END IF;

  -- Prevent double-payment: check if already processed
  IF EXISTS (
    SELECT 1
    FROM public.referral_earnings_log
    WHERE referrer_id = referral_record.referrer_id
      AND referred_user_id = p_referred_user_id
    LIMIT 1
  ) THEN
    RETURN jsonb_build_object('processed', false, 'reason', 'already_paid');
  END IF;

  -- ─── Calculate rewards ─────────────────────────────────────────────────
  -- 10% of deposit amount to referrer, KES 10 welcome bonus to referred user
  referrer_bonus := round(p_deposit_amount * 0.10, 2);

  -- ─── Ensure wallets exist (DO NOT touch existing balances) ──────────────
  INSERT INTO public.wallets (user_id, balance, demo_balance, created_at, updated_at)
  VALUES
    (referrer_profile.id, 0, 10000, now(), now()),
    (referred_profile.id, 0, 10000, now(), now())
  ON CONFLICT (user_id) DO NOTHING;

  -- ─── Credit referrer (10% of deposit) ───────────────────────────────────
  UPDATE public.wallets
  SET balance = COALESCE(balance, 0) + referrer_bonus,
      updated_at = now()
  WHERE user_id = referrer_profile.id;

  INSERT INTO public.wallet_ledger (user_id, type, mode, amount, description, created_at)
  VALUES (
    referrer_profile.id,
    'referral',
    'credit',
    referrer_bonus,
    format('Referral bonus: 10%% of KES %s deposit', p_deposit_amount),
    now()
  );

  -- ─── Credit referred user (KES 10 welcome bonus) ─────────────────────────
  UPDATE public.wallets
  SET balance = COALESCE(balance, 0) + welcome_bonus,
      updated_at = now()
  WHERE user_id = referred_profile.id;

  INSERT INTO public.wallet_ledger (user_id, type, mode, amount, description, created_at)
  VALUES (
    referred_profile.id,
    'referral',
    'credit',
    welcome_bonus,
    format('Welcome bonus from referral (referrer: %s)', referrer_profile.id),
    now()
  );

  -- ─── Update referral record ─────────────────────────────────────────────
  UPDATE public.referrals
  SET status = 'qualified',
      qualified_at = now(),
      first_deposit_amount = p_deposit_amount,
      first_deposit_id = p_deposit_id,
      referrer_bonus_paid = referrer_bonus,
      welcome_bonus_paid = welcome_bonus,
      updated_at = now()
  WHERE id = referral_record.id;

  -- ─── Log earnings ───────────────────────────────────────────────────────
  INSERT INTO public.referral_earnings_log (
    referrer_id,
    referred_user_id,
    amount,
    source,
    description,
    created_at
  )
  VALUES
    (
      referrer_profile.id,
      referred_profile.id,
      referrer_bonus,
      'deposit_commission',
      format('10%% referral commission on KES %s deposit', p_deposit_amount),
      now()
    ),
    (
      referrer_profile.id,
      referred_profile.id,
      welcome_bonus,
      'welcome_bonus',
      'Welcome bonus for referred user',
      now()
    );

  -- ─── Send notifications if the notifications table exists ──────────────
  IF to_regclass('public.notifications') IS NOT NULL THEN
    BEGIN
      EXECUTE
        'INSERT INTO public.notifications (user_id, title, body, read, created_at)
         VALUES ($1, $2, $3, false, now())'
      USING
        referrer_profile.id,
        'Referral Reward Earned',
        format('You earned KES %s (10%%) from your referral!', referrer_bonus);
    EXCEPTION
      WHEN undefined_table OR undefined_column OR not_null_violation THEN
        NULL;
    END;

    BEGIN
      EXECUTE
        'INSERT INTO public.notifications (user_id, title, body, read, created_at)
         VALUES ($1, $2, $3, false, now())'
      USING
        referred_profile.id,
        'Welcome Bonus Credited',
        format('Welcome bonus KES %s credited!', welcome_bonus);
    EXCEPTION
      WHEN undefined_table OR undefined_column OR not_null_violation THEN
        NULL;
    END;
  END IF;

  RETURN jsonb_build_object(
    'processed', true,
    'referrerId', referrer_profile.id,
    'referredUserId', referred_profile.id,
    'referrerBonus', referrer_bonus,
    'welcomeBonus', welcome_bonus,
    'depositAmount', p_deposit_amount
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('processed', false, 'error', SQLERRM);
END;
$$;
