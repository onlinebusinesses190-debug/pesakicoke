-- Finoq wallet top-up tracking table
-- Used by admin POST /api/admin/finoq/topup to record top-up attempts

CREATE TABLE IF NOT EXISTS public.wallet_top_ups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  amount numeric(18,2) NOT NULL CHECK (amount > 0),
  phone_number text NOT NULL,
  reference_id text,
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'QUEUED', 'COMPLETED', 'FAILED')),
  provider_response jsonb DEFAULT '{}'::jsonb,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_wallet_top_ups_admin ON public.wallet_top_ups(admin_id);
CREATE INDEX IF NOT EXISTS idx_wallet_top_ups_status ON public.wallet_top_ups(status);
CREATE INDEX IF NOT EXISTS idx_wallet_top_ups_created_at ON public.wallet_top_ups(created_at);

-- Enable RLS
ALTER TABLE public.wallet_top_ups ENABLE ROW LEVEL SECURITY;

-- Admins can view all top-ups
CREATE POLICY IF NOT EXISTS wallet_top_ups_admin_select
  ON public.wallet_top_ups
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_users
      WHERE user_id = auth.uid()
    )
  );

-- Admins can insert top-ups
CREATE POLICY IF NOT EXISTS wallet_top_ups_admin_insert
  ON public.wallet_top_ups
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.admin_users
      WHERE user_id = auth.uid()
    )
  );
