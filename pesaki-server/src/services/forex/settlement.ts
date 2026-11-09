/**
 * PESAKI Forex — authoritative position close / settlement logic.
 *
 * Both the HTTP close endpoint and the server-side SL/TP / stop-out monitor
 * route through this single function so every closure uses identical pricing,
 * fee and wallet-settlement semantics. It never trusts a client-supplied P/L;
 * everything is recomputed from the stored entry price, direction, size and the
 * engine's live executable quote at close time.
 */

import { supabase } from "../../lib/supabase";
import { logger } from "../../utils/logger";
import { getEngine } from "./marketEngine";
import { getInstrument, type InstrumentSpec } from "./instruments";
import { settlementLegs } from "./risk";
import { kesPerUnit } from "./kesRates";
import { settleReal } from "./walletBridge";

export const PESAKI_CONTRACT_SIZE = 10000;
export const OPEN_FEE_USD = Number(process.env.PESAKI_FX_OPEN_FEE_USD ?? "0.02");
export const CLOSE_FEE_USD = Number(process.env.PESAKI_FX_CLOSE_FEE_USD ?? "0.02");

export interface CloseInput {
  positionId: string;
  userId: string;
  lots?: number; // undefined = full close
  reason?: "manual" | "stop_loss" | "take_profit" | "stop_out";
}

interface CloseResult {
  success: boolean;
  positionId: string;
  side: string;
  lots: number;
  exitPrice: number;
  realizedPnlUsd: number;
  realizedPnlKes: number;
  openingFeeUsd: number;
  closingFeeUsd: number;
  netPnlUsd: number;
  releasedMargin: number;
  accountBalanceKes: number;
  usedMargin: number;
  fullClose: boolean;
}

