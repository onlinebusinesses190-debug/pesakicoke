-- Supabase migration: referral system
-- Adds profile referral fields, referral tracking, reward ledger entries,
-- signup profile creation, referral-code generation, and atomic reward processing.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Extend profiles
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS referral_code text,
  ADD COLUMN IF NOT EXISTS referred_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS referred_at timestamptz;

-- Remove only duplicate non-null values before adding the unique constraint.
DO $$
BEGIN
  UPDATE public.profiles AS profile
  SET referral_code = NULL
  WHERE profile.referral_code IN (
    SELECT duplicate.referral_code
    FROM public.profiles AS duplicate
    WHERE duplicate.referral_code IS NOT NULL
    GROUP BY duplicate.referral_code
    HAVING COUNT(*) > 1
  );
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'profiles_referral_code_unique'
      AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_referral_code_unique UNIQUE (referral_code);
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_profiles_referred_by ON public.profiles(referred_by);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Identity normalization and referral-code generation
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.normalize_referral_phone(p_phone text)
RETURNS text
LANGUAGE sql
IMMUTABLE
STRICT
AS $$
  WITH cleaned AS (
    SELECT regexp_replace(p_phone, '\D', '', 'g') AS digits
  )
  SELECT CASE
    WHEN digits IS NULL OR digits = '' THEN NULL
    WHEN digits ~ '^0[0-9]{9}$' THEN '254' || substr(digits, 2)
    WHEN digits ~ '^254[71][0-9]{8}$' THEN digits
    WHEN digits ~ '^[71][0-9]{8}$' THEN '254' || digits
    ELSE digits
  END
  FROM cleaned;
$$;

CREATE OR REPLACE FUNCTION public.generate_referral_code()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  alphabet constant text := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  code text;
  index integer;
  position integer;
BEGIN
  LOOP
    code := 'PESAKI-';

    FOR index IN 1..6 LOOP
      position := 1 + (get_byte(gen_random_bytes(1), 0) % 36);
      code := code || substr(alphabet, position, 1);
    END LOOP;

    IF NOT EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE referral_code = code
    ) THEN
      RETURN code;
    END IF;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_referral_code_before_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.referral_code IS NULL OR btrim(NEW.referral_code) = '' THEN
    NEW.referral_code := public.generate_referral_code();
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_profile_from_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  metadata jsonb;
BEGIN
  metadata := COALESCE(NEW.raw_user_meta_data, '{}'::jsonb);

  INSERT INTO public.profiles (id, full_name, email, phone)
  VALUES (
    NEW.id,
    COALESCE(
      metadata ->> 'full_name',
      metadata ->> 'name',
      split_part(COALESCE(NEW.email, ''), '@', 1)
    ),
    NEW.email,
    NEW.phone
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_referral_code ON public.profiles;
CREATE TRIGGER trg_set_referral_code
  BEFORE INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.set_referral_code_before_insert();

DROP TRIGGER IF EXISTS trg_create_profile_from_auth_user ON auth.users;
CREATE TRIGGER trg_create_profile_from_auth_user
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.create_profile_from_auth_user();

-- Backfill profiles for existing auth users and assign codes where needed.
INSERT INTO public.profiles (id, full_name, email, phone)
SELECT
  auth_user.id,
  COALESCE(
    auth_user.raw_user_meta_data ->> 'full_name',
    auth_user.raw_user_meta_data ->> 'name',
    split_part(COALESCE(auth_user.email, ''), '@', 1)
  ),
  auth_user.email,
  auth_user.phone
FROM auth.users AS auth_user
WHERE NOT EXISTS (
  SELECT 1
  FROM public.profiles AS profile
  WHERE profile.id = auth_user.id
);

UPDATE public.profiles
SET referral_code = public.generate_referral_code()
WHERE referral_code IS NULL;

CREATE OR REPLACE FUNCTION public.prevent_referral_reassignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD.referred_by IS NOT NULL
    AND NEW.referred_by IS DISTINCT FROM OLD.referred_by THEN
    RAISE EXCEPTION 'A referred user cannot change referrers';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_referral_reassignment ON public.profiles;
CREATE TRIGGER trg_prevent_referral_reassignment
  BEFORE UPDATE OF referred_by ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_referral_reassignment();

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Referral tracking and earnings log
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  referred_user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  referral_code text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'qualified', 'rejected')),
  first_deposit_amount numeric DEFAULT 0,
  referrer_bonus_paid numeric DEFAULT 0,
  welcome_bonus_paid numeric DEFAULT 0,
  qualified_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CHECK (referrer_id <> referred_user_id)
);

CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON public.referrals(referrer_id);
CREATE INDEX IF NOT EXISTS idx_referrals_referred_user ON public.referrals(referred_user_id);
CREATE INDEX IF NOT EXISTS idx_referrals_referrer_status
  ON public.referrals(referrer_id, status);

CREATE TABLE IF NOT EXISTS public.referral_earnings_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  referred_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount numeric NOT NULL,
  source text NOT NULL DEFAULT 'signup_bonus',
  description text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_referral_earnings_referrer
  ON public.referral_earnings_log(referrer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_referral_earnings_referred
  ON public.referral_earnings_log(referred_user_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.set_referrals_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_referrals_updated_at ON public.referrals;
CREATE TRIGGER trg_referrals_updated_at
  BEFORE UPDATE ON public.referrals
  FOR EACH ROW
  EXECUTE FUNCTION public.set_referrals_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Atomic referral application
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.apply_referral_code(p_user_id uuid, p_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  caller_profile public.profiles%ROWTYPE;
  referrer_profile public.profiles%ROWTYPE;
  normalized_code text;
BEGIN
  normalized_code := upper(btrim(COALESCE(p_code, '')));

  SELECT *
  INTO caller_profile
  FROM public.profiles
  WHERE id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'profile_not_found');
  END IF;

  IF normalized_code = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_code');
  END IF;

  IF caller_profile.referred_by IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_referred');
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.referrals
    WHERE referred_user_id = p_user_id
    FOR UPDATE
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_referred');
  END IF;

  SELECT *
  INTO referrer_profile
  FROM public.profiles
  WHERE referral_code = normalized_code
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_code');
  END IF;

  IF referrer_profile.id = caller_profile.id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'self_referral');
  END IF;

  IF COALESCE(referrer_profile.email, '') <> ''
    AND lower(btrim(referrer_profile.email)) = lower(btrim(COALESCE(caller_profile.email, ''))) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'duplicate_identity');
  END IF;

  IF public.normalize_referral_phone(referrer_profile.phone) IS NOT NULL
    AND public.normalize_referral_phone(referrer_profile.phone) = public.normalize_referral_phone(caller_profile.phone) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'duplicate_identity');
  END IF;

  UPDATE public.profiles
  SET referred_by = referrer_profile.id,
      referred_at = now()
  WHERE id = p_user_id;

  INSERT INTO public.referrals (
    referrer_id,
    referred_user_id,
    referral_code,
    status,
    created_at,
    updated_at
  )
  VALUES (
    referrer_profile.id,
    p_user_id,
    referrer_profile.referral_code,
    'pending',
    now(),
    now()
  );

  RETURN jsonb_build_object(
    'ok', true,
    'referrerId', referrer_profile.id,
    'referrerName', COALESCE(referrer_profile.full_name, referrer_profile.email, 'PESAKI member')
  );
EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object('ok', false, 'error', 'referral_already_used');
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', 'apply_failed', 'message', SQLERRM);
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Atomic first-deposit reward qualification
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.process_referral_deposit(
  p_referred_user_id uuid,
  p_deposit_amount numeric,
  p_deposit_id uuid DEFAULT NULL
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
BEGIN
  IF p_deposit_amount IS NULL OR p_deposit_amount < 100 THEN
    RETURN jsonb_build_object('processed', false, 'reason', 'deposit_below_threshold');
  END IF;

  SELECT *
  INTO referral_record
  FROM public.referrals
  WHERE referred_user_id = p_referred_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('processed', false, 'reason', 'no_referral');
  END IF;

  IF referral_record.status <> 'pending' THEN
    RETURN jsonb_build_object(
      'processed', false,
      'reason', CASE WHEN referral_record.status = 'qualified' THEN 'already_qualified' ELSE 'not_pending' END
    );
  END IF;

  SELECT *
  INTO referrer_profile
  FROM public.profiles
  WHERE id = referral_record.referrer_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('processed', false, 'reason', 'profile_not_found');
  END IF;

  SELECT *
  INTO referred_profile
  FROM public.profiles
  WHERE id = p_referred_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('processed', false, 'reason', 'profile_not_found');
  END IF;

  IF referred_profile.referred_by IS DISTINCT FROM referrer_profile.id THEN
    RETURN jsonb_build_object('processed', false, 'reason', 'referral_mismatch');
  END IF;

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

  IF EXISTS (
    SELECT 1
    FROM public.referral_earnings_log
    WHERE referrer_id = referral_record.referrer_id
      AND referred_user_id = p_referred_user_id
    LIMIT 1
  ) THEN
    RETURN jsonb_build_object('processed', false, 'reason', 'already_paid');
  END IF;

  INSERT INTO public.wallets (
    user_id,
    balance,
    demo_balance,
    created_at,
    updated_at
  )
  VALUES
    (referrer_profile.id, 0, 0, now(), now()),
    (referred_profile.id, 0, 0, now(), now())
  ON CONFLICT (user_id) DO NOTHING;

  UPDATE public.wallets
  SET balance = COALESCE(balance, 0) + 20,
      updated_at = now()
  WHERE user_id = referrer_profile.id;

  INSERT INTO public.wallet_ledger (
    user_id,
    type,
    mode,
    amount,
    description,
    created_at
  )
  VALUES (
    referrer_profile.id,
    'referral',
    'credit',
    20,
    'Referral signup bonus',
    now()
  );

  UPDATE public.wallets
  SET balance = COALESCE(balance, 0) + 10,
      updated_at = now()
  WHERE user_id = referred_profile.id;

  INSERT INTO public.wallet_ledger (
    user_id,
    type,
    mode,
    amount,
    description,
    created_at
  )
  VALUES (
    referred_profile.id,
    'referral',
    'credit',
    10,
    'Welcome bonus from referral',
    now()
  );

  UPDATE public.referrals
  SET status = 'qualified',
      qualified_at = now(),
      first_deposit_amount = p_deposit_amount,
      referrer_bonus_paid = 20,
      welcome_bonus_paid = 10,
      updated_at = now()
  WHERE id = referral_record.id;

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
      20,
      'signup_bonus',
      'Referral signup bonus',
      now()
    ),
    (
      referrer_profile.id,
      referred_profile.id,
      10,
      'signup_bonus',
      'Welcome bonus from referral',
      now()
    );

  IF to_regclass('public.notifications') IS NOT NULL THEN
    BEGIN
      EXECUTE
        'INSERT INTO public.notifications (user_id, title, body, read, created_at)
         VALUES ($1, $2, $3, false, now())'
      USING
        referrer_profile.id,
        'Referral Reward Earned',
        'You earned KES 20 from your referral!';
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
        'Welcome bonus KES 10 credited!';
    EXCEPTION
      WHEN undefined_table OR undefined_column OR not_null_violation THEN
        NULL;
    END;
  END IF;

  RETURN jsonb_build_object(
    'processed', true,
    'referrerId', referrer_profile.id,
    'referredUserId', referred_profile.id,
    'referrerBonus', 20,
    'welcomeBonus', 10
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('processed', false, 'error', SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION public.apply_referral_code(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.process_referral_deposit(uuid, numeric, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_referral_code(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.process_referral_deposit(uuid, numeric, uuid) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Row Level Security
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_earnings_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS referrals_select_own ON public.referrals;
CREATE POLICY referrals_select_own
  ON public.referrals
  FOR SELECT
  USING (auth.uid() = referrer_id OR auth.uid() = referred_user_id);

DROP POLICY IF EXISTS referral_earnings_select_own ON public.referral_earnings_log;
CREATE POLICY referral_earnings_select_own
  ON public.referral_earnings_log
  FOR SELECT
  USING (auth.uid() = referrer_id OR auth.uid() = referred_user_id);
