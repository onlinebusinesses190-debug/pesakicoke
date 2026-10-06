-- Pesaki FX Trading engine (from metatrader-companion / Lovable).
--
-- The new frontend (src/lib/fx/fx.functions.ts) talks to Supabase directly via
-- TanStack server functions. It expects two tables and two RPCs that did not
-- exist in PESAKI, so they are created here.
--
-- Tables are prefixed `pesaki_fx_` to avoid colliding with the existing Binary
-- FX `fx_trades` table (20260912_create_fx_trades.sql), which the /games/fx
-- route and admin screens still use and must not be disturbed.
--
-- The migration runner (scripts/run-migrations.mjs) applies every .sql file in
-- supabase/migrations/ in sorted order, so this file is picked up automatically.

-- ── Wallets ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pesaki_fx_wallets (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  demo_balance numeric(14,2) NOT NULL DEFAULT 100000,
  real_balance numeric(14,2) NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.pesaki_fx_wallets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own wallet read" ON public.pesaki_fx_wallets;
CREATE POLICY "own wallet read"
  ON public.pesaki_fx_wallets
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

GRANT SELECT ON public.pesaki_fx_wallets TO authenticated;
GRANT ALL ON public.pesaki_fx_wallets TO service_role;

-- ── Trades ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pesaki_fx_trades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mode text NOT NULL CHECK (mode IN ('demo', 'real')),
  symbol text NOT NULL,
  side text NOT NULL CHECK (side IN ('buy', 'sell')),
  amount numeric(14,2) NOT NULL CHECK (amount >= 100 AND amount <= 100000),
  margin numeric(14,2) NOT NULL DEFAULT 0,
  leverage int NOT NULL,
  entry_price numeric(18,6) NOT NULL,
  exit_price numeric(18,6),
  pnl numeric(14,2),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  close_reason text,
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_pesaki_fx_trades_user
  ON public.pesaki_fx_trades (user_id, status, opened_at DESC);

ALTER TABLE public.pesaki_fx_trades ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own trades read" ON public.pesaki_fx_trades;
CREATE POLICY "own trades read"
  ON public.pesaki_fx_trades
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

GRANT SELECT ON public.pesaki_fx_trades TO authenticated;
GRANT ALL ON public.pesaki_fx_trades TO service_role;

-- ── Atomic open: deduct margin, insert trade ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.pesaki_fx_open_trade(
  _user uuid, _mode text, _symbol text, _side text,
  _amount numeric, _leverage int, _entry numeric
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE bal numeric; tid uuid; m numeric;
BEGIN
  m := round(_amount / _leverage, 2);
  INSERT INTO pesaki_fx_wallets(user_id) VALUES (_user) ON CONFLICT DO NOTHING;
  SELECT CASE WHEN _mode='real' THEN real_balance ELSE demo_balance END
    INTO bal
    FROM pesaki_fx_wallets WHERE user_id=_user FOR UPDATE;
  IF bal < m THEN RAISE EXCEPTION 'Insufficient balance'; END IF;
  IF _mode='real' THEN
    UPDATE pesaki_fx_wallets SET real_balance=real_balance-m, updated_at=now() WHERE user_id=_user;
  ELSE
    UPDATE pesaki_fx_wallets SET demo_balance=demo_balance-m, updated_at=now() WHERE user_id=_user;
  END IF;
  INSERT INTO pesaki_fx_trades(user_id,mode,symbol,side,amount,margin,leverage,entry_price)
    VALUES (_user,_mode,_symbol,_side,_amount,m,_leverage,_entry) RETURNING id INTO tid;
  RETURN tid;
END $$;

-- ── Atomic close: return margin + pnl (never below 0) ────────────────────────
CREATE OR REPLACE FUNCTION public.pesaki_fx_close_trade(
  _user uuid, _trade uuid, _exit numeric, _pnl numeric, _reason text
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE t pesaki_fx_trades; payout numeric; p numeric;
BEGIN
  SELECT * INTO t FROM pesaki_fx_trades
    WHERE id=_trade AND user_id=_user AND status='open' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Trade not open'; END IF;
  p := GREATEST(_pnl, -t.margin);
  payout := t.margin + p;
  UPDATE pesaki_fx_trades
    SET status='closed', exit_price=_exit, pnl=p, close_reason=_reason, closed_at=now()
    WHERE id=_trade;
  IF t.mode='real' THEN
    UPDATE pesaki_fx_wallets SET real_balance=real_balance+payout, updated_at=now() WHERE user_id=_user;
  ELSE
    UPDATE pesaki_fx_wallets SET demo_balance=demo_balance+payout, updated_at=now() WHERE user_id=_user;
  END IF;
  RETURN payout;
END $$;

REVOKE ALL ON FUNCTION public.pesaki_fx_open_trade(uuid,text,text,text,numeric,int,numeric)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pesaki_fx_close_trade(uuid,uuid,numeric,numeric,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pesaki_fx_open_trade(uuid,text,text,text,numeric,int,numeric) TO service_role;
GRANT EXECUTE ON FUNCTION public.pesaki_fx_close_trade(uuid,uuid,numeric,numeric,text) TO service_role;