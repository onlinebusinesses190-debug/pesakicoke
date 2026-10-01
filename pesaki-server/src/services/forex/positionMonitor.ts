/**
 * PESAKI Forex — server-side position monitor.
 *
 * Stop-losses and take-profits have to fire whether or not anybody has the app
 * open. A React effect cannot do that: close the tab and the user's stop simply
 * never runs, which is not an acceptable failure mode for a leveraged product.
 *
 * This monitor polls open positions, compares the engine's current price
 * against each position's stop and target, and closes through the same
 * settlement path a user-initiated close uses. It never computes an outcome of
 * its own — it only decides *when* to close, and the price it closes at is the
 * engine's real quote.
 *
 * Deliberately absent: any hidden win/loss probability or outcome bias. The
 * engine has no concept of a customer or a stake, so it cannot rig a result.
 */

import { supabase } from "../../lib/supabase";
import { logger } from "../../utils/logger";
import { getEngine } from "./marketEngine";
import { getInstrument, type InstrumentSpec } from "./instruments";
import { computePnl } from "./risk";
import { kesPerUnit } from "./kesRates";

let running = false;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function symbolForInstrument(instrumentId: number): Promise<string | undefined> {
  const { data } = await supabase
    .from("forex_instruments")
    .select("symbol")
    .eq("id", instrumentId)
    .maybeSingle();
  return data?.symbol ?? undefined;
}

/** Settle one position through the atomic RPC, recording the trigger reason. */
async function settle(
  positionId: string,
  userId: string,
  lots: number,
  exitPrice: number,
  quoteToKes: number,
  reason: "stop_loss" | "take_profit",
) {
  const { data, error } = await supabase.rpc("forex_close_position", {
    p_user_id: userId,
    p_position_id: positionId,
    p_close_lots: lots,
    p_exit_price: exitPrice,
    p_quote_to_kes: quoteToKes,
  });

  if (error) {
    logger.error(
      { positionId, userId, reason, err: error.message },
      "Forex SL/TP settlement failed",
    );
    return false;
  }

  logger.info(
    {
      positionId,
      userId,
      reason,
      exitPrice,
      realizedPnl: data?.realized_pnl,
      balance: data?.balance,
    },
    "Forex position closed by monitor",
  );

  await supabase
    .from("forex_positions")
    .update({ close_reason: reason })
    .eq("id", positionId);

  return true;
}

async function scanOnce() {
  const engine = getEngine();
  if (engine.state !== "open") return;

  const { data: positions, error } = await supabase
    .from("forex_positions")
    .select("id,user_id,instrument_id,side,quantity,average_entry_price,stop_loss,take_profit")
    .is("closed_at", null)
    .gt("quantity", 0)
    .limit(500);

  if (error) {
    logger.error({ err: error.message }, "Forex monitor scan failed");
    return;
  }
  if (!positions?.length) return;

  for (const p of positions) {
    const symbol = await symbolForInstrument(p.instrument_id);
    if (!symbol) continue;
    const spec: InstrumentSpec | undefined = getInstrument(symbol);
    if (!spec) continue;

    // A long is hit by a fall to the stop; a short by a rise.
    const quote = engine.quote(symbol);
    const exitPrice = p.side === "buy" ? quote.bid : quote.ask;

    const stopHit =
      p.stop_loss != null &&
      (p.side === "buy" ? exitPrice <= Number(p.stop_loss) : exitPrice >= Number(p.stop_loss));
    const targetHit =
      p.take_profit != null &&
      (p.side === "buy" ? exitPrice >= Number(p.take_profit) : exitPrice <= Number(p.take_profit));

    if (!stopHit && !targetHit) continue;

    const lots = Number(p.quantity);
    const pnl = computePnl({
      side: p.side,
      lots,
      entryPrice: Number(p.average_entry_price),
      exitPrice,
      instrument: spec,
      quoteToKes: kesPerUnit(spec.quote),
    });

    await settle(
      p.id,
      p.user_id,
      lots,
      exitPrice,
      kesPerUnit(spec.quote),
      stopHit ? "stop_loss" : "take_profit",
    );
    logger.info({ positionId: p.id, pnl }, "SL/TP triggered");
  }
}

async function loop() {
  if (running) return;
  running = true;
  while (running) {
    try {
      await scanOnce();
    } catch (err) {
      logger.error({ err: (err as Error).message }, "Forex monitor iteration failed");
    }
    // Guard against overlapping scans if the database is slow.
    await sleep(2000);
  }
}

export function startPositionMonitor() {
  // `running` is the single guard: calling this twice must not start a second
  // loop, and the previous check was dead because it tested a timer that was
  // never assigned.
  if (running) return;
  logger.info("PESAKI Forex SL/TP monitor starting");
  void loop();
}

export function stopPositionMonitor() {
  running = false;
}

/** Test seam: run a single scan. */
export const scanPositionsOnce = scanOnce;