/**
 * PESAKI Forex — settlement bridge to the existing PESAKI wallet.
 *
 * PESAKI already has a wallet with real and demo balances, atomic debit/credit
 * and a locked-funds concept. Forex must not grow a second, drifting balance,
 * so:
 *
 * - DEMO settles entirely inside `forex_*`. It is virtual money and must never
 *   touch the user's real wallet under any circumstance.
 * - REAL reserves margin from the real wallet by locking funds, and on close it
 *   releases that lock and applies the realised P/L to the wallet. The wallet
 *   stays the single source of truth for what the user actually owns.
 *
 * This is the boundary where user funds move, so it fails closed: if the wallet
 * refuses a reservation the order does not open, and if settlement fails the
 * error is surfaced rather than swallowed.
 */

import { supabase } from "../../lib/supabase";
import { logger } from "../../utils/logger";
import { credit, debit, getBalance, releaseLockedFunds, reserveLockedFunds } from "../../wallet/service";

export type AccountMode = "demo" | "live";

export interface WalletView {
  /** Funds available to open new positions. */
  available: number;
  /** Currently reserved as margin. */
  locked: number;
}

/**
 * Funds a user can trade with in the given mode.
 *
 * DEMO reads the Forex demo account; REAL reads the PESAKI wallet, subtracting
 * anything already locked by other subsystems so a Forex margin reservation can
 * never overcommit funds that a withdrawal or another product is holding.
 */
/**
 * Record a wallet movement caused by forex.
 *
 * Written even when the movement fails, because a failed settlement is real money
 * the platform still owes the user and must be reconcilable. The idempotency key
 * means a retried settlement is recognised rather than applied twice.
 */
async function recordSettlement(params: {
  userId: string;
  kind: "margin_reserve" | "margin_release" | "pnl_credit" | "pnl_debit";
  amount: number;
  direction: "credit" | "debit";
  completed: boolean;
  failureReason?: string;
  idempotencyKey: string;
  positionId?: string;
  accountId?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    await supabase.from("forex_wallet_settlements").insert({
      user_id: params.userId,
      position_id: params.positionId ?? null,
      account_id: params.accountId ?? null,
      kind: params.kind,
      amount: Math.abs(Number(params.amount.toFixed(2))),
      direction: params.direction,
      completed: params.completed,
      failure_reason: params.failureReason ?? null,
      idempotency_key: params.idempotencyKey,
      metadata: params.metadata ?? {},
    });
  } catch (err) {
    // Never let the audit write break a trade. It is logged so the gap is visible.
    logger.error({ err, userId: params.userId }, "Could not record forex settlement audit row");
  }
}

export async function getAvailable(userId: string, mode: AccountMode): Promise<WalletView> {
  if (mode === "demo") {
    const { data } = await supabase
      .from("forex_accounts")
      .select("balance, used_margin")
      .eq("user_id", userId)
      .eq("account_type", "demo")
      .maybeSingle();
    const balance = Number(data?.balance ?? 0);
    const used = Number(data?.used_margin ?? 0);
    return { available: Math.max(0, balance - used), locked: used };
  }

  const { data: wallet } = await supabase
    .from("wallets")
    .select("balance, locked")
    .eq("user_id", userId)
    .maybeSingle();

  const balance = Number(wallet?.balance ?? 0);
  const locked = Number(wallet?.locked ?? 0);
  return { available: Math.max(0, balance - locked), locked };
}

/** Balance only, for display. */
export async function getBalanceFor(userId: string, mode: AccountMode): Promise<number> {
  if (mode === "live") {
    return (await getBalance(userId, "real")) ?? 0;
  }
  const { data } = await supabase
    .from("forex_accounts")
    .select("balance")
    .eq("user_id", userId)
    .eq("account_type", "demo")
    .maybeSingle();
  return Number(data?.balance ?? 0);
}

/**
 * Reserve margin for a real position.
 *
 * Locks funds in the wallet rather than moving them, so an open position holds
 * collateral without the balance appearing to vanish. Returns false when the
 * wallet refuses, and the caller must not open the position.
 */
export async function reserveMargin(
  userId: string,
  mode: AccountMode,
  margin: number,
  reference: string,
): Promise<{ ok: boolean; reason?: string }> {
  if (mode === "demo") return { ok: true };

  const available = await getAvailable(userId, "live");
  if (margin > available.available) {
    return {
      ok: false,
      reason: `Insufficient funds. You need KSh ${margin.toFixed(2)} but only KSh ${available.available.toFixed(2)} is available.`,
    };
  }

  const result = await reserveLockedFunds(userId, margin);
  if (!result.success) {
    logger.error({ userId, margin, reference, err: result.error }, "Forex margin reservation failed");
    await recordSettlement({
      userId,
      kind: "margin_reserve",
      amount: margin,
      direction: "debit",
      completed: false,
      failureReason: result.error ?? "Could not reserve margin",
      idempotencyKey: `reserve:${reference}`,
    });
    return { ok: false, reason: result.error ?? "Could not reserve margin" };
  }

  await recordSettlement({
    userId,
    kind: "margin_reserve",
    amount: margin,
    direction: "debit",
    completed: true,
    idempotencyKey: `reserve:${reference}`,
  });

  logger.info({ userId, margin, reference }, "Forex margin reserved from wallet");
  return { ok: true };
}

/**
 * Settle a closed real position.
 *
 * The margin lock is released back to balance and the realised P/L is applied on
 * top. A loss is debited; a profit is credited. Margin is released in full
 * first so the user is never left holding collateral for a trade that is gone.
 */
export async function settleReal(
  userId: string,
  margin: number,
  pnl: number,
  reference: string,
): Promise<{ ok: boolean; reason?: string }> {
  try {
    if (margin > 0) {
      await releaseLockedFunds(userId, margin, true);
      await recordSettlement({
        userId,
        kind: "margin_release",
        amount: margin,
        direction: "credit",
        completed: true,
        idempotencyKey: `release:${reference}`,
      });
    }

    if (pnl > 0) {
      const r = await credit(userId, pnl, "real", `Forex profit ${reference}`);
      await recordSettlement({
        userId,
        kind: "pnl_credit",
        amount: pnl,
        direction: "credit",
        completed: r.success,
        failureReason: r.success ? undefined : (r.error ?? "Could not credit profit"),
        idempotencyKey: `pnl_credit:${reference}`,
      });
      if (!r.success) return { ok: false, reason: r.error ?? "Could not credit profit" };
    } else if (pnl < 0) {
      const r = await debit(userId, Math.abs(pnl), "real", `Forex loss ${reference}`);
      await recordSettlement({
        userId,
        kind: "pnl_debit",
        amount: Math.abs(pnl),
        direction: "debit",
        completed: r.success,
        failureReason: r.success ? undefined : (r.error ?? "Could not debit loss"),
        idempotencyKey: `pnl_debit:${reference}`,
      });
      // A debit failure here is serious: the loss is real even if the wallet
      // cannot take it. Surface it so it can be reconciled rather than
      // pretending the position settled cleanly.
      if (!r.success) {
        logger.error(
          { userId, pnl, reference, err: r.error },
          "Forex realised loss could not be debited — needs reconciliation",
        );
        return { ok: false, reason: r.error ?? "Could not debit loss" };
      }
    }

    logger.info({ userId, margin, pnl, reference }, "Forex position settled against wallet");
    return { ok: true };
  } catch (err) {
    logger.error({ err: (err as Error).message, userId, reference }, "Forex settlement threw");
    return { ok: false, reason: "Settlement failed" };
  }
}