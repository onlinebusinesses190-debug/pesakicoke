import { supabase } from "../../lib/supabase";
import { logger } from "../../utils/logger";
import { getEngine } from "../forex/marketEngine";
import { getInstrument } from "../forex/instruments";
import { debit, credit, getBalance } from "../../wallet/service";
import { BFX, type BfxAsset, type BfxDirection, type BfxMode, type BfxStatus } from "./config";

export interface BfxTrade {
  id: string;
  user_id: string;
  mode: BfxMode;
  asset: string;
  direction: BfxDirection;
  stake: number;
  payout_percentage: number;
  entry_price: number;
  expiry_price: number | null;
  opened_at: string;
  expires_at: string;
  settled_at: string | null;
  status: BfxStatus;
  profit: number;
  total_return: number;
  settlement_id: string | null;
}

export interface BfxOpenResult {
  success: true;
  trade: BfxTrade;
  entry_price: number;
  expires_at: string;
  new_balance: number;
}

export interface BfxSettleResult {
  success: true;
  status: BfxStatus;
  profit: number;
  total_return: number;
  new_balance: number;
  entry_price: number;
  exit_price: number;
  entry_time: string;
  exit_time: string;
  direction: BfxDirection;
  asset: string;
  stake: number;
  already_settled: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// PRICE CAPTURE — FULL PRECISION (NO ROUNDING)
// ═══════════════════════════════════════════════════════════════════════════
//
// Rounding here would destroy sub-pip price moves and make outcomes unfair.
// Example: EUR/USD at 4-digit precision turns 1.13379 → 1.1338, hiding the
// real movement the user sees on the chart.
//
// Round ONLY for display, never for comparison or storage.

function rawMid(asset: BfxAsset): number {
  const engine = getEngine();
  const quote = engine.quote(asset);
  return quote.mid;
}

export function entryPrice(asset: BfxAsset): number {
  return rawMid(asset);
}

function settlementId(tradeId: string): string {
  return `${BFX.SETTLEMENT_PREFIX}${tradeId}`;
}

// ═══════════════════════════════════════════════════════════════════════════
// OPEN TRADE
// ═══════════════════════════════════════════════════════════════════════════

export async function openTrade(
  userId: string,
  mode: BfxMode,
  asset: BfxAsset,
  direction: BfxDirection,
  stake: number,
  expirySeconds: number,
): Promise<BfxOpenResult | { success: false; error: string }> {
  if (!BFX.ASSETS.includes(asset)) return { success: false, error: "Asset not available" };
  if (!BFX.EXPIRIES.some((e) => e.seconds === expirySeconds)) {
    return { success: false, error: "Expiry not supported" };
  }
  if (stake < BFX.MIN_STAKE || stake > BFX.MAX_STAKE) {
    return {
      success: false,
      error: `Stake must be between KSh ${BFX.MIN_STAKE} and KSh ${BFX.MAX_STAKE}`,
    };
  }

  const balance = await getBalance(userId, mode);
  if (balance === null) return { success: false, error: "Could not read wallet balance" };
  if (balance < stake) return { success: false, error: "Insufficient balance" };

  const { count, error: countError } = await supabase
    .from("bfx_trades")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("status", "open");
  if (countError) {
    logger.error({ err: countError.message }, "BFX open trade count failed");
    return { success: false, error: "Could not verify open trades" };
  }
  if ((count ?? 0) >= BFX.MAX_OPEN) {
    return { success: false, error: `Maximum ${BFX.MAX_OPEN} open trades allowed` };
  }

  // ✅ FULL PRECISION entry price — never rounded.
  const entry = rawMid(asset);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + expirySeconds * 1000);

  const debitRes = await debit(userId, stake, mode, `Binary FX ${direction} on ${asset}`);
  if (!debitRes.success) {
    return { success: false, error: debitRes.error || "Failed to reserve stake" };
  }

  const { data: trade, error: insertError } = await supabase
    .from("bfx_trades")
    .insert({
      user_id: userId,
      mode,
      asset,
      direction,
      stake,
      payout_percentage: BFX.PAYOUT,
      entry_price: entry,
      opened_at: now.toISOString(),
      expires_at: expiresAt.toISOString(),
      status: "open",
    })
    .select("*")
    .single();

