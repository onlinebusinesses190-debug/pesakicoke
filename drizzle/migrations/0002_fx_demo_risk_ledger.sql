CREATE TABLE public.fx_risk_settings (
 id boolean PRIMARY KEY DEFAULT true CHECK (id), loss_rate numeric NOT NULL DEFAULT 0.20 CHECK (loss_rate BETWEEN 0 AND 1), interval_seconds integer NOT NULL DEFAULT 5 CHECK (interval_seconds BETWEEN 5 AND 60), fee_threshold numeric NOT NULL DEFAULT 1000 CHECK (fee_threshold >= 100), fixed_fee numeric NOT NULL DEFAULT 5 CHECK (fixed_fee >= 0), fee_rate numeric NOT NULL DEFAULT 0.01 CHECK (fee_rate BETWEEN 0 AND 1)
);
GRANT SELECT ON public.fx_risk_settings TO authenticated;
GRANT ALL ON public.fx_risk_settings TO service_role;
ALTER TABLE public.fx_risk_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Read demo risk rules" ON public.fx_risk_settings FOR SELECT TO authenticated USING (true);
ALTER TABLE public.fx_trades ADD COLUMN risk_loss numeric NOT NULL DEFAULT 0, ADD COLUMN fee numeric NOT NULL DEFAULT 0, ADD COLUMN fee_estimate numeric NOT NULL DEFAULT 0, ADD COLUMN risk_rate numeric NOT NULL DEFAULT 0, ADD COLUMN risk_interval integer NOT NULL DEFAULT 5, ADD COLUMN last_risk_at timestamptz, ADD COLUMN risk_version integer NOT NULL DEFAULT 0;
CREATE TABLE public.fx_ledger (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, trade_id uuid, event text NOT NULL, amount numeric NOT NULL, occurred_at timestamptz NOT NULL DEFAULT now(), UNIQUE (trade_id,event,occurred_at)
);
GRANT SELECT ON public.fx_ledger TO authenticated;
GRANT ALL ON public.fx_ledger TO service_role;
ALTER TABLE public.fx_ledger ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own trading ledger" ON public.fx_ledger FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE INDEX fx_risk_open_idx ON public.fx_trades(last_risk_at) WHERE status='open' AND mode='demo';
CREATE OR REPLACE FUNCTION public.fx_rules() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT jsonb_build_object('lossRate',coalesce((SELECT loss_rate FROM fx_risk_settings WHERE id),0.20),'intervalSeconds',coalesce((SELECT interval_seconds FROM fx_risk_settings WHERE id),5),'feeThreshold',coalesce((SELECT fee_threshold FROM fx_risk_settings WHERE id),1000),'fixedFee',coalesce((SELECT fixed_fee FROM fx_risk_settings WHERE id),5),'feeRate',coalesce((SELECT fee_rate FROM fx_risk_settings WHERE id),0.01));
$$;
REVOKE ALL ON FUNCTION public.fx_rules() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.fx_rules() TO authenticated,service_role;
CREATE OR REPLACE FUNCTION public.fx_ensure_wallet() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Account required'; END IF;
 INSERT INTO fx_wallets(user_id) VALUES(auth.uid()) ON CONFLICT DO NOTHING;
END $$;
REVOKE ALL ON FUNCTION public.fx_ensure_wallet() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.fx_ensure_wallet() TO authenticated;
COMMENT ON TABLE public.fx_risk_settings IS 'Demo-only timed risk rules. Default rule is 20% of reserved margin every 5 seconds; never real-market loss.';
COMMENT ON TABLE public.fx_ledger IS 'Owner-readable immutable application ledger; writes only through locked trading functions.';