/**
 * PESAKI Forex — internal market engine.
 *
 * This is PESAKI's own price source. It is deliberately NOT a feed of real
 * interbank FX prices, and nothing here should be described to users as
 * "live", "Reuters", "interbank" or "broker" pricing. The quotes are generated
 * by this process. The public API labels them `pesaki-engine` so a client can
 * never mistake them for a real market feed.
 *
 * Design constraints:
 *
 * - Deterministic. Every price is derived from a seeded PRNG keyed by
 *   (symbol, tick counter), so the same seed always produces the same series.
 *   That makes the engine unit-testable and makes restarts reproducible instead
 *   of producing an unexplained jump.
 * - Server-authoritative. The browser never sees this module. It asks for a
 *   quote and receives one; it cannot supply, influence or compute prices.
 * - Honest about outcome. There is no hidden win/loss bias, no outcome rigging
 *   and no per-customer price manipulation. The engine's revenue is the
 *   configured spread plus explicitly disclosed fees, and both are recorded on
 *   every fill so a user can reconcile what they paid.
 * - Testable without a clock or a network. `advance()` is pure; the interval
 *   timer only decides when it is called.
 */

import { INSTRUMENTS, roundToDigits, type InstrumentSpec } from "./instruments";
import { logger } from "../../utils/logger";

export type MarketState = "open" | "paused" | "unavailable";

export const INTERVALS = {
  "1m": 60,
  "5m": 300,
  "15m": 900,
  "30m": 1800,
  "1H": 3600,
  "4H": 14400,
  "1D": 86400,
} as const;

export type Interval = keyof typeof INTERVALS;

export interface EngineConfig {
  /** Master seed. Same seed => same price series. */
  seed: number;
  /** How often the engine produces a new tick, in milliseconds. */
  tickIntervalMs: number;
  /** Standard deviation of per-tick returns, in price units. */
  volatility: number;
  /** Spread is drawn per tick from this range, in pips. */
  spreadPipsMin: number;
  spreadPipsMax: number;
  /** Disclosed trading fee per lot per side, in KES. */
  feePerLot: number;
  state: MarketState;
  /** Overrides for the seed price of a symbol. */
  initialPrices: Record<string, number>;
}

/** Seed prices. Mid-market approximations used only to start the walk. */
const DEFAULT_INITIAL_PRICES: Record<string, number> = {
  "EUR/USD": 1.1298,
  "GBP/USD": 1.2874,
  "USD/JPY": 151.42,
  "USD/CHF": 0.8896,
  "AUD/USD": 0.6612,
  "USD/CAD": 1.3592,
  "NZD/USD": 0.6088,
  "EUR/GBP": 0.8777,
  "EUR/JPY": 171.06,
  "GBP/JPY": 194.88,
};

const num = (key: string, fallback: number) => {
  const raw = process.env[key];
  if (raw === undefined || raw === "") return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export function loadConfig(): EngineConfig {
  let initialPrices: Record<string, number> = { ...DEFAULT_INITIAL_PRICES };
  const raw = process.env.PESAKI_FX_INITIAL_PRICES;
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Record<string, number>;
      for (const [symbol, price] of Object.entries(parsed)) {
        if (getInstrumentSpec(symbol) && Number.isFinite(price)) {
          initialPrices[symbol] = price;
        }
      }
    } catch (err) {
      logger.warn({ err: (err as Error).message }, "PESAKI_FX_INITIAL_PRICES is not valid JSON");
    }
  }

  const state = process.env.PESAKI_FX_MARKET_STATE as MarketState | undefined;

  return {
    seed: num("PESAKI_FX_SEED", 20260101),
    tickIntervalMs: Math.max(250, num("PESAKI_FX_TICK_MS", 1000)),
    volatility: num("PESAKI_FX_VOLATILITY", 0.00004),
    spreadPipsMin: num("PESAKI_FX_SPREAD_MIN_PIPS", 0.4),
    spreadPipsMax: num("PESAKI_FX_SPREAD_MAX_PIPS", 1.6),
    feePerLot: num("PESAKI_FX_FEE_PER_LOT", 0),
    state: state === "paused" || state === "unavailable" ? state : "open",
    initialPrices,
  };
}

