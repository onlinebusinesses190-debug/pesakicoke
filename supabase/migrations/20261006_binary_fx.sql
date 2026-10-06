-- Binary FX trade table (isolated from existing fx_trades).
CREATE TABLE IF NOT EXISTS public.bfx_trades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mode text NOT NULL CHECK (mode IN ('demo','real')),
  asset text NOT NULL,
  direction text NOT NULL CHECK (direction IN ('up','down')),
  stake numeric(14,2) NOT NULL CHECK (stake > 0),
  payout_percentage numeric(5,2) NOT NULL,
  entry_price numeric(18,6) NOT NULL,
  expiry_price numeric(18,6),
  opened_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  settled_at timestamptz,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','win','loss','tie','cancelled')),
  profit numeric(14,2) DEFAULT 0,
  total_return numeric(14,2) DEFAULT 0,
  settlement_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bfx_trades_user ON public.bfx_trades (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bfx_trades_open_expiry ON public.bfx_trades (expires_at) WHERE status = 'open';

ALTER TABLE public.bfx_trades ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "bfx_users_view_own" ON public.bfx_trades;
CREATE POLICY "bfx_users_view_own" ON public.bfx_trades FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "bfx_users_insert_own" ON public.bfx_trades;
CREATE POLICY "bfx_users_insert_own" ON public.bfx_trades FOR INSERT WITH CHECK (auth.uid() = user_id);

GRANT SELECT ON public.bfx_trades TO authenticated;
GRANT ALL ON public.bfx_trades TO service_role;