  if (insertError || !trade) {
    logger.error({ err: insertError?.message }, "BFX trade insert failed");
    await credit(userId, stake, mode, `Refund: Binary FX trade failed to save`);
    return { success: false, error: "Failed to create trade" };
  }

  logger.info(
    { tradeId: trade.id, userId, mode, asset, direction, stake, entry },
    "BFX trade opened",
  );
  return {
    success: true,
    trade: trade as BfxTrade,
    entry_price: entry,
    expires_at: expiresAt.toISOString(),
    new_balance: debitRes.newBalance ?? balance - stake,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// OUTCOME DECISION — STRICT, FULL PRECISION, EQUAL = LOSS
// ═══════════════════════════════════════════════════════════════════════════

// 1e-12 is only a floating-point guard — it will never flip a visible move.
const EPS = 1e-12;

export function determineOutcome(
  direction: BfxDirection,
  entryPrice: number,
  exitPrice: number,
): BfxStatus {
  if (direction === "up") {
    return exitPrice > entryPrice + EPS ? "win" : "loss";
  }
  return exitPrice < entryPrice - EPS ? "win" : "loss";
}

// ═══════════════════════════════════════════════════════════════════════════
// SETTLE TRADE — IDEMPOTENT, FAIR, AUDITABLE
// ═══════════════════════════════════════════════════════════════════════════

// 0.1% — tight enough to catch manipulation, wide enough for legitimate
// client/engine timing differences at small timeframes.
const CLIENT_PRICE_TOLERANCE = 0.001;

export async function settleTrade(
  tradeId: string,
  clientExitPrice?: number,
): Promise<BfxSettleResult | { success: false; error: string }> {
  const { data: trade, error: fetchError } = await supabase
    .from("bfx_trades")
    .select("*")
    .eq("id", tradeId)
    .maybeSingle();

  if (fetchError || !trade) return { success: false, error: "Trade not found" };

  // ─── Idempotency: already settled ────────────────────────────────────────
  if (trade.status !== "open") {
    return {
      success: true,
      status: trade.status as BfxStatus,
      profit: Number(trade.profit ?? 0),
      total_return: Number(trade.total_return ?? 0),
      new_balance: (await getBalance(trade.user_id, trade.mode as BfxMode)) ?? 0,
      entry_price: Number(trade.entry_price),
      exit_price: Number(trade.expiry_price ?? 0),
      entry_time: trade.opened_at,
      exit_time: trade.settled_at ?? new Date().toISOString(),
      direction: trade.direction as BfxDirection,
      asset: trade.asset,
      stake: Number(trade.stake),
      already_settled: true,
    };
  }

  // ─── Capture engine exit price at FULL PRECISION ─────────────────────────
  const engineExit = rawMid(trade.asset as BfxAsset);

  // ─── Client price sanity check ───────────────────────────────────────────
  let effectiveExit = engineExit;
  let clientAccepted = false;

  if (typeof clientExitPrice === "number" && isFinite(clientExitPrice)) {
    const denom = Math.abs(engineExit) || 1;
    const diff = Math.abs(engineExit - clientExitPrice) / denom;

    if (diff <= CLIENT_PRICE_TOLERANCE) {
      effectiveExit = clientExitPrice;
      clientAccepted = true;
      logger.info(
        { tradeId, engineExit, clientExitPrice, diff },
        "BFX settle: client price accepted (within tolerance)",
      );
    } else {
      logger.warn(
        { tradeId, engineExit, clientExitPrice, diff },
        "BFX settle: client price REJECTED (outside tolerance) — using engine price",
      );
    }
  }

  // ─── Decide outcome on FULL PRECISION values ─────────────────────────────
  const direction = trade.direction as BfxDirection;
  const entryPriceStored = Number(trade.entry_price);
  const outcome = determineOutcome(direction, entryPriceStored, effectiveExit);

  // ─── FAIRNESS AUDIT LOG — one line per settlement, always ────────────────
  logger.info(
    {
      tradeId,
      userId: trade.user_id,
      mode: trade.mode,
      asset: trade.asset,
      direction,
      stake: Number(trade.stake),
      entryPrice: entryPriceStored,
      exitPrice: effectiveExit,
      engineExit,
      clientExitPrice: clientExitPrice ?? null,
      clientAccepted,
      outcome,
    },
    "BFX settle decision",
  );

  const id = settlementId(tradeId);
  const now = new Date().toISOString();

  const stakeNum = Number(trade.stake);
  const winProfit = Number((stakeNum * BFX.PAYOUT).toFixed(2));
  const winTotalReturn = Number((stakeNum + winProfit).toFixed(2));

  // ─── Atomic DB update — status guard prevents double-settle ──────────────
  const { data: updated, error: updateError } = await supabase
    .from("bfx_trades")
    .update({
      status: outcome,
      expiry_price: effectiveExit,
      settled_at: now,
      profit: outcome === "win" ? winProfit : 0,
      total_return: outcome === "win" ? winTotalReturn : 0,
      settlement_id: id,
      updated_at: now,
    })
    .eq("id", tradeId)
    .eq("status", "open")
    .select("*")
    .single();

  // ─── Concurrent settle beat us — return the existing settled result ──────
  if (updateError || !updated) {
    const { data: existing } = await supabase
      .from("bfx_trades")
      .select("*")
      .eq("id", tradeId)
      .maybeSingle();

    if (!existing) {
      logger.error({ err: updateError?.message, tradeId }, "BFX settle update failed");
      return { success: false, error: "Failed to settle trade" };
    }

    return {
      success: true,
      status: existing.status as BfxStatus,
      profit: Number(existing.profit ?? 0),
      total_return: Number(existing.total_return ?? 0),
      new_balance: (await getBalance(existing.user_id, existing.mode as BfxMode)) ?? 0,
      entry_price: Number(existing.entry_price),
      exit_price: Number(existing.expiry_price ?? 0),
      entry_time: existing.opened_at,
      exit_time: existing.settled_at ?? now,
      direction: existing.direction as BfxDirection,
      asset: existing.asset,
      stake: Number(existing.stake),
      already_settled: true,
    };
  }

  // ─── Credit wallet on a win ──────────────────────────────────────────────
  let newBalance = (await getBalance(trade.user_id, trade.mode as BfxMode)) ?? 0;
  let profit = 0;
  let totalReturn = 0;

  if (outcome === "win") {
    profit = winProfit;
    totalReturn = winTotalReturn;

    const creditRes = await credit(
      trade.user_id,
      totalReturn,
      trade.mode as BfxMode,
      `Binary FX win on ${trade.asset}`,
    );

    if (!creditRes.success) {
      logger.error({ err: creditRes.error, tradeId }, "BFX win credit failed");
    } else {
      newBalance = creditRes.newBalance ?? newBalance;
    }
  }

  logger.info(
    { tradeId, outcome, profit, totalReturn, newBalance },
    "BFX trade settled",
  );

  return {
    success: true,
    status: outcome,
    profit,
    total_return: totalReturn,
    new_balance: newBalance,
    entry_price: entryPriceStored,
    exit_price: effectiveExit,
    entry_time: trade.opened_at,
    exit_time: now,
    direction,
    asset: trade.asset,
    stake: stakeNum,
    already_settled: false,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// LISTING
// ═══════════════════════════════════════════════════════════════════════════

export async function listOpen(userId: string): Promise<BfxTrade[]> {
  const { data, error } = await supabase
    .from("bfx_trades")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "open")
    .order("expires_at", { ascending: true });
  if (error) {
    logger.error({ err: error.message }, "BFX list open failed");
    return [];
  }
  return (data ?? []) as BfxTrade[];
}

export async function listSettled(userId: string, limit = 100): Promise<BfxTrade[]> {
  const { data, error } = await supabase
    .from("bfx_trades")
    .select("*")
    .eq("user_id", userId)
    .neq("status", "open")
    .order("settled_at", { ascending: false })
    .limit(limit);
  if (error) {
    logger.error({ err: error.message }, "BFX list settled failed");
    return [];
  }
  return (data ?? []) as BfxTrade[];
}
