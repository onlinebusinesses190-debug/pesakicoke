/**
 * PESAKI Forex — internal market engine.
 * Aggressive House Edge (B-Book) configuration.
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
  seed: number;
  tickIntervalMs: number;
  volatility: number;
  spreadPipsMin: number;
  spreadPipsMax: number;
  feePerLot: number;
  state: MarketState;
  initialPrices: Record<string, number>;
}

// ─── HOUSE LEDGER ───
export interface HouseLedger {
  totalStakes: number;
  totalPayouts: number;
  netProfit: number;
}

export const houseStats: HouseLedger = {
  totalStakes: 0,
  totalPayouts: 0,
  netProfit: 0,
};

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
  "KES/USD": 0.00769,
};

const num = (key: string, fallback: number) => {
  const raw = process.env[key];
  if (raw === undefined || raw === "") return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export function loadConfig(): EngineConfig {
  const initialPrices: Record<string, number> = { ...DEFAULT_INITIAL_PRICES };
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
    tickIntervalMs: Math.max(250, num("PESAKI_FX_TICK_MS", 300)),
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

function gaussianRandom(rng: () => number): number {
  let u = 0, v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

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

function tickSeed(master: number, symbol: string, counter: number): number {
  let h = master >>> 0;
  for (let i = 0; i < symbol.length; i++) {
    h = (Math.imul(h, 31) + symbol.charCodeAt(i)) >>> 0;
  }
  return Math.imul(h ^ counter, 2654435761) >>> 0;
}

export interface Candle {
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
  provider: string;
  state: MarketState;
  timestamp: string;
}

export interface EnginePersistence {
  loadSymbolState(): Promise<Record<string, { mid: number; tickCount: number }>>;
  loadCandles(symbol: string, interval: string, count: number): Promise<Candle[]>;
}

export class MarketEngine {
  private config: EngineConfig;
  private mid: Record<string, number> = {};
  private counter: Record<string, number> = {};
  private drift: Record<string, number> = {};
  private lastDriftChange: Record<string, number> = {};
  private candles: Record<string, Partial<Record<Interval, Candle[]>>> = {};
  private startedAt: number;
  private timer: NodeJS.Timeout | null = null;
  private _state: MarketState;
  private _historySeeded = false;

  // B-Book functions
  public exposureProvider?: (symbol: string) => number;
  public totalProfitProvider?: (symbol: string) => number; // Get total unrealized P/L for symbol

  onCandleComplete?: (symbol: string, interval: Interval, candle: Candle) => void;

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

  get state(): MarketState { return this._state; }
  getConfig(): EngineConfig { return this.config; }

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

  advance(symbol: string, atMs: number): Quote {
    const key = symbol.toUpperCase();
    const spec = getInstrumentSpec(key);
    if (!spec) throw new Error(`Unsupported symbol ${symbol}`);

    const n = this.counter[key]++;
    const rng = mulberry32(tickSeed(this.config.seed, key, n));

    if (atMs - (this.lastDriftChange[key] ?? atMs) > 30_000) {
      this.drift[key] = (rng() - 0.5) * 0.00004;
      this.lastDriftChange[key] = atMs;
    }

    const current = this.mid[key];
    const random = gaussianRandom(rng) * this.config.volatility * 0.5;
    const pull = (DEFAULT_INITIAL_PRICES[key] - current) / DEFAULT_INITIAL_PRICES[key];

    // ─── AGGRESSIVE HOUSE RISK MANAGEMENT (B-BOOK) ───
    let houseBias = 0;
    let dynamicSpread = 0; // Extra spread if users are winning too much

    if (this.exposureProvider && this.totalProfitProvider) {
      const netExposure = this.exposureProvider(key);
      const totalProfit = this.totalProfitProvider(key);
      
      // 1. Directional Bias (10x stronger than before)
      if (netExposure !== 0) {
        const rawBias = -netExposure * 0.000005; // Much stronger push
        const maxBias = this.config.volatility * 1.5; // Allow bias to overpower natural vol
        houseBias = Math.max(-maxBias, Math.min(maxBias, rawBias));
      }

      // 2. Stop-Loss Hunting / Profit Reduction
      // If users are in massive profit on this symbol, force the price back against them
      if (totalProfit > 50) { // If total user profit > $50
        const punishMultiplier = totalProfit * 0.0000001;
        houseBias -= Math.sign(netExposure || 1) * punishMultiplier;
      }

      // 3. Dynamic Spread Widening
      // If net exposure is huge, widen the spread to eat into their profits
      if (Math.abs(netExposure) > 5) { // If more than 5 lots net exposure
        dynamicSpread = spec.pipSize * 3; // Add 3 pips to spread
      }
    }
    // ───────────────────────────────────────────────

    // Compute candidate price
    const candidate = current + (this.drift[key] ?? 0) + houseBias + pull * current * 0.02 + random;

    // ─── STRICT ANTI-SPIKE FILTER (Max 1.5 pips per tick) ───
    const maxJump = spec.pipSize * 1.5; 
    const delta = candidate - current;
    let next: number;
    if (Math.abs(delta) > maxJump) {
      next = roundToDigits(current + Math.sign(delta) * maxJump, spec.digits);
    } else {
      next = roundToDigits(candidate, spec.digits);
    }

    this.mid[key] = next;

    // Base spread + dynamic spread
    let spreadPips = roundToDigits(this.config.spreadPipsMin + rng() * (this.config.spreadPipsMax - this.config.spreadPipsMin), 2);
    if (dynamicSpread > 0) spreadPips += roundToDigits(dynamicSpread / spec.pipSize, 2);

    const halfSpread = Math.max((spreadPips * spec.pipSize) / 2, 0.5 / Math.pow(10, spec.digits));

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

  // ... [Keep the rest of the functions: quote, quoteAll, recordTick, seedHistory, getCandles, getLatestCandle, getCandlesBefore, dailyChange, start, stop, hydrateMid, hydrateCounter, hydrateCandles, hydrate, snapshot] ...
  // (Assuming you copy the rest of your original file below this line)

  quote(symbol: string): Quote {
    const key = symbol.toUpperCase();
    const spec = getInstrumentSpec(key);
    if (!spec) throw new Error(`Unsupported symbol ${symbol}`);
    const mid = this.mid[key];
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

  private recordTick(symbol: string, price: number, atMs: number) {
    for (const [interval, seconds] of Object.entries(INTERVALS) as [Interval, number][]) {
      const bucketMs = seconds * 1000;
      const start = Math.floor(atMs / bucketMs) * bucketMs;
      const series = ((this.candles[symbol] ??= {})[interval] ??= []);
      const last = series[series.length - 1];
      if (!last || last.timestamp !== start) {
        if (last && this.onCandleComplete) {
          this.onCandleComplete(symbol, interval, last);
        }
        series.push({
          timestamp: start,
          open: price,
          high: price,
          low: price,
          close: price,
          tickVolume: 1,
        });
      } else {
        last.high = Math.max(last.high, price);
        last.low = Math.min(last.low, price);
        last.close = price;
        last.tickVolume += 1;
      }
      const cap = interval === "1D" ? 400 : 1500;
      if (series.length > cap) series.splice(0, series.length - cap);
    }
  }

  seedHistory(symbols: string[], now = Date.now()) {
    for (const symbol of symbols) {
      const spec = getInstrumentSpec(symbol);
      if (!spec) continue;
      const perDay = Math.max(1, Math.floor((86400 * 1000) / this.config.tickIntervalMs));

      const steps = Math.min(perDay, 1440);
      const rng = mulberry32(tickSeed(this.config.seed, symbol, 0));
      const series: Candle[] = [];
      let price = this.mid[symbol];
      const startMs = now - steps * this.config.tickIntervalMs;

      for (let i = 0; i < steps; i++) {
        const at = startMs + i * this.config.tickIntervalMs;
        const random = gaussianRandom(rng) * this.config.volatility * 0.5;
        const pull = (DEFAULT_INITIAL_PRICES[symbol] - price) / DEFAULT_INITIAL_PRICES[symbol];
        const candidate = price + pull * price * 0.02 + random;
        const maxJump = spec.pipSize * 1.5; // Strict cap for history too
        const delta = candidate - price;
        if (Math.abs(delta) > maxJump) {
          price = roundToDigits(price + Math.sign(delta) * maxJump, spec.digits);
        } else {
          price = roundToDigits(candidate, spec.digits);
        }
        const bucketMs = INTERVALS["1m"] * 1000;
        const bucket = Math.floor(at / bucketMs) * bucketMs;
        const last = series[series.length - 1];
        if (!last || last.timestamp !== bucket) {
          series.push({
            timestamp: bucket,
            open: price,
            high: price,
            low: price,
            close: price,
            tickVolume: 1,
          });
        } else {
          last.high = Math.max(last.high, price);
          last.low = Math.min(last.low, price);
          last.close = price;
          last.tickVolume += 1;
        }
      }
      this.candles[symbol]["1m"] = series;
      this.mid[symbol] = series.length ? series[series.length - 1].close : this.mid[symbol];

      for (const interval of Object.keys(INTERVALS) as Interval[]) {
        if (interval === "1m") continue;
        this.candles[symbol][interval] = aggregate(series, INTERVALS[interval]);
      }
    }
  }

  getCandles(symbol: string, interval: Interval, count: number, now = Date.now()): Candle[] {
    const key = symbol.toUpperCase();
    const spec = getInstrumentSpec(key);
    if (!spec) throw new Error(`Unsupported symbol ${symbol}`);

    const seconds = INTERVALS[interval];
    const bucketMs = seconds * 1000;
    const series = [...(this.candles[key][interval] ?? [])];
    const current = this.mid[key];

    let cursor = series.length
      ? series[series.length - 1].timestamp + bucketMs
      : Math.floor(now / bucketMs) * bucketMs;
    const target = Math.floor(now / bucketMs) * bucketMs;
    let guard = 0;
    while (cursor <= target && guard++ < count + 2) {
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

  getLatestCandle(symbol: string, interval: Interval): Candle | null {
    const key = symbol.toUpperCase();
    const series = this.candles[key]?.[interval];
    if (!series || series.length === 0) return null;

    const seconds = INTERVALS[interval];
    const bucketMs = seconds * 1000;
    const now = Date.now();
    const currentBucket = Math.floor(now / bucketMs) * bucketMs;

    const last = series[series.length - 1];
    if (last.timestamp < currentBucket) {
      const mid = this.mid[key];
      return {
        timestamp: currentBucket,
        open: last.close,
        high: Math.max(last.close, mid),
        low: Math.min(last.close, mid),
        close: mid,
        tickVolume: 0,
      };
    }
    return last;
  }

  getCandlesBefore(symbol: string, interval: Interval, beforeTs: number, count: number): { candles: Candle[]; hasMore: boolean } {
    const key = symbol.toUpperCase();
    const series = this.candles[key]?.[interval] ?? [];
    const filtered = series.filter((c) => c.timestamp < beforeTs);
    const hasMore = filtered.length >= count + 1;
    return {
      candles: filtered.slice(-count),
      hasMore,
    };
  }

  dailyChange(symbol: string) {
    const key = symbol.toUpperCase();
    const spec = getInstrumentSpec(key);
    if (!spec)
      return { pips: 0, percent: 0, high: null as number | null, low: null as number | null };
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
    if (!this._historySeeded) {
      this.seedHistory(symbols);
      this._historySeeded = true;
    }
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
    this.timer.unref?.();
    logger.info(this.describe(), "PESAKI Forex market engine started");
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  hydrateMid(symbol: string, price: number) {
    const spec = getInstrumentSpec(symbol);
    if (!spec || !Number.isFinite(price)) return;
    this.mid[symbol.toUpperCase()] = roundToDigits(price, spec.digits);
  }

  hydrateCounter(symbol: string, count: number) {
    const key = symbol.toUpperCase();
    if (this.counter[key] !== undefined && Number.isFinite(count) && count >= 0) {
      this.counter[key] = Math.floor(count);
    }
  }

  hydrateCandles(symbol: string, interval: Interval, candles: Candle[]) {
    const key = symbol.toUpperCase();
    if (!this.candles[key]) this.candles[key] = {};
    this.candles[key][interval] = candles;
  }

  async hydrate(persistence: EnginePersistence): Promise<void> {
    if (this._historySeeded) return;
    const symbols = Object.keys(INSTRUMENTS);

    try {
      const state = await persistence.loadSymbolState();
      let hydratedAny = false;
      for (const [symbol, s] of Object.entries(state)) {
        this.hydrateMid(symbol, s.mid);
        this.hydrateCounter(symbol, s.tickCount);
        if (INSTRUMENTS[symbol.toUpperCase()]) hydratedAny = true;
      }

      let candlesLoaded = 0;
      for (const symbol of symbols) {
        for (const [interval] of Object.entries(INTERVALS) as [Interval, number][]) {
          const loaded = await persistence.loadCandles(symbol, interval, 500);
          if (loaded.length > 0) {
            this.hydrateCandles(symbol, interval, loaded);
            candlesLoaded += loaded.length;
          }
        }
      }

      if (hydratedAny || candlesLoaded > 0) {
        this._historySeeded = true;
      }
      logger.info(
        { stateRows: Object.keys(state).length, candlesLoaded },
        "Forex engine hydrated from persistence",
      );
    } catch (err) {
      logger.warn(
        { err: (err as Error).message },
        "Forex persistence load failed — falling back to seed",
      );
    }

    if (!this._historySeeded) {
      this.seedHistory(symbols);
      this._historySeeded = true;
    }
  }

  snapshot(): Record<string, { mid: number; tickCount: number }> {
    const out: Record<string, { mid: number; tickCount: number }> = {};
    for (const symbol of Object.keys(INSTRUMENTS)) {
      out[symbol] = {
        mid: this.mid[symbol] ?? DEFAULT_INITIAL_PRICES[symbol] ?? 0,
        tickCount: this.counter[symbol] ?? 0,
      };
    }
    return out;
  }
}

export function aggregate(series: Candle[], seconds: number): Candle[] {
  const bucketMs = seconds * 1000;
  const out: Candle[] = [];
  for (const c of series) {
    const bucket = Math.floor(c.timestamp / bucketMs) * bucketMs;
    const last = out[out.length - 1];
    if (!last || last.timestamp !== bucket) {
      out.push({
        timestamp: bucket,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        tickVolume: c.tickVolume,
      });
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

export function setEngine(next: MarketEngine | null) {
  engine?.stop();
  engine = next;
}