export function getInstrumentSpec(symbol: string): InstrumentSpec | undefined {
  return INSTRUMENTS[symbol.toUpperCase()];
}

/**
 * mulberry32 — small, fast, well-distributed 32-bit PRNG.
 *
 * Deterministic given a seed, which is what makes the price series testable.
 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Combine a master seed, a symbol and a counter into a stable per-tick seed. */
function tickSeed(master: number, symbol: string, counter: number): number {
  let h = master >>> 0;
  for (let i = 0; i < symbol.length; i++) {
    h = (Math.imul(h, 31) + symbol.charCodeAt(i)) >>> 0;
  }
  return (Math.imul(h ^ counter, 2654435761) >>> 0);
}

export interface Candle {
  /** Bucket start, unix milliseconds. */
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  tickVolume: number;
}

export interface Quote {
  symbol: string;
  bid: number;
  ask: number;
  mid: number;
  spreadPips: number;
  /** Always "pesaki-engine": these are generated prices, not a market feed. */
  provider: string;
  state: MarketState;
  timestamp: string;
}

export class MarketEngine {
  private config: EngineConfig;
  /** Per-symbol walk state. */
  private mid: Record<string, number> = {};
  private counter: Record<string, number> = {};
  /** Closed candles per symbol per interval. */
  private candles: Record<string, Partial<Record<Interval, Candle[]>>> = {};
  private startedAt: number;
  private timer: NodeJS.Timeout | null = null;
  private _state: MarketState;

  constructor(config: EngineConfig, now = Date.now()) {
    this.config = config;
    this.startedAt = now;
    this._state = config.state;
    for (const symbol of Object.keys(INSTRUMENTS)) {
      this.counter[symbol] = 0;
      this.candles[symbol] = {};
      const price = config.initialPrices[symbol] ?? DEFAULT_INITIAL_PRICES[symbol];
      this.mid[symbol] = roundToDigits(price, INSTRUMENTS[symbol].digits);
    }
  }

  get state(): MarketState {
    return this._state;
  }

  getConfig(): EngineConfig {
    return this.config;
  }

  /** Operational visibility without leaking internals to end users. */
  describe() {
    return {
      provider: "pesaki-engine",
      state: this._state,
      startedAt: new Date(this.startedAt).toISOString(),
      tickIntervalMs: this.config.tickIntervalMs,
      volatility: this.config.volatility,
      spreadPips: { min: this.config.spreadPipsMin, max: this.config.spreadPipsMax },
      feePerLot: this.config.feePerLot,
      symbols: Object.keys(INSTRUMENTS),
    };
  }

  setState(state: MarketState) {
    this._state = state;
    logger.info({ state }, "PESAKI Forex market state changed");
  }

  /**
   * Advance one symbol by one tick and return the new quote.
   *
   * Pure with respect to (symbol, counter): the same counter always yields the
   * same move, which is what lets tests assert exact prices.
   */
  advance(symbol: string, atMs: number): Quote {
    const key = symbol.toUpperCase();
    const spec = getInstrumentSpec(key);
    if (!spec) throw new Error(`Unsupported symbol ${symbol}`);

    const n = this.counter[key]++;
    const rng = mulberry32(tickSeed(this.config.seed, key, n));

    // Mean-reverting random walk: drift is damped so a long-running process
    // cannot drift to an absurd price, and the step is scaled by price so
    // 151.42 JPY and 1.12 EUR behave comparably in relative terms.
    const current = this.mid[key];
    const shock = (rng() - 0.5) * 2 * this.config.volatility;
    const pull = (DEFAULT_INITIAL_PRICES[key] - current) / DEFAULT_INITIAL_PRICES[key];
    const next = roundToDigits(
      current * (1 + shock + pull * 0.02),
      spec.digits,
    );
    this.mid[key] = next;

    // Spread drawn per tick within the configured band. Applied to every fill.
    const pipRange = this.config.spreadPipsMax - this.config.spreadPipsMin;
    const spreadPips = roundToDigits(
      this.config.spreadPipsMin + rng() * pipRange,
      2,
    );
    const halfSpread = (spreadPips * spec.pipSize) / 2;

    this.recordTick(key, next, atMs);

    return {
      symbol: key,
      bid: roundToDigits(next - halfSpread, spec.digits),
      ask: roundToDigits(next + halfSpread, spec.digits),
      mid: next,
      spreadPips,
      provider: "pesaki-engine",
      state: this._state,
      timestamp: new Date(atMs).toISOString(),
    };
  }

