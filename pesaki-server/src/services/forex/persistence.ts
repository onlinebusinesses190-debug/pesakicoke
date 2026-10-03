/**
 * PESAKI Forex — persistence adapter for the market engine.
 *
 * The in-memory engine is deterministic: given a seed and a tick counter it
 * always produces the same price. But if the counter and last mid price are lost
 * on restart, the walk jumps back to its seed value and the chart restarts.
 *
 * This adapter bridges the engine and the Supabase `forex_symbol_state` and
 * `forex_candles` tables so that:
 *
 * - the per-symbol mid price and tick counter survive a restart, keeping the
 *   walk continuous;
 * - completed candles are archived so a chart is never empty after a redeploy;
 * - a partially-migrated or database-down deployment still opens (the engine
 *   falls back to deterministic seeding when loads fail).
 */

import { supabase } from "../../lib/supabase";
import { logger } from "../../utils/logger";
import { INSTRUMENTS } from "./instruments";
import type { Candle, EnginePersistence } from "./marketEngine";
import type { MarketEngine } from "./marketEngine";

export class ForexPersistence implements EnginePersistence {
  async loadSymbolState(): Promise<Record<string, { mid: number; tickCount: number }>> {
    const symbols = Object.keys(INSTRUMENTS);
    const { data, error } = await supabase
      .from("forex_symbol_state")
      .select("symbol, mid, tick_count")
      .in("symbol", symbols);

    if (error) {
      logger.warn(
        { error: error.message },
        "Forex: could not load symbol state — using seed values",
      );
      return {};
    }

    const out: Record<string, { mid: number; tickCount: number }> = {};
    for (const row of data ?? []) {
      out[row.symbol as string] = {
        mid: Number(row.mid),
        tickCount: Number(row.tick_count),
      };
    }
    return out;
  }

  async loadCandles(symbol: string, interval: string, count: number): Promise<Candle[]> {
    const { data, error } = await supabase
      .from("forex_candles")
      .select("*")
      .eq("symbol", symbol)
      .eq("interval", interval)
      .order("timestamp", { ascending: true })
      .limit(count);

    if (error) {
      logger.debug(
        { symbol, interval, error: error.message },
        "Forex: could not load persisted candles",
      );
      return [];
    }

    return (data ?? []).map((row) => ({
      timestamp: new Date(row.timestamp as string).getTime(),
      open: Number(row.open),
      high: Number(row.high),
      low: Number(row.low),
      close: Number(row.close),
      tickVolume: Number(row.tick_volume ?? 0),
    }));
  }

  async saveSymbolState(
    symbol: string,
    mid: number,
    tickCount: number,
  ): Promise<void> {
    const { error } = await supabase.from("forex_symbol_state").upsert({
      symbol,
      mid,
      tick_count: tickCount,
      updated_at: new Date().toISOString(),
    });

    if (error) {
      logger.warn(
        { symbol, error: error.message },
        "Forex: could not persist symbol state",
      );
    }
  }

  async saveCandle(symbol: string, interval: string, candle: Candle): Promise<void> {
    const { error } = await supabase.from("forex_candles").upsert({
      symbol,
      interval,
      timestamp: new Date(candle.timestamp).toISOString(),
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
      tick_volume: candle.tickVolume,
    });

    if (error) {
      logger.debug(
        { symbol, interval, error: error.message },
        "Forex: could not persist completed candle",
      );
    }
  }
}

/** How often the periodic state flush writes mid + counter back to the DB. */
const DEFAULT_FLUSH_MS = 30_000;

/**
 * Wire a persistence adapter into a running engine.
 *
 * - Registers `onCandleComplete` so every closed candle is archived as it
 *   finishes.
 * - Starts a periodic flush that snapshots all symbol mid + tick counts so a
 *   restart resumes the walk instead of jumping back to seed.
 *
 * Returns a stop function that removes the callback and clears the flush timer.
 */
export function attachPersistence(
  engine: MarketEngine,
  persistence: ForexPersistence,
  flushMs = DEFAULT_FLUSH_MS,
): () => void {
  engine.onCandleComplete = (symbol, interval, candle) => {
    void persistence.saveCandle(symbol, interval, candle);
  };

  const timer = setInterval(() => {
    const state = engine.snapshot();
    for (const [symbol, s] of Object.entries(state)) {
      void persistence.saveSymbolState(symbol, s.mid, s.tickCount);
    }
  }, flushMs);
  timer.unref?.();

  logger.info(
    { provider: "pesaki-engine", flushMs },
    "Forex persistence attached (state flush + candle archiving)",
  );

  return () => {
    engine.onCandleComplete = undefined;
    clearInterval(timer);
  };
}

/** Convenience: hydrate then attach, in the order the server needs them. */
export async function hydrateAndAttach(
  engine: MarketEngine,
): Promise<(() => void) | null> {
  const persistence = new ForexPersistence();
  await engine.hydrate(persistence);
  return attachPersistence(engine, persistence);
}
