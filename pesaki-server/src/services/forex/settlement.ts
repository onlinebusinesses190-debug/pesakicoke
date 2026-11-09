/**
 * PESAKI Forex — authoritative position close / settlement logic.
 *
 * Both the HTTP close endpoint and the server-side SL/TP / stop-out monitor
 * route through this single function so every closure uses identical pricing,
 * fee and wallet-settlement semantics. It never trusts a client-supplied P/L;
 * everything is recomputed from the stored entry price, direction, size and the
 * engine's live executable quote at close time.
 *
 * The close is executed through a PostgreSQL transaction (forex_close_position_txn
 * RPC) so position update, account adjustment, fee recording and idempotency
 * tracking all happen atomically. Wallet settlement (margin release + P/L
 * movement) happens after the DB transaction succeeds.
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
  idempotencyKey?: string; // prevents duplicate close on retry
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
  alreadyClosed?: boolean;
}

/** Authoritative close. Atomic via PostgreSQL transaction RPC. */
export async function closePosition(input: CloseInput): Promise<CloseResult> {
  const { positionId, userId, lots: lotsToClose, reason = "manual", idempotencyKey } = input;

  const idemKey = idempotencyKey ?? `close:${positionId}:${Date.now()}`;

  // Fetch position to validate and get current state before the txn.
  const { data: position, error: posErr } = await supabase
    .from("forex_positions")
    .select("*, forex_instruments(symbol, quote_currency)")
    .eq("id", positionId)
    .eq("user_id", userId)
    .maybeSingle();
  if (posErr) throw posErr;
  if (!position) throw new Error("Position not found");
  if (position.closed_at) {
    throw new Error("Position already closed");
  }

  const sym = position.forex_instruments?.symbol
    || (await (async () => {
      const { data } = await supabase.from("forex_instruments").select("symbol").eq("id", position.instrument_id).maybeSingle();
      return data?.symbol;
    })());
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

  const quote = getEngine().quote(spec.symbol);
  const exitPrice = position.side === "buy" ? quote.bid : quote.ask;
  const q2k = kesPerUnit(spec.quote);

  // Execute the atomic close transaction in PostgreSQL.
  const { data: txnResult, error: txnError } = await supabase.rpc("forex_close_position_txn", {
    p_position_id: positionId,
    p_user_id: userId,
    p_close_lots: closeLots,
    p_exit_price: exitPrice,
    p_quote_to_kes: q2k,
    p_close_reason: reason,
    p_idempotency_key: idemKey,
  });

  if (txnError) {
    logger.error({ err: txnError.message, positionId }, "Forex close transaction failed");
    throw new Error(txnError.message || "Close transaction failed");
  }

  const result = txnResult as any;
  if (!result || !result.success) {
    if (result?.already_closed) {
      return {
        success: true, positionId, side: position.side, lots: closeLots,
        exitPrice: result.exit_price ?? 0, realizedPnlUsd: Number(result.realized_pnl_usd ?? 0),
        realizedPnlKes: 0, openingFeeUsd: 0, closingFeeUsd: 0, netPnlUsd: 0,
        releasedMargin: 0, accountBalanceKes: 0, usedMargin: 0, fullClose: false,
        alreadyClosed: true,
      };
    }
    throw new Error(result?.error || "Close rejected");
  }

  // Live wallet settlement (margin release + P/L wallet movement) happens
  // outside the DB transaction since it calls external wallet RPCs.
  // Determine live/demo from account type.
  const { data: acctRow } = await supabase
    .from("forex_accounts")
    .select("account_type")
    .eq("id", position.account_id)
    .maybeSingle();
  const isLiveAccount = acctRow?.account_type === "live";

  if (isLiveAccount) {
    const legs = settlementLegs({
      side: position.side as "buy" | "sell",
      units: closeLots * spec.contractSize,
      entryPrice: Number(position.average_entry_price),
      exitPrice,
      quoteToKes: q2k,
      margin: Number(result.releasedMargin ?? 0),
    });
    const closingCommissionKes = Number(result.closingFeeUsd ?? 0) * q2k;
    const netProfitAfterCommission = legs.profit - legs.loss - closingCommissionKes;
    const settlement = await settleReal(userId, Number(result.releasedMargin ?? 0), netProfitAfterCommission, `close:${positionId}`);
    if (!settlement.ok) {
      logger.error({ err: settlement.reason, positionId }, "Live wallet settlement failed — needs reconciliation");
      // DB transaction already committed; surface the error so it can be reconciled.
      throw new Error("Settlement pending — DB updated, wallet needs reconciliation");
    }
  }

  return {
    success: true,
    positionId,
    side: position.side,
    lots: closeLots,
    exitPrice: Number(result.exitPrice ?? exitPrice),
    realizedPnlUsd: Number(result.realizedPnlUsd ?? 0),
    realizedPnlKes: Number(result.realizedPnlKes ?? 0),
    openingFeeUsd: Number(result.openingFeeUsd ?? 0),
    closingFeeUsd: Number(result.closingFeeUsd ?? 0),
    netPnlUsd: Number(result.netPnlUsd ?? 0),
    releasedMargin: Number(result.releasedMargin ?? 0),
    accountBalanceKes: Number(result.accountBalanceKes ?? 0),
    usedMargin: Number(result.usedMargin ?? 0),
    fullClose: Boolean(result.fullClose),
  };
}
