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
}

const digitsFor = (asset: string): number => getInstrument(asset)?.digits ?? 4;

/** Resolve the authoritative entry price from the internal market engine. */
export function entryPrice(asset: BfxAsset): number {
  const engine = getEngine();
  const quote = engine.quote(asset);
  return roundToDigits(quote.mid, digitsFor(asset));
}

function roundToDigits(price: number, digits: number): number {
  const f = Math.pow(10, digits);
  return Math.round(price * f) / f;
}

function settlementId(tradeId: string): string {
  return `${BFX.SETTLEMENT_PREFIX}${tradeId}`;
}

/** Open a binary trade atomically. Deducts stake, inserts row, returns trade. */
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
    return { success: false, error: `Stake must be between KSh ${BFX.MIN_STAKE} and KSh ${BFX.MAX_STAKE}` };
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

  const entry = entryPrice(asset);
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

  logger.info({ tradeId: trade.id, userId, mode, asset, direction, stake, entry }, "BFX trade opened");
  return {
    success: true,
    trade: trade as BfxTrade,
    entry_price: entry,
    expires_at: expiresAt.toISOString(),
    new_balance: debitRes.newBalance ?? balance - stake,
  };
}

/** Determine the outcome of a binary trade from entry vs expiry price. */
export function determineOutcome(
  direction: BfxDirection,
  entryPrice: number,
  expiryPrice: number,
): BfxStatus {
  if (direction === "up" && expiryPrice > entryPrice) return "win";
  if (direction === "down" && expiryPrice < entryPrice) return "loss";
  if (expiryPrice === entryPrice) return BFX.TIE === "loss" ? "loss" : "tie";
  return "loss";
}

/**
 * Settle a binary trade idempotently.
 *
 * Safe to call repeatedly: a trade already settled returns immediately and
 * never credits the wallet twice. The expiry price comes from the internal
 * market engine, never from the frontend.
 */
export async function settleTrade(
  tradeId: string,
  expiryPrice?: number,
): Promise<BfxSettleResult | { success: false; error: string }> {
  const { data: trade, error: fetchError } = await supabase
    .from("bfx_trades")
    .select("*")
    .eq("id", tradeId)
    .maybeSingle();

  if (fetchError || !trade) return { success: false, error: "Trade not found" };
  if (trade.status !== "open") {
    return {
      success: true,
      status: trade.status as BfxStatus,
      profit: Number(trade.profit ?? 0),
      total_return: Number(trade.total_return ?? 0),
      new_balance: await getBalance(trade.user_id, trade.mode as BfxMode) ?? 0,
    };
  }

  const exit = expiryPrice ?? entryPrice(trade.asset as BfxAsset);
  const outcome = determineOutcome(trade.direction as BfxDirection, trade.entry_price, exit);

  let profit = 0;
  let totalReturn = 0;
  let newBalance = await getBalance(trade.user_id, trade.mode as BfxMode) ?? 0;

  if (outcome === "win") {
    profit = Number((trade.stake * BFX.PAYOUT).toFixed(2));
    totalReturn = Number((trade.stake + profit).toFixed(2));
    const creditRes = await credit(
      trade.user_id,
      totalReturn,
      trade.mode as BfxMode,
      `Binary FX win on ${trade.asset}`,
    );
    if (!creditRes.success) {
      logger.error({ err: creditRes.error, tradeId }, "BFX win credit failed");
      return { success: false, error: "Failed to credit win" };
    }
    newBalance = creditRes.newBalance ?? newBalance;
  } else {
    profit = 0;
    totalReturn = 0;
  }

  const id = settlementId(tradeId);
  const { error: updateError } = await supabase
    .from("bfx_trades")
    .update({
      status: outcome,
      expiry_price: exit,
      settled_at: new Date().toISOString(),
      profit,
      total_return: totalReturn,
      settlement_id: id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", tradeId)
    .eq("status", "open");

  if (updateError) {
    logger.error({ err: updateError.message, tradeId }, "BFX settle update failed");
    return { success: false, error: "Failed to settle trade" };
  }

  logger.info({ tradeId, outcome, profit, totalReturn, newBalance }, "BFX trade settled");
  return { success: true, status: outcome, profit, total_return: totalReturn, new_balance: newBalance };
}

/** Fetch a user's open binary trades, newest first. */
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

/** Fetch a user's settled binary trades, newest first. */
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