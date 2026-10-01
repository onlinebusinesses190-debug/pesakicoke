-- PESAKI Forex — orders, positions, fills and ledger.
--
-- Kept deliberately separate from the binary `fx_trades` prediction table:
-- ORDER (intent) -> FILL (execution) -> POSITION (held exposure) are distinct
-- objects, and realized P/L only lands in the ledger through a fill.
--
-- Demo and live accounts are separated by account_type so demo execution can
-- never touch real funds.

create extension if not exists "pgcrypto";

-- ─── Accounts ────────────────────────────────────────────────────────────────
create table if not exists public.forex_accounts (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  account_type      text not null default 'demo'
                      check (account_type in ('demo', 'live')),
  currency          text not null default 'KES',
  -- Deliberately NOT constrained to >= 0. A losing close, a swap charge or a
  -- forced margin call-out can legitimately drive a balance negative; blocking
  -- that would make the position impossible to close. Guard the write path in
  -- the service layer instead.
  balance           numeric(18,4) not null default 0,
  equity            numeric(18,4) not null default 0,
  used_margin       numeric(18,4) not null default 0 check (used_margin >= 0),
  leverage          numeric(8,2) not null default 1 check (leverage > 0),
  status            text not null default 'active'
                      check (status in ('pending_kyc','active','restricted','suspended','closed')),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (user_id, account_type)
);

comment on column public.forex_accounts.account_type is
  'demo uses simulated execution; live requires licensed execution provider';

