/**
 * Binary FX expiry worker.
 *
 * Binary trades must settle whether or not the user has the app open. A React
 * countdown cannot do that, so this worker polls for OPEN trades whose
 * expires_at has passed and settles them through the idempotent settle path.
 *
 * The worker is safe to run repeatedly: settleTrade() refuses to touch a trade
 * that is no longer OPEN, so a double-scan at the expiry boundary produces
 * exactly one settlement.
 */

import { supabase } from "../../lib/supabase";
import { logger } from "../../utils/logger";
import { getEngine } from "../forex/marketEngine";
import { settleTrade } from "./service";

const SWEEP_INTERVAL_MS = 1000;
let running = false;
let timer: NodeJS.Timeout | null = null;

async function sweepOnce() {
  const engine = getEngine();
  if (engine.state !== "open") return;

  const now = new Date().toISOString();
  const { data: trades, error } = await supabase
    .from("bfx_trades")
    .select("id,asset")
    .eq("status", "open")
    .lte("expires_at", now)
    .limit(200);

  if (error) {
    logger.error({ err: error.message }, "BFX expiry sweep failed");
    return;
  }
  if (!trades?.length) return;

  for (const t of trades) {
    try {
      const quote = engine.quote(t.asset);
      const exitPrice = quote.mid;
      const result = await settleTrade(t.id, exitPrice);
      if (result.success) {
        logger.info({ tradeId: t.id, exitPrice, status: result.status }, "BFX trade settled by worker");
      } else {
        logger.warn({ tradeId: t.id, err: result.error }, "BFX trade settle failed");
      }
    } catch (err) {
      logger.error({ err: (err as Error).message, tradeId: t.id }, "BFX settle exception");
    }
  }
}

async function loop() {
  while (running) {
    try {
      await sweepOnce();
    } catch (err) {
      logger.error({ err: (err as Error).message }, "BFX expiry worker iteration failed");
    }
    await new Promise((r) => setTimeout(r, SWEEP_INTERVAL_MS));
  }
}

export function startBinaryFxExpiryWorker() {
  if (running) return;
  running = true;
  logger.info("Binary FX expiry worker starting");
  void loop();
}

export function stopBinaryFxExpiryWorker() {
  running = false;
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}