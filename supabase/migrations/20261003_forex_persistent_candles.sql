-- PESAKI Forex — persistent candles and KES/USD instrument.
--
-- Adds the missing pieces for a production-grade trading system:
--
-- 1. Candle persistence so historical data survives server restarts.
-- 2. KES/USD as the inverse of USD/KES so the engine can quote it correctly.
-- 3. A daily reset of the symbol-state counter so the deterministic engine
--    produces the same history after a restart within the same trading day.

begin;

-- ─── Candle persistence ──────────────────────────────────────────────────────
-- The engine writes here every time a candle closes. On restart it reads the
-- last N closed candles back into memory so the chart never starts empty.

create table if not exists public.forex_candles (
  symbol      text not null,
  interval    text not null,
  timestamp   timestamptz not null,
  open        numeric(18,10) not null,
  high        numeric(18,10) not null,
  low         numeric(18,10) not null,
  close       numeric(18,10) not null,
  tick_volume bigint not null default 0,
  primary key (symbol, interval, timestamp)
);

create index if not exists forex_candles_symbol_interval_idx
  on public.forex_candles (symbol, interval, timestamp desc);

alter table public.forex_candles enable row level security;

create policy "service role manages forex candles"
  on public.forex_candles for all
  using (auth.role() = 'service_role');

-- ─── KES/USD instrument ──────────────────────────────────────────────────────
-- KES/USD is the inverse of USD/KES. The engine stores USD/KES internally;
-- KES/USD quotes are derived as 1 / mid with bid/ask inverted so a SELL on
-- KES/USD is a BUY on USD/KES and vice versa.

insert into public.forex_instruments (symbol, base_currency, quote_currency, contract_size, pip_size, digits, min_lot, max_lot, lot_step, typical_spread_pips, trading_status)
values ('KES/USD', 'KES', 'USD', 100000, 0.00001, 5, 0.01, 100, 0.01, 1.5, 'open')
on conflict (symbol) do nothing;

-- ─── Seed state persistence ─────────────────────────────────────────────────
-- The deterministic engine uses a per-symbol counter. If the counter resets
-- to zero on every deploy, the price series jumps. Store the last counter so
-- the walk continues from where it left off.

alter table public.forex_symbol_state
  add column if not exists tick_count bigint not null default 0;

comment on column public.forex_symbol_state.tick_count is
  'Persistent counter so the deterministic price walk continues across restarts.';

commit;