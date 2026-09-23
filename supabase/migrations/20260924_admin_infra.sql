-- Migration: Admin infrastructure (comprehensive rebuild)
-- Adds admin_users.email, admin_actions table, profile extensions for admin queries.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ─── Extend admin_users with email for lookup ─────────────────────────────────
ALTER TABLE public.admin_users
  ADD COLUMN IF NOT EXISTS email text;

CREATE INDEX IF NOT EXISTS idx_admin_users_email ON public.admin_users(email);

-- ─── admin_actions table (audit log) ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.admin_actions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action      text NOT NULL,
  target_id   text,
  target_type text,
  metadata    jsonb DEFAULT '{}'::jsonb,
  created_at  timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_admin_actions_admin ON public.admin_actions(admin_id);
CREATE INDEX IF NOT EXISTS idx_admin_actions_created_at ON public.admin_actions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_actions_target ON public.admin_actions(target_type, target_id);

-- ─── Extend profiles for admin queries ────────────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS kyc_status    text DEFAULT 'Pending' NOT NULL,
  ADD COLUMN IF NOT EXISTS last_sign_in_at timestamptz,
  ADD COLUMN IF NOT EXISTS ban_reason text,
  ADD COLUMN IF NOT EXISTS banned_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_profiles_kyc_status ON public.profiles(kyc_status);
CREATE INDEX IF NOT EXISTS idx_profiles_created_at ON public.profiles(created_at);

-- ─── Helper: count active users (last 24h / 7d) via auth.users last_sign_in_at ──
CREATE OR REPLACE FUNCTION public.count_active_users_24h()
RETURNS bigint
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT COUNT(*) FROM auth.users
  WHERE last_sign_in_at >= (now() - interval '24 hours');
$$;

CREATE OR REPLACE FUNCTION public.count_active_users_7d()
RETURNS bigint
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT COUNT(*) FROM auth.users
  WHERE last_sign_in_at >= (now() - interval '7 days');
$$;

REVOKE ALL ON FUNCTION public.count_active_users_24h() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.count_active_users_24h() TO service_role;
REVOKE ALL ON FUNCTION public.count_active_users_7d() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.count_active_users_7d() TO service_role;

-- ─── Helper: log admin action ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.log_admin_action(
  p_admin_id  uuid,
  p_action    text,
  p_target_id text DEFAULT NULL,
  p_target_type text DEFAULT NULL,
  p_metadata  jsonb DEFAULT '{}'
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO public.admin_actions (admin_id, action, target_id, target_type, metadata)
  VALUES (p_admin_id, p_action, p_target_id, p_target_type, p_metadata);
EXCEPTION WHEN OTHERS THEN
  NULL;
END;
$$ SECURITY DEFINER;

REVOKE ALL ON FUNCTION public.log_admin_action(uuid, text, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_admin_action(uuid, text, text, text, jsonb) TO service_role;

-- ─── Helper: count admin actions ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_action_count()
RETURNS bigint
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT COUNT(*) FROM public.admin_actions;
$$;

REVOKE ALL ON FUNCTION public.admin_action_count() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_action_count() TO service_role;

-- ─── Helper: revenue series with day resolution ───────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_revenue_series_daily(
  p_from timestamptz DEFAULT NULL,
  p_to   timestamptz DEFAULT NULL
)
RETURNS TABLE (
  d date,
  deposits numeric,
  withdrawals numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    date_trunc('day', wl.created_at)::date,
    COALESCE(SUM(CASE WHEN wl.type = 'deposit' AND wl.mode = 'credit' AND wl.is_demo = false THEN wl.amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN wl.type = 'withdrawal' AND wl.mode = 'debit' AND wl.is_demo = false THEN wl.amount ELSE 0 END), 0)
  FROM public.wallet_ledger wl
  WHERE (p_from IS NULL OR wl.created_at >= p_from)
    AND (p_to IS NULL OR wl.created_at <= p_to)
  GROUP BY date_trunc('day', wl.created_at)
  ORDER BY date_trunc('day', wl.created_at);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_revenue_series_daily(timestamptz, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_revenue_series_daily(timestamptz, timestamptz) TO service_role;

-- ─── Helper: signups by day ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_signups_series(
  p_from timestamptz DEFAULT NULL,
  p_to   timestamptz DEFAULT NULL
)
RETURNS TABLE (
  d date,
  signups int
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    date_trunc('day', auth.created_at)::date,
    COUNT(*)::int
  FROM auth.users auth
  WHERE (p_from IS NULL OR auth.created_at >= p_from)
    AND (p_to IS NULL OR auth.created_at <= p_to)
  GROUP BY date_trunc('day', auth.created_at)
  ORDER BY date_trunc('day', auth.created_at);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_signups_series(timestamptz, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_signups_series(timestamptz, timestamptz) TO service_role;

-- ─── Helper: deposits by day ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_deposits_series(
  p_from timestamptz DEFAULT NULL,
  p_to   timestamptz DEFAULT NULL
)
RETURNS TABLE (
  d date,
  amount numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    date_trunc('day', md.created_at)::date,
    COALESCE(SUM(md.amount), 0)
  FROM public.mpesa_deposits md
  WHERE (p_from IS NULL OR md.created_at >= p_from)
    AND (p_to IS NULL OR md.created_at <= p_to)
  GROUP BY date_trunc('day', md.created_at)
  ORDER BY date_trunc('day', md.created_at);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_deposits_series(timestamptz, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_deposits_series(timestamptz, timestamptz) TO service_role;

-- ─── Helper: withdrawals by day ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_withdrawals_series(
  p_from timestamptz DEFAULT NULL,
  p_to   timestamptz DEFAULT NULL
)
RETURNS TABLE (
  d date,
  amount numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    date_trunc('day', bw.created_at)::date,
    COALESCE(SUM(bw.amount), 0)
  FROM public.b2c_withdrawals bw
  WHERE (p_from IS NULL OR bw.created_at >= p_from)
    AND (p_to IS NULL OR bw.created_at <= p_to)
  GROUP BY date_trunc('day', bw.created_at)
  ORDER BY date_trunc('day', bw.created_at);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_withdrawals_series(timestamptz, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_withdrawals_series(timestamptz, timestamptz) TO service_role;

-- ─── Helper: insert admin action record (can be called from backend) ────────
-- The backend will insert directly into admin_actions table using supabase rpc or insert.
CREATE OR REPLACE FUNCTION public.admin_insert_action(
  p_admin_id    uuid,
  p_action      text,
  p_target_id   text DEFAULT NULL,
  p_target_type text DEFAULT NULL,
  p_metadata    jsonb DEFAULT '{}'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.admin_actions (admin_id, action, target_id, target_type, metadata)
  VALUES (p_admin_id, p_action, p_target_id, p_target_type, p_metadata)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_insert_action(uuid, text, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_insert_action(uuid, text, text, text, jsonb) TO service_role;
