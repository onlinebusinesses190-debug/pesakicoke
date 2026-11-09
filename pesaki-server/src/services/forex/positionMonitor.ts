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
import { closePosition } from "./settlement";

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

/** Stop-out threshold as a percent of used margin. */
const STOP_OUT_PCT = Number(process.env.PESAKI_FX_STOP_OUT_PCT ?? "30");

/** Settle one position through the shared authoritative close path. */
async function settle(
  positionId: string,
  userId: string,
  lots: number,
  exitPrice: number,
  reason: "stop_loss" | "take_profit" | "stop_out",
): Promise<boolean> {
  try {
    const result = await closePosition({ positionId, userId, lots: lots, reason: reason as any });
    logger.info(
      { positionId, userId, reason, exitPrice, realizedPnl: result.netPnlUsd, balance: result.accountBalanceKes },
      "Forex position closed by monitor",
    );
    return true;
  } catch (err) {
    logger.error(
      { positionId, userId, reason, err: (err as Error).message },
      "Forex SL/TP settlement failed",
    );
    return false;
  }
}

async function scanOnce() {
  const engine = getEngine();
  if (engine.state !== "open") return;

  const { data: positions, error } = await supabase
    .from("forex_positions")
    .select("id,user_id,instrument_id,side,quantity,average_entry_price,stop_loss,take_profit,margin")
    .is("closed_at", null)
    .gt("quantity", 0)
    .limit(500);

  if (error) {
    logger.error({ err: error.message }, "Forex monitor scan failed");
    return;
  }
  if (!positions?.length) return;

  // Load margin config for stop-out threshold.
  const { data: config } = await supabase.from("forex_market_config").select("liquidation_threshold_pct").maybeSingle();
  const stopOutPct = config?.liquidation_threshold_pct != null ? Number(config.liquidation_threshold_pct) : STOP_OUT_PCT;

  for (const p of positions) {
    const symbol = await symbolForInstrument(p.instrument_id);
    if (!symbol) continue;
    const spec: InstrumentSpec | undefined = getInstrument(symbol);
    if (!spec) continue;

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
    await settle(p.id, p.user_id, lots, exitPrice, stopHit ? "stop_loss" : "take_profit");
  }

  // Stop-out liquidation: close losers until margin level recovers above threshold.
  const { data: accounts } = await supabase.from("forex_accounts").select("id,user_id,balance,used_margin,equity,account_type").eq("account_type", "live").gt("used_margin", 0).maybeSingle();
  if (accounts && Number(accounts.used_margin) > 0) {
    const equity = Number(accounts.equity ?? accounts.balance);
    const marginLevel = equity / Number(accounts.used_margin) * 100;
    if (marginLevel <= stopOutPct) {
      const { data: losers } = await supabase
        .from("forex_positions")
        .select("id,user_id,quantity,side,average_entry_price,margin,instrument_id")
        .eq("account_id", accounts.id)
        .is("closed_at", null)
        .gt("quantity", 0)
        .order("realized_pnl", { ascending: true })
        .limit(10);
      for (const p of losers ?? []) {
        const symbol = await symbolForInstrument(p.instrument_id);
        const spec: InstrumentSpec | undefined = symbol ? getInstrument(symbol) : undefined;
        const quote = spec && symbol ? engine.quote(symbol) : undefined;
        const exitPrice = p.side === "buy" ? (quote?.bid ?? 0) : (quote?.ask ?? 0);
        await settle(p.id, p.user_id, Number(p.quantity), exitPrice, "stop_out");
        // Re-check margin level after each close.
        const { data: acct2 } = await supabase.from("forex_accounts").select("balance,used_margin,equity").eq("id", accounts.id).maybeSingle();
        const eq2 = Number(acct2?.equity ?? acct2?.balance);
        const lvl2 = eq2 / Number(acct2?.used_margin ?? 1) * 100;
        if (lvl2 > stopOutPct) break;
      }
    }
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