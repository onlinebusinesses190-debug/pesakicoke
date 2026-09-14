-- Supabase migration: fx_trades table for Binary FX (Pocket Option-style) trades.
-- Run with the migration runner scripts/run-migrations.mjs

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.fx_trades (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pair          text NOT NULL,
  direction     text NOT NULL CHECK (direction IN ('buy', 'sell')),
  stake         numeric(18,2) NOT NULL CHECK (stake > 0),
  entry_price   numeric(18,6) NOT NULL,
  expiry_price  numeric(18,6),
  duration      integer NOT NULL CHECK (duration > 0),
  mode          text NOT NULL CHECK (mode IN ('demo', 'real')),
  status        text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'won', 'lost')),
  payout_amount numeric(18,2) NOT NULL DEFAULT 0,
  entry_time    timestamptz NOT NULL DEFAULT now(),
  expiry_time   timestamptz NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fx_trades_user_mode_created
  ON public.fx_trades(user_id, mode, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_fx_trades_pending_expiry
  ON public.fx_trades(status, expiry_time)
  WHERE status = 'pending';

-- Row Level Security: users can only see and insert their own trades.
-- UPDATE is handled by the service-role backend (settle endpoint), so we
-- do not grant UPDATE to the anon/authenticated role here.
ALTER TABLE public.fx_trades ENABLE ROW LEVEL SECURITY;

CREATE POLICY fx_trades_select_own
  ON public.fx_trades
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY fx_trades_insert_own
  ON public.fx_trades
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);