-- PESAKI Forex — wallet reconciliation and settlement audit trail.
--
-- Purpose
-- -------
-- REAL forex money now moves through the PESAKI wallet: margin is locked in
-- `wallets.locked` when a position opens, and released with the realised P/L
-- applied when it closes. That is the correct relationship, but it leaves a gap:
-- the database had no record tying a position to the wallet movement it caused.
--
-- If a settlement failed midway — a released lock without a credit, or a debit
-- that could not be applied — there was nothing to reconcile against. This adds:
--
--   * `forex_wallet_settlements` — one row per wallet movement caused by forex,
--     recording the amount, direction and whether it completed. This is the audit
--     trail for reconciling `wallets` against `forex_positions`.
--   * An idempotency guard so a retried settlement cannot double-credit.
--
-- It also fixes a data-integrity issue: `forex_accounts.balance` drifted away
-- from `wallets.balance` for REAL accounts, because the order path never moved
-- real funds. REAL balance is now read from the wallet, and this backfills the
-- forex row so any legacy report reads the same number.
--
-- This is additive and safe to re-run.

begin;

-- ─── Settlement audit trail ──────────────────────────────────────────────────

create table if not exists public.forex_wallet_settlements (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  position_id    uuid references public.forex_positions(id) on delete set null,
  account_id     uuid references public.forex_accounts(id) on delete set null,
  -- What the movement was for. 'margin_reserve' locks funds, 'margin_release'
  -- returns them, 'pnl_credit' pays a profit, 'pnl_debit' charges a loss.
  kind           text not null
                   check (kind in ('margin_reserve','margin_release','pnl_credit','pnl_debit')),
  -- Always positive. `direction` carries the sign so the amount can be summed
  -- without relying on a signed column that might drift.
  amount         numeric(18,2) not null check (amount >= 0),
  direction      text not null check (direction in ('credit','debit')),
  -- False when the wallet refused or the call threw. These rows are exactly what
  -- an operator reconciles by hand, so they must be visible rather than dropped.
  completed      boolean not null default true,
  failure_reason text,
  -- Lets a retried settlement be recognised and skipped rather than applied twice.
  idempotency_key text unique,
  created_at     timestamptz not null default now(),
  metadata       jsonb not null default '{}'::jsonb
);

create index if not exists forex_wallet_settlements_user_idx
  on public.forex_wallet_settlements (user_id, created_at desc);

create index if not exists forex_wallet_settlements_pending_idx
  on public.forex_wallet_settlements (user_id)
  where completed = false;

alter table public.forex_wallet_settlements enable row level security;

-- The service role writes these; users read their own for statements.
create policy "users read own forex settlements"
  on public.forex_wallet_settlements for select
  using (auth.uid() = user_id);

-- ─── Reconciliation helper ──────────────────────────────────────────────────

-- Sum of completed wallet movements caused by forex for one user. Exposed so an
-- operator can confirm the forex side and the wallet side agree:
--
--   select forex_wallet_net(user_id) from public.forex_wallet_net('<uuid>');
--
-- Any row with completed = false is real money the platform owes the user and is
-- reported separately so it cannot be mistaken for a settled amount.
create or replace function public.forex_wallet_net(p_user_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'net_movement', round(coalesce(sum(
      case when s.direction = 'credit' then s.amount else -s.amount end
    ), 0), 2),
    'margin_reserved', round(coalesce(sum(s.amount) filter (where s.kind = 'margin_reserve'), 0), 2),
    'unsettled_count', count(*) filter (where s.completed = false)
  )
  from public.forex_wallet_settlements s
  where s.user_id = p_user_id;
$$;

revoke all on function public.forex_wallet_net(uuid) from public, anon, authenticated;
grant execute on function public.forex_wallet_net(uuid) to service_role;

-- ─── Backfill REAL forex rows from the wallet ────────────────────────────────
-- REAL balance is now read from `wallets`, so the forex row must not keep
-- claiming a stale figure. Mirroring the wallet here keeps any legacy report
-- honest without changing the wallet, which stays the source of truth.

update public.forex_accounts fa
   set balance = w.balance,
       updated_at = now()
  from public.wallets w
 where w.user_id = fa.user_id
   and fa.account_type = 'live';

commit;