-- ─── Instruments ─────────────────────────────────────────────────────────────
create table if not exists public.forex_instruments (
  id                serial primary key,
  symbol            text not null unique,
  base_currency     text not null,
  quote_currency    text not null,
  contract_size     numeric(18,2) not null default 100000,
  pip_size          numeric(18,10) not null default 0.0001,
  digits            int not null default 5,
  min_lot           numeric(10,2) not null default 0.01,
  max_lot           numeric(10,2) not null default 100,
  lot_step          numeric(10,2) not null default 0.01,
  typical_spread_pips numeric(6,2) not null default 1.0,
  trading_status    text not null default 'open'
                      check (trading_status in ('open','closed','halted')),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- ─── Orders (intent) ─────────────────────────────────────────────────────────
create table if not exists public.forex_orders (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  account_id        uuid not null references public.forex_accounts(id) on delete cascade,
  instrument_id     int not null references public.forex_instruments(id),
  order_type        text not null
                      check (order_type in ('market','limit','stop','stop_limit')),
  side              text not null check (side in ('buy','sell')),
  quantity          numeric(18,4) not null check (quantity > 0),
  requested_price   numeric(18,10),
  trigger_price     numeric(18,10),
  limit_price       numeric(18,10),
  stop_loss         numeric(18,10),
  take_profit       numeric(18,10),
  status            text not null default 'pending'
                      check (status in ('pending','submitted','accepted','triggered',
                                        'partially_filled','filled','cancelled',
                                        'rejected','expired','closed')),
  reject_reason     text,
  filled_quantity   numeric(18,4) not null default 0,
  idempotency_key   text,
  provider_order_id text,
  expires_at        timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create unique index if not exists forex_orders_idempotency_uniq
  on public.forex_orders (user_id, idempotency_key)
  where idempotency_key is not null;

create index if not exists forex_orders_user_idx  on public.forex_orders (user_id, created_at desc);
create index if not exists forex_orders_status_idx on public.forex_orders (status);
create index if not exists forex_orders_acct_idx   on public.forex_orders (account_id);

-- ─── Fills (execution) ───────────────────────────────────────────────────────
create table if not exists public.forex_fills (
  id                uuid primary key default gen_random_uuid(),
  order_id          uuid not null references public.forex_orders(id) on delete cascade,
  position_id       uuid, -- FK added after forex_positions exists
  user_id           uuid not null references auth.users(id) on delete cascade,
  quantity          numeric(18,4) not null check (quantity > 0),
  requested_price   numeric(18,10),
  executed_price    numeric(18,10) not null,
  slippage          numeric(18,10) not null default 0,
  commission        numeric(18,4) not null default 0,
  swap              numeric(18,4) not null default 0,
  provider_fill_id  text,
  executed_at       timestamptz not null default now()
);

create index if not exists forex_fills_order_idx    on public.forex_fills (order_id);
create index if not exists forex_fills_position_idx on public.forex_fills (position_id);
create index if not exists forex_fills_user_idx     on public.forex_fills (user_id, executed_at desc);

-- ─── Positions (held exposure) ───────────────────────────────────────────────
create table if not exists public.forex_positions (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  account_id          uuid not null references public.forex_accounts(id) on delete cascade,
  instrument_id       int not null references public.forex_instruments(id),
  side                text not null check (side in ('buy','sell')),
  quantity            numeric(18,4) not null check (quantity > 0),
  average_entry_price numeric(18,10) not null,
  current_price       numeric(18,10),
  stop_loss           numeric(18,10),
  take_profit         numeric(18,10),
realized_pnl         numeric(18,4) not null default 0,
  swap                 numeric(18,4) not null default 0,
  commission           numeric(18,4) not null default 0,
  margin               numeric(18,4) not null default 0,
  -- KES value of one unit of the quote currency when the position was opened.
  -- Snapshotted per position because the rate moves, and unrealised P/L must be
  -- converted with a rate, never added in raw quote currency.
  quote_to_kes         numeric(18,8),
  provider_position_id text,
  opened_at           timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  closed_at           timestamptz
);

create index if not exists forex_positions_open_idx
  on public.forex_positions (user_id) where closed_at is null;
create index if not exists forex_positions_acct_idx on public.forex_positions (account_id);

-- Deferred so fills can reference positions regardless of creation order.
alter table public.forex_fills
  add constraint forex_fills_position_fk
  foreign key (position_id) references public.forex_positions(id) on delete set null;

-- ─── Ledger ──────────────────────────────────────────────────────────────────
-- Every balance movement is recorded here; nothing changes a balance silently.
create table if not exists public.forex_transactions (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  account_id        uuid not null references public.forex_accounts(id) on delete cascade,
  position_id       uuid references public.forex_positions(id) on delete set null,
  order_id          uuid references public.forex_orders(id) on delete set null,
  type              text not null
                      check (type in ('deposit','withdrawal','realized_pnl','commission',
                                      'swap','adjustment','refund','reversal')),
  amount            numeric(18,4) not null,
  balance_after     numeric(18,4) not null,
  status            text not null default 'completed'
                      check (status in ('pending','processing','completed','failed',
                                        'reversed','cancelled')),
  reference         text,
  note              text,
  created_at        timestamptz not null default now()
);

create index if not exists forex_tx_user_idx   on public.forex_transactions (user_id, created_at desc);
create index if not exists forex_tx_acct_idx   on public.forex_transactions (account_id);
create index if not exists forex_tx_ref_idx    on public.forex_transactions (reference);

-- ─── Watchlists ──────────────────────────────────────────────────────────────
create table if not exists public.forex_watchlists (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null default 'My Forex',
  created_at  timestamptz not null default now()
);

create table if not exists public.forex_watchlist_items (
  watchlist_id uuid not null references public.forex_watchlists(id) on delete cascade,
  instrument_id int not null references public.forex_instruments(id) on delete cascade,
  sort_order   int not null default 0,
  primary key (watchlist_id, instrument_id)
);

-- ─── Alerts (evaluated server-side) ──────────────────────────────────────────
create table if not exists public.forex_alerts (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  instrument_id int references public.forex_instruments(id) on delete cascade,
  symbol       text not null,
  alert_type   text not null check (alert_type in ('price_above','price_below',
                                                   'pct_rise','pct_fall','spread_above')),
  threshold    numeric(18,10) not null,
  status       text not null default 'active' check (status in ('active','triggered','disabled')),
  triggered_at timestamptz,
  created_at   timestamptz not null default now()
);

create index if not exists forex_alerts_active_idx on public.forex_alerts (user_id, status);

-- ─── Row level security ──────────────────────────────────────────────────────
-- Users may only ever see and modify their own Forex data. Service-role
-- operations (settlement, admin) bypass RLS using backend-only credentials.
alter table public.forex_accounts       enable row level security;
alter table public.forex_orders         enable row level security;
alter table public.forex_fills          enable row level security;
alter table public.forex_positions      enable row level security;
alter table public.forex_transactions   enable row level security;
alter table public.forex_watchlists     enable row level security;
alter table public.forex_watchlist_items enable row level security;
alter table public.forex_alerts         enable row level security;

do $$
declare t text;
begin
  foreach t in array array[
    'forex_accounts','forex_orders','forex_fills','forex_positions',
    'forex_transactions','forex_alerts'
  ] loop
    execute format('drop policy if exists %I on public.%I', t || '_own', t);
    execute format(
      'create policy %I on public.%I for all using (auth.uid() = user_id) with check (auth.uid() = user_id)',
      t || '_own', t
    );
  end loop;
end $$;

-- Watchlists are owned indirectly through the parent row.
drop policy if exists forex_watchlists_own on public.forex_watchlists;
create policy forex_watchlists_own on public.forex_watchlists
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists forex_watchlist_items_own on public.forex_watchlist_items;
create policy forex_watchlist_items_own on public.forex_watchlist_items
  for all using (
    exists (select 1 from public.forex_watchlists w
            where w.id = watchlist_id and w.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.forex_watchlists w
            where w.id = watchlist_id and w.user_id = auth.uid())
  );

-- Instruments are public reference data, readable by any signed-in user.
alter table public.forex_instruments enable row level security;
drop policy if exists forex_instruments_read on public.forex_instruments;
create policy forex_instruments_read on public.forex_instruments
  for select using (true);

-- ─── Seed instruments ────────────────────────────────────────────────────────
insert into public.forex_instruments
  (symbol, base_currency, quote_currency, digits, pip_size, typical_spread_pips)
values
  ('EUR/USD','EUR','USD',5,0.0001,0.8),
  ('GBP/USD','GBP','USD',5,0.0001,1.0),
  ('USD/JPY','USD','JPY',3,0.01,0.9),
  ('USD/CHF','USD','CHF',5,0.0001,1.2),
  ('AUD/USD','AUD','USD',5,0.0001,0.9),
  ('USD/CAD','USD','CAD',5,0.0001,1.3),
  ('NZD/USD','NZD','USD',5,0.0001,1.4),
  ('EUR/GBP','EUR','GBP',5,0.0001,1.0),
  ('EUR/JPY','EUR','JPY',3,0.01,1.3),
  ('GBP/JPY','GBP','JPY',3,0.01,1.8)
on conflict (symbol) do update
  set digits = excluded.digits,
      pip_size = excluded.pip_size,
      typical_spread_pips = excluded.typical_spread_pips,
      updated_at = now();

-- ===========================================================================
-- ATOMIC EXECUTION
-- ===========================================================================
-- Opening and closing a position touch four rows: the order, the position, the
-- fill and the account balance/margin. Doing that as separate client calls lets
-- a failure midway leave a filled position with no margin reserved, or a
-- ledger row pointing at a position that was never written.
--
-- These functions do the whole unit of work in one transaction and take a row
-- lock on the account, so two concurrent orders cannot both pass the free
-- margin check against the same starting balance.
--
-- P/L is computed HERE from the stored entry price and instrument spec rather
-- than trusted from the caller, so a compromised or buggy client cannot credit
-- an arbitrary amount to a balance.
-- ===========================================================================

-- Unrealised P/L across an account's open positions, in KES.
--
-- Every term is converted with that position's snapshotted quote_to_kes. Adding
-- raw quote-currency moves together would be meaningless: a USD move and a JPY
-- move are different currencies and neither is the KES the account is held in.
create or replace function public.forex_account_upnl(p_account_id uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(round(sum(
           p.quantity * i.contract_size
           * (case when p.side = 'buy'
                   then coalesce(p.current_price, p.average_entry_price) - p.average_entry_price
                   else p.average_entry_price - coalesce(p.current_price, p.average_entry_price) end)
           * coalesce(p.quote_to_kes, 1)
         ), 4), 0)
    from public.forex_positions p
    join public.forex_instruments i on i.id = p.instrument_id
   where p.account_id = p_account_id
     and p.closed_at is null;
$$;

revoke all on function public.forex_account_upnl(uuid) from public, anon, authenticated;
grant execute on function public.forex_account_upnl(uuid) to service_role;

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
  p_idempotency_key  text default null,
  p_pending          boolean default false
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_acct     public.forex_accounts%rowtype;
  v_spec     public.forex_instruments%rowtype;
  v_order_id uuid;
  v_pos_id   uuid;
  v_margin   numeric(18,4) := 0;
  v_free     numeric(18,4);
begin
  -- Replay of an already-accepted submit returns the original order.
  if p_idempotency_key is not null then
    select id into v_order_id from public.forex_orders
     where user_id = p_user_id and idempotency_key = p_idempotency_key;
    if found then
      return jsonb_build_object('order_id', v_order_id, 'idempotent', true);
    end if;
  end if;

  -- Serialise on the account row: this is what stops a double-spend.
  select * into v_acct from public.forex_accounts
   where id = p_account_id and user_id = p_user_id
     for update;
  if not found then raise exception 'ACCOUNT_NOT_FOUND'; end if;
  if v_acct.status <> 'active' then raise exception 'ACCOUNT_NOT_ACTIVE'; end if;

  select * into v_spec from public.forex_instruments where id = p_instrument_id for share;
  if not found then raise exception 'INSTRUMENT_NOT_FOUND'; end if;
  if v_spec.trading_status <> 'open' then raise exception 'INSTRUMENT_CLOSED'; end if;
  if p_quantity <= 0 then raise exception 'INVALID_QUANTITY'; end if;

  -- A market order consumes margin immediately; a pending order reserves none
  -- until it actually triggers.
  if not p_pending then
    v_margin := round(
      p_quantity * v_spec.contract_size * p_executed_price * p_quote_to_kes
      * (coalesce(v_acct.leverage, 1) / 100), 4);

    v_free := coalesce(v_acct.equity, 0) - coalesce(v_acct.used_margin, 0);
    if v_margin > v_free then
      raise exception 'INSUFFICIENT_MARGIN:%', v_margin;
    end if;
  end if;

  insert into public.forex_orders (
    user_id, account_id, instrument_id, order_type, side, quantity,
    requested_price, limit_price, trigger_price, stop_loss, take_profit,
    status, filled_quantity, idempotency_key
  ) values (
    p_user_id, p_account_id, p_instrument_id, p_order_type, p_side, p_quantity,
    p_requested_price, p_limit_price, p_trigger_price, p_stop_loss, p_take_profit,
    case when p_pending then 'pending' else 'accepted' end,
    case when p_pending then 0 else p_quantity end,
    p_idempotency_key
  ) returning id into v_order_id;

  if not p_pending then
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

    update public.forex_accounts
       set used_margin = coalesce(used_margin, 0) + v_margin,
           -- Keep existing unrealised P/L: overwriting equity with the bare
           -- balance would silently zero out every other open position.
           equity = coalesce(balance, 0) + public.forex_account_upnl(p_account_id),
           updated_at = now()
     where id = p_account_id;
  end if;

  return jsonb_build_object(
    'order_id', v_order_id,
    'position_id', v_pos_id,
    'margin', v_margin,
    'idempotent', false
  );
end;
$$;

create or replace function public.forex_close_position(
  p_user_id       uuid,
  p_position_id   uuid,
  p_close_lots    numeric,
  p_exit_price    numeric,
  p_quote_to_kes  numeric
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_acct     public.forex_accounts%rowtype;
  v_pos      public.forex_positions%rowtype;
  v_spec     public.forex_instruments%rowtype;
  v_remaining numeric(18,4);
  v_pnl      numeric(18,4);
  v_delta    numeric;
  v_released numeric(18,4);
  v_full     boolean;
  v_balance  numeric(18,4);
begin
  select * into v_pos from public.forex_positions
   where id = p_position_id and user_id = p_user_id
     for update;
  if not found then raise exception 'POSITION_NOT_FOUND'; end if;
  if v_pos.closed_at is not null then raise exception 'POSITION_ALREADY_CLOSED'; end if;

  select * into v_acct from public.forex_accounts
   where id = v_pos.account_id and user_id = p_user_id
     for update;
  if not found then raise exception 'ACCOUNT_NOT_FOUND'; end if;

  select * into v_spec from public.forex_instruments where id = v_pos.instrument_id;

  v_remaining := v_pos.quantity - coalesce(p_close_lots, v_pos.quantity);
  if v_remaining < 0 then raise exception 'OVER_CLOSE'; end if;
  v_full := v_remaining = 0;

  -- P/L derived here, never taken from the caller.
  v_delta := case when v_pos.side = 'buy'
                   then p_exit_price - v_pos.average_entry_price
                   else v_pos.average_entry_price - p_exit_price end;
  v_pnl := round(coalesce(p_close_lots, v_pos.quantity) * v_spec.contract_size
                 * v_delta * p_quote_to_kes, 4);

  v_released := case when v_full then coalesce(v_pos.margin, 0)
                     else round(coalesce(v_pos.margin, 0)
                                * coalesce(p_close_lots, v_pos.quantity) / v_pos.quantity, 4)
                end;

  v_balance := round(coalesce(v_acct.balance, 0) + v_pnl, 4);

  update public.forex_positions
     set quantity = v_remaining,
         realized_pnl = round(coalesce(realized_pnl, 0) + v_pnl, 4),
         closed_at = case when v_full then now() else null end,
         updated_at = now()
   where id = p_position_id;

  insert into public.forex_transactions (
    user_id, account_id, position_id, order_id, type,
    amount, balance_after, status, reference, note
  ) values (
    p_user_id, v_pos.account_id, p_position_id, null, 'realized_pnl',
    v_pnl, v_balance, 'completed',
    case when v_full then 'close' else 'partial_close' end,
    v_spec.symbol || ' ' || v_pos.side || ' ' || coalesce(p_close_lots, v_pos.quantity)
      || ' lots @ ' || p_exit_price
  );

  update public.forex_accounts
     set balance = v_balance,
         equity = v_balance + public.forex_account_upnl(v_pos.account_id),
         used_margin = greatest(0, coalesce(used_margin, 0) - v_released),
         updated_at = now()
   where id = v_pos.account_id;

  return jsonb_build_object(
    'position_id', p_position_id,
    'realized_pnl', v_pnl,
    'balance', v_balance,
    'remaining', v_remaining,
    'closed', v_full,
    'released_margin', v_released
  );
end;
$$;

-- Callable only by the backend's service-role key. Revoking from PUBLIC removes
-- the default EXECUTE grant, so the service role is granted explicitly —
-- otherwise the API would lose access to its own execution functions.
revoke all on function public.forex_open_market_position(uuid,uuid,int,text,text,
  numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,text,boolean)
  from public, anon, authenticated;
grant execute on function public.forex_open_market_position(uuid,uuid,int,text,text,
  numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,text,boolean)
  to service_role;

revoke all on function public.forex_close_position(uuid,uuid,numeric,numeric,numeric)
  from public, anon, authenticated;
grant execute on function public.forex_close_position(uuid,uuid,numeric,numeric,numeric)
  to service_role;

-- Recalculate equity from live open positions. Call after marking positions to
-- market, or from a scheduled job.
create or replace function public.forex_recalculate_equity(p_account_id uuid)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare v_balance numeric(18,4); v_equity numeric(18,4);
begin
  select balance into v_balance from public.forex_accounts where id = p_account_id for update;

  -- current_price is maintained by the server when it marks positions to market;
  -- entry price is the zero-P/L fallback. Conversion to KES happens inside the
  -- helper using each position's snapshotted rate.
  v_equity := round(v_balance + public.forex_account_upnl(p_account_id), 4);

  update public.forex_accounts
     set equity = v_equity, updated_at = now()
   where id = p_account_id;
  return v_equity;
end;
$$;

revoke all on function public.forex_recalculate_equity(uuid) from public, anon, authenticated;
grant execute on function public.forex_recalculate_equity(uuid) to service_role;