  /** Current quote without advancing the walk. */
  quote(symbol: string): Quote {
    const key = symbol.toUpperCase();
    const spec = getInstrumentSpec(key);
    if (!spec) throw new Error(`Unsupported symbol ${symbol}`);
    const mid = this.mid[key];
    // Midpoint spread when paused/unavailable so the number is stable.
    const spreadPips = this.config.spreadPipsMin;
    const halfSpread = (spreadPips * spec.pipSize) / 2;
    return {
      symbol: key,
      bid: roundToDigits(mid - halfSpread, spec.digits),
      ask: roundToDigits(mid + halfSpread, spec.digits),
      mid,
      spreadPips,
      provider: "pesaki-engine",
      state: this._state,
      timestamp: new Date().toISOString(),
    };
  }

  quoteAll(symbols: string[]): Quote[] {
    return symbols.filter((s) => getInstrumentSpec(s)).map((s) => this.quote(s));
  }

  /** Fold a tick into every timeframe bucket. */
  private recordTick(symbol: string, price: number, atMs: number) {
    for (const [interval, seconds] of Object.entries(INTERVALS) as [Interval, number][]) {
      const bucketMs = seconds * 1000;
      const start = Math.floor(atMs / bucketMs) * bucketMs;
      const series = ((this.candles[symbol] ??= {})[interval] ??= []);
      const last = series[series.length - 1];
      if (!last || last.timestamp !== start) {
        series.push({ timestamp: start, open: price, high: price, low: price, close: price, tickVolume: 1 });
      } else {
        last.high = Math.max(last.high, price);
        last.low = Math.min(last.low, price);
        last.close = price;
        last.tickVolume += 1;
      }
      // Bound memory: 1D candles are the coarsest and need the least history.
      const cap = interval === "1D" ? 400 : 1500;
      if (series.length > cap) series.splice(0, series.length - cap);
    }
  }

  /**
   * Build plausible history at startup so a chart is never empty.
   *
   * Walks backwards from the current mid using the same deterministic PRNG, so
   * a given seed always yields the same history — no fabricated chart that
   * changes on every restart.
   */
  seedHistory(symbols: string[], now = Date.now()) {
    for (const symbol of symbols) {
      const spec = getInstrumentSpec(symbol);
      if (!spec) continue;
      const perDay = Math.max(1, Math.floor((86400 * 1000) / this.config.tickIntervalMs));

      // One day of 1m history, and enough 5m bars to fill a default chart.
      const steps = Math.min(perDay, 1440);
      const rng = mulberry32(tickSeed(this.config.seed, symbol, 0));
      const series: Candle[] = [];
      let price = this.mid[symbol];
      const startMs = now - steps * this.config.tickIntervalMs;

      for (let i = 0; i < steps; i++) {
        const at = startMs + i * this.config.tickIntervalMs;
        const shock = (rng() - 0.5) * 2 * this.config.volatility;
        const pull = (DEFAULT_INITIAL_PRICES[symbol] - price) / DEFAULT_INITIAL_PRICES[symbol];
        price = roundToDigits(price * (1 + shock + pull * 0.02), spec.digits);
        const bucketMs = INTERVALS["1m"] * 1000;
        const bucket = Math.floor(at / bucketMs) * bucketMs;
        const last = series[series.length - 1];
        if (!last || last.timestamp !== bucket) {
          series.push({ timestamp: bucket, open: price, high: price, low: price, close: price, tickVolume: 1 });
        } else {
          last.high = Math.max(last.high, price);
          last.low = Math.min(last.low, price);
          last.close = price;
          last.tickVolume += 1;
        }
      }
      this.candles[symbol]["1m"] = series;

      // Aggregate the 1m series into the coarser intervals so timeframe
      // switching works immediately without waiting for real ticks to fill.
      for (const interval of Object.keys(INTERVALS) as Interval[]) {
        if (interval === "1m") continue;
        this.candles[symbol][interval] = aggregate(series, INTERVALS[interval]);
      }
    }
  }