/** Authoritative close. Returns the settled result; caller persists it. */
export async function closePosition(input: CloseInput): Promise<CloseResult> {
  const { positionId, userId, lots: lotsToClose, reason = "manual" } = input;

  const { data: position, error: posErr } = await supabase
    .from("forex_positions")
    .select("*")
    .eq("id", positionId)
    .eq("user_id", userId)
    .maybeSingle();
  if (posErr) throw posErr;
  if (!position) throw new Error("Position not found");
  if (position.closed_at) {
    throw new Error("Position already closed");
  }

  const sym = await symbolForInstrument(position.instrument_id);
  if (!sym) throw new Error("Unknown instrument");
  const baseSpec = getInstrument(sym);
  if (!baseSpec) throw new Error("Unknown instrument");
  const spec: InstrumentSpec = { ...baseSpec, contractSize: PESAKI_CONTRACT_SIZE };

  const remaining = Number(position.quantity);
  if (!remaining || remaining <= 0) throw new Error("Position quantity is invalid or zero");

  let fraction = 1;
  if (lotsToClose) {
    fraction = lotsToClose / remaining;
    if (fraction <= 0 || fraction > 1) throw new Error("Invalid close size");
  }
  const closeLots = Number((remaining * fraction).toFixed(2));
  if (closeLots <= 0) throw new Error("Close amount must be > 0");
  const full = closeLots >= remaining - 1e-9;

  const quote = getEngine().quote(spec.symbol);
  const exitPrice = position.side === "buy" ? quote.bid : quote.ask;
  const q2k = kesPerUnit(spec.quote);

  // Recompute P/L from stored entry — never trust client P/L.
  const delta = position.side === "buy" ? exitPrice - Number(position.average_entry_price)
    : Number(position.average_entry_price) - exitPrice;
  const realizedPnlUsd = closeLots * spec.contractSize * delta;

  const openingFeeUsd = OPEN_FEE_USD;
  const closingFeeUsd = CLOSE_FEE_USD;
  const netPnlUsd = round(realizedPnlUsd - openingFeeUsd - closingFeeUsd, 4);

  const releasedMargin = full
    ? Number(position.margin ?? 0)
    : round(Number(position.margin ?? 0) * closeLots / remaining, 4);

  // Persist position close / partial-close.
  const { error: updateErr } = await supabase
    .from("forex_positions")
    .update({
      quantity: full ? 0 : round(remaining - closeLots, 4),
      realized_pnl: round(Number(position.realized_pnl ?? 0) + realizedPnlUsd, 4),
      closing_price: exitPrice,
      close_reason: reason,
      closed_at: full ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", positionId);
  if (updateErr) throw updateErr;

  // Record commission fees as transactions.
  const acctId = position.account_id;
  const { data: acctRow } = await supabase
    .from("forex_accounts")
    .select("balance, used_margin")
    .eq("id", acctId)
    .maybeSingle();
  const curBalanceKes = Number(acctRow?.balance ?? 0);
  const curMarginKes = Number(acctRow?.used_margin ?? 0);

  const netPnlKes = round(netPnlUsd * q2k, 4);
  const newBalanceKes = round(curBalanceKes + netPnlKes, 4);
  const newMarginKes = Math.max(0, round(curMarginKes - releasedMargin, 4));

  const { error: acctErr } = await supabase
    .from("forex_accounts")
    .update({
      balance: newBalanceKes,
      used_margin: newMarginKes,
      updated_at: new Date().toISOString(),
    })
    .eq("id", acctId);
  if (acctErr) throw acctErr;

  // Record transaction lines for the P/L and both fees.
  await supabase.from("forex_transactions").insert([
    {
      user_id: userId,
      account_id: acctId,
      position_id: positionId,
      type: "realized_pnl",
      amount: round(realizedPnlUsd * q2k, 4),
      balance_after: newBalanceKes,
      status: "completed",
      reference: full ? "close" : "partial_close",
      note: `${spec.symbol} ${position.side} ${closeLots} lots @ ${exitPrice}`,
    },
    {
      user_id: userId,
      account_id: acctId,
      position_id: positionId,
      type: "commission",
      amount: round(openingFeeUsd * q2k, 4),
      balance_after: newBalanceKes,
      status: "completed",
      reference: `open-fee:${positionId}`,
      note: `Opening commission ${spec.symbol} ${position.side}`,
    },
    {
      user_id: userId,
      account_id: acctId,
      position_id: positionId,
      type: "commission",
      amount: round(-closingFeeUsd * q2k, 4),
      balance_after: newBalanceKes,
      status: "completed",
      reference: `close-fee:${positionId}`,
      note: `Closing commission ${spec.symbol} ${position.side}`,
    },
  ]);

  // Live wallet settlement (margin release + P/L wallet movement).
  const accountRow = await supabase
    .from("forex_accounts")
    .select("account_type")
    .eq("id", acctId)
    .maybeSingle();
  const isLive = accountRow?.data?.account_type === "live";
  if (isLive) {
    const legs = settlementLegs({
      side: position.side as "buy" | "sell",
      units: closeLots * spec.contractSize,
      entryPrice: Number(position.average_entry_price),
      exitPrice,
      quoteToKes: q2k,
      margin: releasedMargin,
    });
    const closingCommissionKes = closingFeeUsd * q2k;
    const netProfitAfterCommission = legs.profit - legs.loss - closingCommissionKes;
    const settlement = await settleReal(userId, releasedMargin, netProfitAfterCommission, `close:${positionId}`);
    if (!settlement.ok) {
      logger.error({ err: settlement.reason, positionId }, "Live settlement failed");
      throw new Error("Settlement pending");
    }
  }

  return {
    success: true,
    positionId,
    side: position.side,
    lots: closeLots,
    exitPrice,
    realizedPnlUsd: round(realizedPnlUsd, 4),
    realizedPnlKes: round(realizedPnlUsd * q2k, 4),
    openingFeeUsd,
    closingFeeUsd,
    netPnlUsd,
    releasedMargin,
    accountBalanceKes: newBalanceKes,
    usedMargin: newMarginKes,
    fullClose: full,
  };
}

async function symbolForInstrument(instrumentId: number): Promise<string | undefined> {
  const { data } = await supabase
    .from("forex_instruments")
    .select("symbol")
    .eq("id", instrumentId)
    .maybeSingle();
  return data?.symbol ?? undefined;
}

function round(v: number, d: number): number {
  return Math.round(v * Math.pow(10, d)) / Math.pow(10, d);
}
