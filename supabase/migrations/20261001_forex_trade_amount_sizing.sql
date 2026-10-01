-- PESAKI Forex — trade-amount sizing and leverage-correct margin.
--
-- Why this migration exists
-- ------------------------
-- The first version of the module sized positions in standard lots and computed
-- margin as notional * leverage/100. Two defects followed:
--
--   1. Demo accounts were created with leverage = 1, so marginPercent was 100
--      and margin became the FULL notional (unlevered 1:1). A 0.10 lot EUR/USD
--      trade needed about KSh 1,468,623 against a KSh 100,000 demo balance, so
--      every order was rejected with INSUFFICIENT_MARGIN.
--
--   2. Lots cannot express a small KES allocation. One 0.01 lot of EUR/USD is
--      roughly KSh 14,700 of notional, so the product's KSh 100 minimum trade
--      amount was impossible to represent.
--
-- The fix keeps P/L lot-based and contract_size based (unchanged semantics) and
-- changes only sizing and margin:
--
--   * quantity columns gain precision so fractional lots survive the round trip
--   * margin = notional / leverage, the conventional definition
--   * leverage is stored as a plain multiplier (1 = 1:1, 10 = 10:1)
--
-- The server derives lots from a committed KES amount. Lots remain the stored
-- unit, so existing rows and every existing P/L expression stay valid.

begin;

-- ─── Precision ───────────────────────────────────────────────────────────────
-- quantity/filled_quantity are numeric(10,2), which rounds 0.0068 lots to 0.01
-- and would silently inflate a small trade. Widen before any sizing depends on it.

alter table public.forex_orders
  alter column quantity type numeric(24,8);

alter table public.forex_orders
  alter column filled_quantity type numeric(24,8);

alter table public.forex_positions
  alter column quantity type numeric(24,8);

alter table public.forex_fills
  alter column quantity type numeric(24,8);

-- leverage is now a plain multiplier, not a percent.
alter table public.forex_accounts
  alter column leverage type numeric(10,4);

comment on column public.forex_accounts.leverage is
  'Plain multiplier: 1 = unlevered 1:1, 10 = 10:1. Margin = notional / leverage.';

-- ─── Accounts created before this migration ──────────────────────────────────
-- Any account carrying the old 1:1 default stays valid, but a zero or absent
-- leverage would make margin divide by zero. Coerce to 1:1 (the safe, unlevered
-- reading) rather than guessing a product leverage on real accounts.

update public.forex_accounts
   set leverage = 1
 where leverage is null or leverage <= 0;

-- ─── margin = notional / leverage ────────────────────────────────────────────
-- Replaces the previous notional * leverage/100. Behaviour is identical for
-- leverage = 100 under the old encoding and for leverage = 1 under the new one,
-- so no position's margin is silently restated.

create or replace function public.forex_open_market_position(
  p_user_id          uuid,
  p_account_id       uuid,
  p_instrument_id    int,
  p_order_type       text,
  p_side             text,
  p_quantity         numeric,
  p_requested_price  numeric,
  p_executed_price   numeric,
  p_slippage         numeric,
  p_quote_to_kes     numeric,
  p_limit_price      numeric default null,
  p_trigger_price    numeric default null,
  p_stop_loss        numeric default null,
  p_take_profit      numeric default null,
  p_idempotency_key  text   default null,
  p_pending          boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_acct   public.forex_accounts%rowtype;
  v_spec   public.forex_instruments%rowtype;
  v_pending boolean;
  v_margin numeric(24,8);
  v_free   numeric(24,8);
  v_order_id uuid;
  v_pos_id   uuid;
begin
  select * into v_acct from public.forex_accounts
   where id = p_account_id and user_id = p_user_id
   for update;
  if not found then raise exception 'ACCOUNT_NOT_FOUND'; end if;
  if v_acct.status <> 'active' then raise exception 'ACCOUNT_NOT_ACTIVE'; end if;

  select * into v_spec from public.forex_instruments where id = p_instrument_id for share;
  if not found then raise exception 'INSTRUMENT_NOT_FOUND'; end if;
  if v_spec.trading_status <> 'open' then raise exception 'INSTRUMENT_CLOSED'; end if;
  if p_quantity <= 0 then raise exception 'INVALID_QUANTITY'; end if;

  v_pending := p_pending;

  -- A market order consumes margin immediately; a pending order reserves none
  -- until it actually triggers.
  if not v_pending then
    -- Convention fix: margin is a fraction of notional, and leverage is the
    -- multiplier it is divided by. Notional is never multiplied by leverage.
    v_margin := round(
      p_quantity * v_spec.contract_size * p_executed_price * p_quote_to_kes
      / greatest(coalesce(v_acct.leverage, 1), 1), 4);

    v_free := coalesce(v_acct.equity, 0) - coalesce(v_acct.used_margin, 0);
    if v_margin > v_free then
      raise exception 'INSUFFICIENT_MARGIN:%', v_margin;
    end if;
  else
    v_margin := 0;
  end if;

  insert into public.forex_orders (
    user_id, account_id, instrument_id, order_type, side, quantity,
    requested_price, limit_price, trigger_price, stop_loss, take_profit,
    status, filled_quantity, idempotency_key
  ) values (
    p_user_id, p_account_id, p_instrument_id, p_order_type, p_side, p_quantity,
    p_requested_price, p_limit_price, p_trigger_price, p_stop_loss, p_take_profit,
    case when v_pending then 'pending' else 'accepted' end,
    case when v_pending then 0 else p_quantity end,
    p_idempotency_key
  ) returning id into v_order_id;

  if not v_pending then
    insert into public.forex_positions (
      user_id, account_id, instrument_id, side, quantity,
      average_entry_price, current_price, stop_loss, take_profit, margin,
      quote_to_kes
    ) values (
      p_user_id, p_account_id, p_instrument_id, p_side, p_quantity,
      p_executed_price, p_executed_price, p_stop_loss, p_take_profit, v_margin,
      p_quote_to_kes
    ) returning id into v_pos_id;

    insert into public.forex_fills (
      order_id, position_id, user_id, quantity,
      requested_price, executed_price, slippage
    ) values (
      v_order_id, v_pos_id, p_user_id, p_quantity,
      p_requested_price, p_executed_price, p_slippage
    );

    update public.forex_orders
       set status = 'filled', updated_at = now()
     where id = v_order_id;
  end if;

  update public.forex_accounts
     set used_margin = round(coalesce(used_margin, 0) + v_margin, 4),
         updated_at = now()
   where id = p_account_id;

  return jsonb_build_object(
    'order_id', v_order_id,
    'position_id', case when v_pending then null else v_pos_id end,
    'margin', v_margin,
    'filled', not v_pending
  );
end;
$$;

revoke all on function public.forex_open_market_position(uuid,uuid,int,text,text,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,text,boolean)
  from public, anon, authenticated;
grant execute on function public.forex_open_market_position(uuid,uuid,int,text,text,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,text,boolean)
  to service_role;

commit;