  /**
   * Return `count` candles ending at `atMs`, rolling the walk forward past the
   * last recorded bucket so the newest bar always reflects the current price.
   */
  getCandles(symbol: string, interval: Interval, count: number, now = Date.now()): Candle[] {
    const key = symbol.toUpperCase();
    const spec = getInstrumentSpec(key);
    if (!spec) throw new Error(`Unsupported symbol ${symbol}`);

    const seconds = INTERVALS[interval];
    const bucketMs = seconds * 1000;
    const series = [...(this.candles[key][interval] ?? [])];
    const current = this.mid[key];

    // Extend up to `count` buckets past the last one so the chart is current.
    let cursor = series.length
      ? series[series.length - 1].timestamp + bucketMs
      : Math.floor(now / bucketMs) * bucketMs;
    const target = Math.floor(now / bucketMs) * bucketMs;
    let guard = 0;
    while (cursor <= target && guard++ < count + 2) {
      // Flat-fill the gap: we do not have per-bucket history for future buckets,
      // and inventing a walk here would make the chart disagree with the quote.
      series.push({
        timestamp: cursor,
        open: current,
        high: current,
        low: current,
        close: current,
        tickVolume: 0,
      });
      cursor += bucketMs;
    }

    return series.slice(-Math.max(1, count));
  }

  /** Daily change in pips and percent, for the market watch list. */
  dailyChange(symbol: string) {
    const key = symbol.toUpperCase();
    const spec = getInstrumentSpec(key);
    if (!spec) return { pips: 0, percent: 0, high: null as number | null, low: null as number | null };
    const day = this.candles[key]["1D"] ?? [];
    const first = day[0]?.open ?? this.mid[key];
    const last = this.mid[key];
    const pips = (last - first) / spec.pipSize;
    return {
      pips: roundToDigits(pips, 1),
      percent: roundToDigits(((last - first) / first) * 100, 3),
      high: day.length ? Math.max(...day.map((c) => c.high)) : null,
      low: day.length ? Math.min(...day.map((c) => c.low)) : null,
    };
  }

  start() {
    if (this.timer) return;
    const symbols = Object.keys(INSTRUMENTS);
    this.seedHistory(symbols);
    this.timer = setInterval(() => {
      if (this._state !== "open") return;
      const at = Date.now();
      for (const symbol of symbols) {
        try {
          this.advance(symbol, at);
        } catch (err) {
          logger.error({ err: (err as Error).message, symbol }, "PESAKI FX tick failed");
        }
      }
    }, this.config.tickIntervalMs);
    // Never hold the process open on the engine's account.
    this.timer.unref?.();
    logger.info(this.describe(), "PESAKI Forex market engine started");
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** Restore a mid price on restart so quotes do not jump to the seed price. */
  hydrateMid(symbol: string, price: number) {
    const spec = getInstrumentSpec(symbol);
    if (!spec || !Number.isFinite(price)) return;
    this.mid[symbol.toUpperCase()] = roundToDigits(price, spec.digits);
  }
}

/** Roll lower-resolution candles up from a finer series. */
export function aggregate(series: Candle[], seconds: number): Candle[] {
  const bucketMs = seconds * 1000;
  const out: Candle[] = [];
  for (const c of series) {
    const bucket = Math.floor(c.timestamp / bucketMs) * bucketMs;
    const last = out[out.length - 1];
    if (!last || last.timestamp !== bucket) {
      out.push({ timestamp: bucket, open: c.open, high: c.high, low: c.low, close: c.close, tickVolume: c.tickVolume });
    } else {
      last.high = Math.max(last.high, c.high);
      last.low = Math.min(last.low, c.low);
      last.close = c.close;
      last.tickVolume += c.tickVolume;
    }
  }
  return out;
}

let engine: MarketEngine | null = null;

export function getEngine(): MarketEngine {
  if (!engine) engine = new MarketEngine(loadConfig());
  return engine;
}

/** Test seam: swap in a deterministic engine. */
export function setEngine(next: MarketEngine | null) {
  engine?.stop();
  engine = next;
}