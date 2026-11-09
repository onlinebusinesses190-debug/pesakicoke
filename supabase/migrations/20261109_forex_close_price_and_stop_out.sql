-- Add closing_price column to forex_positions for recording the exit price at close.
alter table public.forex_positions
  add column if not exists closing_price numeric(18,10);

-- Ensure close_reason accepts 'stop_out' (liquidation) in addition to existing values.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_name = 'forex_positions' and column_name = 'close_reason'
  ) then
    alter table public.forex_positions
      drop constraint if exists forex_positions_close_reason_check;
    alter table public.forex_positions
      add constraint forex_positions_close_reason_check
        check (close_reason in ('manual','stop_loss','take_profit','stop_out','liquidation','reset'));
  end if;
end $$;

-- Idempotency tracking for close operations.
create table if not exists public.forex_close_idempotency (
  idempotency_key text primary key,
  position_id uuid not null,
  user_id uuid not null,
  result jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists forex_close_idempotency_pos_idx on public.forex_close_idempotency(position_id);
create index if not exists forex_close_idempotency_user_idx on public.forex_close_idempotency(user_id);

-- Transactional close function: performs position close, account update, fee
-- recording, and wallet settlement atomically. Returns the settlement result.
create or replace function public.forex_close_position_txn(
  p_position_id uuid,
  p_user_id uuid,
  p_close_lots numeric,
  p_exit_price numeric,
  p_quote_to_kes numeric,
  p_close_reason text,
  p_idempotency_key text
) returns jsonb language plpgsql as $$
declare
  v_position record;
  v_account record;
  v_instrument record;
  v_spec_contract integer := 10000;
  v_open_fee_usd numeric := 0.02;
  v_close_fee_usd numeric := 0.02;
  v_realized_pnl_usd numeric;
  v_net_pnl_usd numeric;
  v_net_pnl_kes numeric;
  v_new_balance_kes numeric;
  v_new_margin_kes numeric;
  v_released_margin numeric;
  v_existing jsonb;
begin
  -- Idempotency: if this close was already processed, return cached result.
  select result into v_existing
  from public.forex_close_idempotency
  where idempotency_key = p_idempotency_key;

  if v_existing is not null then
    return v_existing;
  end if;

  -- Fetch and lock the position.
  select * into v_position
  from public.forex_positions
  where id = p_position_id and user_id = p_user_id
  for update;

  if not found then
    return jsonb_build_object('success', false, 'error', 'Position not found');
  end if;

  if v_position.closed_at is not null then
    return jsonb_build_object('success', true, 'already_closed', true,
      'realized_pnl_usd', coalesce(v_position.realized_pnl, 0),
      'exit_price', coalesce(v_position.closing_price, v_position.average_entry_price));
  end if;

  select * into v_account
  from public.forex_accounts
  where id = v_position.account_id
  for update;

  if not found then
    return jsonb_build_object('success', false, 'error', 'Account not found');
  end if;

  select * into v_instrument
  from public.forex_instruments
  where id = v_position.instrument_id;

  if not found then
    return jsonb_build_object('success', false, 'error', 'Instrument not found');
  end if;

  -- Recompute P/L from stored entry price.
  if v_position.side = 'buy' then
    v_realized_pnl_usd := p_close_lots * v_spec_contract * (p_exit_price - v_position.average_entry_price);
  else
    v_realized_pnl_usd := p_close_lots * v_spec_contract * (v_position.average_entry_price - p_exit_price);
  end if;

  v_net_pnl_usd := round(v_realized_pnl_usd - v_open_fee_usd - v_close_fee_usd, 4);
  v_net_pnl_kes := round(v_net_pnl_usd * p_quote_to_kes, 4);

  v_released_margin := case
    when p_close_lots >= v_position.quantity - 0.001 then coalesce(v_position.margin, 0)
    else round(coalesce(v_position.margin, 0) * p_close_lots / v_position.quantity, 4)
  end;

  v_new_balance_kes := round(coalesce(v_account.balance, 0) + v_net_pnl_kes, 4);
  v_new_margin_kes := greatest(0, round(coalesce(v_account.used_margin, 0) - v_released_margin, 4));

  -- Update position.
  update public.forex_positions
  set quantity = case
    when p_close_lots >= v_position.quantity - 0.001 then 0
    else round(v_position.quantity - p_close_lots, 4)
  end,
      realized_pnl = round(coalesce(v_position.realized_pnl, 0) + v_realized_pnl_usd, 4),
      closing_price = p_exit_price,
      close_reason = p_close_reason,
      closed_at = case
        when p_close_lots >= v_position.quantity - 0.001 then now()
        else null
      end,
      updated_at = now()
  where id = p_position_id;

  -- Update account.
  update public.forex_accounts
  set balance = v_new_balance_kes,
      used_margin = v_new_margin_kes,
      updated_at = now()
  where id = v_position.account_id;

  -- Record transaction lines.
  insert into public.forex_transactions (
    user_id, account_id, position_id, type, amount, balance_after,
    status, reference, note, created_at
  ) values
    (p_user_id, v_position.account_id, p_position_id, 'realized_pnl',
     round(v_realized_pnl_usd * p_quote_to_kes, 4), v_new_balance_kes,
     'completed', 'close', format('%s %s %s lots @ %s', v_instrument.symbol, v_position.side, p_close_lots, p_exit_price),
     now()),
    (p_user_id, v_position.account_id, p_position_id, 'commission',
     round(v_open_fee_usd * p_quote_to_kes, 4), v_new_balance_kes,
     'completed', format('open-fee:%s', p_position_id),
     format('Opening commission %s %s', v_instrument.symbol, v_position.side),
     now()),
    (p_user_id, v_position.account_id, p_position_id, 'commission',
     round(-v_close_fee_usd * p_quote_to_kes, 4), v_new_balance_kes,
     'completed', format('close-fee:%s', p_position_id),
     format('Closing commission %s %s', v_instrument.symbol, v_position.side),
     now());

  -- Record idempotency.
  insert into public.forex_close_idempotency (idempotency_key, position_id, user_id, result)
  values (p_idempotency_key, p_position_id, p_user_id,
    jsonb_build_object(
      'success', true,
      'positionId', p_position_id,
      'side', v_position.side,
      'lots', p_close_lots,
      'exitPrice', p_exit_price,
      'realizedPnlUsd', round(v_realized_pnl_usd, 4),
      'realizedPnlKes', v_net_pnl_kes,
      'openingFeeUsd', v_open_fee_usd,
      'closingFeeUsd', v_close_fee_usd,
      'netPnlUsd', v_net_pnl_usd,
      'releasedMargin', v_released_margin,
      'accountBalanceKes', v_new_balance_kes,
      'usedMargin', v_new_margin_kes,
      'fullClose', p_close_lots >= v_position.quantity - 0.001
    ));

  return jsonb_build_object(
    'success', true,
    'positionId', p_position_id,
    'side', v_position.side,
    'lots', p_close_lots,
    'exitPrice', p_exit_price,
    'realizedPnlUsd', round(v_realized_pnl_usd, 4),
    'realizedPnlKes', v_net_pnl_kes,
    'openingFeeUsd', v_open_fee_usd,
    'closingFeeUsd', v_close_fee_usd,
    'netPnlUsd', v_net_pnl_usd,
    'releasedMargin', v_released_margin,
    'accountBalanceKes', v_new_balance_kes,
    'usedMargin', v_new_margin_kes,
    'fullClose', p_close_lots >= v_position.quantity - 0.001
  );
end;
$$;
