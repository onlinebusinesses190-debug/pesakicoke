-- Migration: Admin infrastructure
-- Adds admin_users table, is_admin() function, support_tickets,
-- notification_broadcasts, admin_list_users RPC, and banned column on profiles.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ─── admin_users table ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.admin_users (
  user_id  uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role     text NOT NULL DEFAULT 'admin' CHECK (role IN ('admin', 'super_admin')),
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_admin_users_role ON public.admin_users(role);

-- ─── is_admin function ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_admin(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admin_users WHERE user_id = p_user_id
  )
$$;

-- ─── Add banned column to profiles (tolerate if already present) ─────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS banned boolean DEFAULT false NOT NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_banned ON public.profiles(banned);

-- ─── support_tickets table ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.support_tickets (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid REFERENCES auth.users(id),
  subject        text NOT NULL,
  priority       text DEFAULT 'med' CHECK (priority IN ('low', 'med', 'high', 'urgent')),
  status         text DEFAULT 'open' CHECK (status IN ('open', 'in_review', 'awaiting_user', 'resolved')),
  created_at     timestamptz DEFAULT now() NOT NULL,
  updated_at     timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON public.support_tickets(status);
CREATE INDEX IF NOT EXISTS idx_support_tickets_priority ON public.support_tickets(priority);
CREATE INDEX IF NOT EXISTS idx_support_tickets_user ON public.support_tickets(user_id);

-- ─── Extend kazi_disputes for admin resolution ─────────────────────────────
ALTER TABLE public.kazi_disputes
  ADD COLUMN IF NOT EXISTS resolution    text,
  ADD COLUMN IF NOT EXISTS resolved_at   timestamptz,
  ADD COLUMN IF NOT EXISTS resolved_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- Support triggers for updated_at
CREATE OR REPLACE FUNCTION public.touch_support_tickets_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_support_tickets_updated_at ON public.support_tickets;
CREATE TRIGGER trg_support_tickets_updated_at
  BEFORE UPDATE ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.touch_support_tickets_updated_at();

-- ─── notification_broadcasts table ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.notification_broadcasts (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title        text NOT NULL,
  body         text NOT NULL,
  audience     text NOT NULL DEFAULT 'all',
  channel      text NOT NULL DEFAULT 'in_app',
  status       text NOT NULL DEFAULT 'sent',
  created_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_notification_broadcasts_created_at ON public.notification_broadcasts(created_at DESC);

-- ─── admin_list_users RPC ─────────────────────────────────────────────────────
-- Returns a paginated, searchable list of users joining auth.users, profiles, wallets.
CREATE OR REPLACE FUNCTION public.admin_list_users(
  p_search  text DEFAULT '',
  p_limit   int  DEFAULT 50,
  p_offset  int  DEFAULT 0
)
RETURNS TABLE (
  id               uuid,
  email            text,
  full_name        text,
  phone            text,
  banned           boolean,
  kyc_status       text,
  balance          numeric,
  last_sign_in_at  timestamptz,
  created_at       timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    u.id,
    u.email,
    p.full_name,
    p.phone,
    COALESCE(p.banned, false),
    CASE
      WHEN u.email_confirmed_at IS NOT NULL THEN 'Verified'
      ELSE 'Pending'
    END,
    COALESCE(w.balance, 0),
    u.last_sign_in_at,
    u.created_at
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.id = u.id
  LEFT JOIN public.wallets w ON w.user_id = u.id
  WHERE (p_search = ''
         OR u.email ILIKE '%' || p_search || '%'
         OR p.full_name ILIKE '%' || p_search || '%'
         OR p.phone ILIKE '%' || p_search || '%')
  ORDER BY u.created_at DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$;

REVOKE ALL ON FUNCTION public.is_admin(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.admin_list_users(text, int, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list_users(text, int, int) TO service_role;

-- ─── count_unconfirmed_users RPC ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.count_unconfirmed_users()
RETURNS bigint
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT COUNT(*) FROM auth.users WHERE email_confirmed_at IS NULL;
$$;

REVOKE ALL ON FUNCTION public.count_unconfirmed_users() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.count_unconfirmed_users() TO service_role;

-- ─── admin_revenue_series RPC ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_revenue_series()
RETURNS TABLE (
  m        text,
  v        numeric
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT
    to_char(created_at, 'Mon') AS m,
    ROUND(SUM(amount)::numeric, 1) AS v
  FROM public.wallet_ledger
  WHERE mode = 'credit'
    AND is_demo = false
    AND created_at >= (now() - interval '12 months')
  GROUP BY date_trunc('month', created_at)
  ORDER BY date_trunc('month', created_at)
$$;

REVOKE ALL ON FUNCTION public.admin_revenue_series() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_revenue_series() TO service_role;

-- ─── admin_recent_transactions RPC ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_recent_transactions(p_limit int DEFAULT 10)
RETURNS TABLE (
  id          text,
  "user"      text,
  type        text,
  amount      numeric,
  method      text,
  status      text,
  date        text
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT
    l.id::text,
    COALESCE(p.full_name, substr(u.email, 1, position('@' in u.email) - 1), 'Unknown'),
    l.type,
    l.amount,
    COALESCE(l.description, ''),
    'completed',
    to_char(l.created_at, 'Mon DD, HH24:MI')
  FROM public.wallet_ledger l
  LEFT JOIN auth.users u ON u.id = l.user_id
  LEFT JOIN public.profiles p ON p.id = l.user_id
  ORDER BY l.created_at DESC
  LIMIT p_limit
$$;

REVOKE ALL ON FUNCTION public.admin_recent_transactions(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_recent_transactions(int) TO service_role;
