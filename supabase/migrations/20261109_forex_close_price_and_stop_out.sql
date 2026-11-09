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
