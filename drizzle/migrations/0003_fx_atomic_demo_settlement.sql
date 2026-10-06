CREATE OR REPLACE FUNCTION public.fx_hash(_seed bigint,_i bigint) RETURNS double precision LANGUAGE plpgsql IMMUTABLE SET search_path=public AS $$
DECLARE h bigint;
BEGIN
 h:=((_i & 4294967295)*668265261 & 4294967295) # (_seed & 4294967295);
 h:=h # (h >> 15); h:=(h*2246822507) & 4294967295;
 h:=h # (h >> 13); h:=(h*3266489909) & 4294967295;
 h:=h # (h >> 16);
 RETURN (h::double precision/4294967295)*2-1;
END $$;
CREATE OR REPLACE FUNCTION public.fx_mid(_symbol text,_t double precision) RETURNS double precision LANGUAGE plpgsql IMMUTABLE SET search_path=public AS $$
DECLARE periods integer[]:=ARRAY[2,15,90,600,3600,21600,259200]; bases double precision[]:=ARRAY[1.0852,1.2648,149.52,0.6551,1.3602,0.8803,0.6004,162.24,189.11,2351.4]; vols double precision[]:=ARRAY[1,1.15,1.1,1.2,0.9,0.95,1.25,1.2,1.45,1.6]; symbols text[]:=ARRAY['EURUSD','GBPUSD','USDJPY','AUDUSD','USDCAD','USDCHF','NZDUSD','EURJPY','GBPJPY','XAUUSD']; pos integer; k integer; j integer; seed bigint; s text; f double precision; u double precision; i bigint; x double precision:=0; amp double precision;
BEGIN
 pos:=array_position(symbols,_symbol); IF pos IS NULL THEN RAISE EXCEPTION 'Unknown pair'; END IF;
 FOR k IN 1..7 LOOP
  s:=_symbol||'#'||(k-1); seed:=2166136261;
  FOR j IN 1..length(s) LOOP seed:=((seed # ascii(substr(s,j,1)))*16777619) & 4294967295; END LOOP;
  i:=floor(_t/periods[k]); f:=_t/periods[k]-i; u:=f*f*(3-2*f);
  amp:=0.00035*sqrt(periods[k]::double precision/60)*(CASE WHEN periods[k]<=600 THEN 35 ELSE 4 END);
  x:=x+amp*(fx_hash(seed,i)+(fx_hash(seed,i+1)-fx_hash(seed,i))*u);
 END LOOP;
 RETURN bases[pos]*exp(x*vols[pos]);
END $$;
CREATE OR REPLACE FUNCTION public.fx_exit(_symbol text,_side text,_t double precision) RETURNS numeric LANGUAGE plpgsql IMMUTABLE SET search_path=public AS $$
DECLARE digits integer; pts integer; mid double precision; half double precision;
BEGIN
 digits:=CASE WHEN _symbol IN ('USDJPY','EURJPY','GBPJPY') THEN 3 WHEN _symbol='XAUUSD' THEN 2 ELSE 5 END;
 pts:=CASE _symbol WHEN 'EURUSD' THEN 12 WHEN 'GBPUSD' THEN 15 WHEN 'USDJPY' THEN 14 WHEN 'AUDUSD' THEN 14 WHEN 'USDCAD' THEN 18 WHEN 'USDCHF' THEN 16 WHEN 'NZDUSD' THEN 18 WHEN 'EURJPY' THEN 20 WHEN 'GBPJPY' THEN 28 ELSE 30 END;
 mid:=fx_mid(_symbol,_t); half:=pts*power(10.0,-digits)/2;
 RETURN round((mid+CASE WHEN _side='buy' THEN -half ELSE half END)::numeric,digits);
END $$;
CREATE OR REPLACE FUNCTION public.fx_finish_demo(_trade uuid,_exit numeric,_gross numeric,_reason text,_at timestamptz) RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE t fx_trades; p numeric; fee_value numeric; payout numeric;
BEGIN
 SELECT * INTO t FROM fx_trades WHERE id=_trade AND status='open' AND mode='demo' FOR UPDATE;
 IF NOT FOUND THEN RETURN NULL; END IF;
 p:=greatest(round(_gross-t.risk_loss,2),-t.margin); fee_value:=least(t.fee_estimate,greatest(0,t.margin+p)); payout:=t.margin+p-fee_value;
 UPDATE fx_trades SET status='closed',exit_price=_exit,pnl=p-fee_value,fee=fee_value,close_reason=_reason,closed_at=_at WHERE id=t.id;
 UPDATE fx_wallets SET demo_balance=demo_balance+payout,updated_at=_at WHERE user_id=t.user_id;
 INSERT INTO fx_ledger(user_id,trade_id,event,amount,occurred_at) VALUES(t.user_id,t.id,'settlement',payout,_at),(t.user_id,t.id,'fee',-fee_value,_at);
 RETURN p-fee_value;
END $$;
CREATE OR REPLACE FUNCTION public.fx_process_demo(_user uuid DEFAULT NULL,_until timestamptz DEFAULT now()) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE t fx_trades; ex numeric; gross numeric; tick timestamptz; steps integer; processed integer:=0; deduction numeric;
BEGIN
 FOR t IN SELECT * FROM fx_trades WHERE mode='demo' AND status='open' AND (_user IS NULL OR user_id=_user) ORDER BY last_risk_at NULLS FIRST LIMIT 200 FOR UPDATE SKIP LOCKED LOOP
  IF t.last_risk_at IS NULL THEN t.last_risk_at:=t.opened_at; END IF;
  steps:=0;
  WHILE t.last_risk_at+make_interval(secs=>t.risk_interval)<=_until AND steps<720 AND t.status='open' LOOP
   tick:=t.last_risk_at+make_interval(secs=>t.risk_interval); ex:=fx_exit(t.symbol,t.side,extract(epoch FROM tick)); gross:=round(t.amount*(CASE WHEN t.side='buy' THEN 1 ELSE -1 END)*(ex-t.entry_price)/t.entry_price,2);
   deduction:=CASE WHEN gross<0 THEN least(round(t.margin*t.risk_rate,2),greatest(0,t.margin-t.risk_loss)) ELSE 0 END;
   t.risk_loss:=t.risk_loss+deduction; t.last_risk_at:=tick;
   UPDATE fx_trades SET risk_loss=t.risk_loss,last_risk_at=tick WHERE id=t.id;
   IF deduction>0 THEN INSERT INTO fx_ledger(user_id,trade_id,event,amount,occurred_at) VALUES(t.user_id,t.id,'demo_risk',-deduction,tick) ON CONFLICT DO NOTHING; END IF;
   IF gross-t.risk_loss<=-t.margin THEN PERFORM fx_finish_demo(t.id,ex,gross,'stopout',tick); t.status:='closed'; END IF;
   steps:=steps+1;
  END LOOP;
  IF t.status='open' AND t.last_risk_at+make_interval(secs=>t.risk_interval)>_until THEN
   ex:=fx_exit(t.symbol,t.side,extract(epoch FROM _until)); gross:=round(t.amount*(CASE WHEN t.side='buy' THEN 1 ELSE -1 END)*(ex-t.entry_price)/t.entry_price,2);
   IF gross-t.risk_loss<=-t.margin THEN PERFORM fx_finish_demo(t.id,ex,gross,'stopout',_until); END IF;
  END IF;
  processed:=processed+1;
 END LOOP;
 RETURN processed;
END $$;
CREATE OR REPLACE FUNCTION public.fx_open_demo(_symbol text,_side text,_amount numeric) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE uid uuid:=auth.uid(); bal numeric; tid uuid; m numeric; r jsonb; entry numeric; stamp timestamptz:=clock_timestamp(); f numeric;
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'Account required'; END IF;
 IF _side NOT IN ('buy','sell') OR _amount IS NULL OR _amount<100 OR _amount>100000 OR _amount<>round(_amount,2) THEN RAISE EXCEPTION 'Invalid order'; END IF;
 IF (SELECT count(*) FROM fx_trades WHERE user_id=uid AND status='open')>=50 THEN RAISE EXCEPTION 'Maximum 50 open trades'; END IF;
 r:=fx_rules(); m:=round(_amount/10,2); entry:=fx_exit(_symbol,CASE WHEN _side='buy' THEN 'sell' ELSE 'buy' END,extract(epoch FROM stamp));
 f:=CASE WHEN _amount<=(r->>'feeThreshold')::numeric THEN (r->>'fixedFee')::numeric ELSE round(_amount*(r->>'feeRate')::numeric,2) END;
 INSERT INTO fx_wallets(user_id) VALUES(uid) ON CONFLICT DO NOTHING;
 SELECT demo_balance INTO bal FROM fx_wallets WHERE user_id=uid FOR UPDATE;
 IF bal<m THEN RAISE EXCEPTION 'Insufficient balance'; END IF;
 UPDATE fx_wallets SET demo_balance=demo_balance-m,updated_at=stamp WHERE user_id=uid;
 INSERT INTO fx_trades(user_id,mode,symbol,side,amount,margin,leverage,entry_price,opened_at,last_risk_at,risk_rate,risk_interval,risk_version,fee_estimate) VALUES(uid,'demo',_symbol,_side,_amount,m,10,entry,stamp,stamp,(r->>'lossRate')::numeric,(r->>'intervalSeconds')::integer,1,f) RETURNING id INTO tid;
 INSERT INTO fx_ledger(user_id,trade_id,event,amount,occurred_at) VALUES(uid,tid,'margin_reserved',-m,stamp);
 RETURN tid;
END $$;
CREATE OR REPLACE FUNCTION public.fx_close_demo(_trade uuid) RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE t fx_trades; ex numeric; gross numeric; stamp timestamptz:=clock_timestamp();
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Account required'; END IF;
 PERFORM fx_process_demo(auth.uid(),stamp);
 SELECT * INTO t FROM fx_trades WHERE id=_trade AND user_id=auth.uid() AND mode='demo' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Trade not found'; END IF;
 IF t.status='closed' THEN RETURN t.pnl; END IF;
 ex:=fx_exit(t.symbol,t.side,extract(epoch FROM stamp)); gross:=round(t.amount*(CASE WHEN t.side='buy' THEN 1 ELSE -1 END)*(ex-t.entry_price)/t.entry_price,2);
 RETURN fx_finish_demo(t.id,ex,gross,'manual',stamp);
END $$;
CREATE OR REPLACE FUNCTION public.fx_sync_demo() RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Account required'; END IF;
 RETURN fx_process_demo(auth.uid());
END $$;
CREATE OR REPLACE FUNCTION public.fx_reset_demo() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE uid uuid:=auth.uid(); t fx_trades; stamp timestamptz:=clock_timestamp(); oldbal numeric;
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'Account required'; END IF;
 FOR t IN SELECT * FROM fx_trades WHERE user_id=uid AND mode='demo' AND status='open' ORDER BY id FOR UPDATE LOOP
  PERFORM fx_finish_demo(t.id,fx_exit(t.symbol,t.side,extract(epoch FROM stamp)),0,'reset',stamp);
 END LOOP;
 INSERT INTO fx_wallets(user_id) VALUES(uid) ON CONFLICT DO NOTHING;
 SELECT demo_balance INTO oldbal FROM fx_wallets WHERE user_id=uid FOR UPDATE;
 UPDATE fx_wallets SET demo_balance=100000,updated_at=stamp WHERE user_id=uid;
 INSERT INTO fx_ledger(user_id,event,amount,occurred_at) VALUES(uid,'demo_reset',100000-oldbal,stamp);
END $$;
REVOKE ALL ON FUNCTION public.fx_finish_demo(uuid,numeric,numeric,text,timestamptz), public.fx_process_demo(uuid,timestamptz), public.fx_hash(bigint,bigint), public.fx_mid(text,double precision), public.fx_exit(text,text,double precision) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fx_process_demo(uuid,timestamptz), public.fx_mid(text,double precision), public.fx_exit(text,text,double precision) TO service_role;
REVOKE ALL ON FUNCTION public.fx_open_demo(text,text,numeric),public.fx_close_demo(uuid),public.fx_sync_demo(),public.fx_reset_demo() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.fx_open_demo(text,text,numeric),public.fx_close_demo(uuid),public.fx_sync_demo(),public.fx_reset_demo() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.fx_open_trade(uuid,text,text,text,numeric,integer,numeric),public.fx_close_trade(uuid,uuid,numeric,numeric,text) FROM PUBLIC,anon,authenticated;
COMMENT ON FUNCTION public.fx_open_trade(uuid,text,text,text,numeric,integer,numeric) IS 'DEPRECATED: app uses fx_open_demo. Real order execution requires a broker and parent wallet integration.';