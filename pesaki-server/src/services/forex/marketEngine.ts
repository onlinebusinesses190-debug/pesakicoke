import { INSTRUMENTS, roundToDigits, type InstrumentSpec } from "./instruments";
import { logger } from "../../utils/logger";

export type MarketState = "open" | "paused" | "unavailable";

export const INTERVALS = {
  "1m": 60, "5m": 300, "15m": 900, "30m": 1800,
  "1H": 3600, "4H": 14400, "1D": 86400, "1W": 604800, "1M": 2592000,
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
  "EUR/USD": 1.1298, "GBP/USD": 1.2874, "USD/JPY": 151.42,
  "USD/CHF": 0.8896, "AUD/USD": 0.6612, "USD/CAD": 1.3592,
  "NZD/USD": 0.6088, "EUR/GBP": 0.8777, "EUR/JPY": 171.06,
  "GBP/JPY": 194.88, "KES/USD": 0.00769,
};

const num = (key: string, fallback: number) => {
  const raw = process.env[key];
  if (raw === undefined || raw === "") return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export function loadConfig(): EngineConfig {
  const initialPrices: Record<string, number> = { ...DEFAULT_INITIAL_PRICES };
  const state = process.env.PESAKI_FX_MARKET_STATE as MarketState | undefined;

  return {
    seed: num("PESAKI_FX_SEED", 20260101),
    tickIntervalMs: Math.max(200, num("PESAKI_FX_TICK_MS", 200)),
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
  
  // Used in describe() to fix TS6133
  private startedAt: number; 
  
  private timer: NodeJS.Timeout | null = null;
  private _state: MarketState;
  private _historySeeded = false;

  public exposureProvider?: (symbol: string) => number;
  public totalProfitProvider?: (symbol: string) => number;
  onCandleComplete?: (symbol: string, interval: Interval, candle: Candle) => void;

  constructor(config: EngineConfig, now = Date.now()) {
    this.config = config;
    this.startedAt = now;
    this._state = config.state;
    for (const symbol of Object.keys(INSTRUMENTS)) {
      this.counter[symbol] = 0;
      this.candles[symbol] = {};
      const price = config.initialPrices[symbol] ?? 1.0;
      this.mid[symbol] = roundToDigits(price, INSTRUMENTS[symbol].digits);
    }
  }

  get state(): MarketState { return this._state; }

  // FIXES TS2339: Property 'describe' does not exist
  describe() {
    return {
      provider: "pesaki-engine",
      state: this._state,
      startedAt: new Date(this.startedAt).toISOString(),
      tickIntervalMs: this.config.tickIntervalMs,
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
    const random = gaussianRandom(rng) * this.config.volatility * 0.15;
    const pull = (DEFAULT_INITIAL_PRICES[key] - current) / DEFAULT_INITIAL_PRICES[key];

    let houseBias = 0;
    let dynamicSpread = 0;
    if (this.exposureProvider && this.totalProfitProvider) {
      const netExposure = this.exposureProvider(key);
      const totalProfit = this.totalProfitProvider(key);
      
      if (netExposure !== 0) {
        const rawBias = -netExposure * 0.000005; 
        const maxBias = this.config.volatility * 1.5; 
        houseBias = Math.max(-maxBias, Math.min(maxBias, rawBias));
      }
      if (totalProfit > 50) {
        const punishMultiplier = totalProfit * 0.0000001;
        houseBias -= Math.sign(netExposure || 1) * punishMultiplier;
      }
      if (Math.abs(netExposure) > 5) dynamicSpread = spec.pipSize * 3;
    }

    const candidate = current + (this.drift[key] ?? 0) + houseBias + pull * current * 0.02 + random;
    let next = roundToDigits(candidate, spec.digits);

    const maxJump = spec.pipSize * 1.5; 
    if (Math.abs(next - current) > maxJump) {
      next = roundToDigits(current + Math.sign(next - current) * maxJump, spec.digits);
    }

    this.mid[key] = next;

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

  quote(symbol: string): Quote {
    const key = symbol.toUpperCase();
    const spec = getInstrumentSpec(key);
    if (!spec) throw new Error(`Unsupported symbol ${symbol}`);
    const mid = this.mid[key];
    const spreadPips = this.config.spreadPipsMin;
    const halfSpread = (spreadPips * spec.pipSize) / 2;
    return {
      symbol: key, bid: roundToDigits(mid - halfSpread, spec.digits),
      ask: roundToDigits(mid + halfSpread, spec.digits), mid, spreadPips,
      provider: "pesaki-engine", state: this._state, timestamp: new Date().toISOString(),
    };
  }

  // FIXES TS2339: Property 'quoteAll' does not exist
  quoteAll(symbols: string[]): Quote[] {
    return symbols
      .filter(s => getInstrumentSpec(s) !== undefined)
      .map(s => this.quote(s));
  }

  // FIXES TS2339: Property 'dailyChange' does not exist
  dailyChange(symbol: string) {
    const key = symbol.toUpperCase();
    const spec = getInstrumentSpec(key);
    if (!spec) return { pips: 0, percent: 0 };

    const dayCandles = this.candles[key]?.["1D"] || [];
    const openPrice = dayCandles.length > 0 ? dayCandles[0].open : (this.config.initialPrices[key] ?? 1.0);
    const currentPrice = this.mid[key];
    
    const diff = currentPrice - openPrice;
    return {
      pips: roundToDigits(diff / spec.pipSize, 1),
      percent: roundToDigits((diff / openPrice) * 100, 2),
    };
  }

  // FIXES TS2339: Property 'getCandles' does not exist
  getCandles(symbol: string, interval: Interval, count: number, now = Date.now()): Candle[] {
    const key = symbol.toUpperCase();
    const series = this.candles[key]?.[interval] || [];
    
    // If we have enough, return the last 'count'
    if (series.length > 0) return series.slice(-count);
    
    // If history is empty, generate some on the fly so the chart doesn't break
    const spec = getInstrumentSpec(key);
    const out: Candle[] = [];
    let p = this.mid[key] || 1.0;
    const step = INTERVALS[interval] * 1000;
    const bucket = Math.floor(now / step) * step;

    for (let i = count; i >= 0; i--) {
      const t = bucket - (i * step);
      const o = p;
      p = p + ((Math.random() - 0.5) * (spec ? spec.pipSize * 10 : 0.001));
      const c = p;
      const h = Math.max(o, c) + (spec ? spec.pipSize * 2 : 0.0002);
      const l = Math.min(o, c) - (spec ? spec.pipSize * 2 : 0.0002);
      out.push({ timestamp: t, open: o, high: h, low: l, close: c, tickVolume: 1 });
    }
    return out;
  }

  private recordTick(symbol: string, price: number, atMs: number) {
    for (const [interval, seconds] of Object.entries(INTERVALS) as [Interval, number][]) {
      const bucketMs = seconds * 1000;
      const start = Math.floor(atMs / bucketMs) * bucketMs;
      const series = ((this.candles[symbol] ??= {})[interval] ??= []);
      const last = series[series.length - 1];
      if (!last || last.timestamp !== start) {
        if (last && this.onCandleComplete) this.onCandleComplete(symbol, interval, last);
        series.push({ timestamp: start, open: price, high: price, low: price, close: price, tickVolume: 1 });
      } else {
        last.high = Math.max(last.high, price);
        last.low = Math.min(last.low, price);
        last.close = price;
        last.tickVolume += 1;
      }
      if (series.length > 1500) series.splice(0, series.length - 1500);
    }
  }

  seedHistory(symbols: string[], now = Date.now()) {
    // History generation logic (same as before)
    for (const symbol of symbols) {
      const spec = getInstrumentSpec(symbol);
      if (!spec) continue;
      const steps = 1440; 
      const rng = mulberry32(tickSeed(this.config.seed, symbol, 0));
      const series: Candle[] = [];
      let price = this.mid[symbol];
      const startMs = now - steps * this.config.tickIntervalMs;

      for (let i = 0; i < steps; i++) {
        const at = startMs + i * this.config.tickIntervalMs;
        const random = gaussianRandom(rng) * this.config.volatility * 0.15;
        const pull = (DEFAULT_INITIAL_PRICES[symbol] - price) / DEFAULT_INITIAL_PRICES[symbol];
        const candidate = price + pull * price * 0.02 + random;
        const maxJump = spec.pipSize * 1.5;
        const delta = candidate - price;
        
        if (Math.abs(delta) > maxJump) price = roundToDigits(price + Math.sign(delta) * maxJump, spec.digits);
        else price = roundToDigits(candidate, spec.digits);
        
        const bucket = Math.floor(at / 60000) * 60000;
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
      this.mid[symbol] = series.length ? series[series.length - 1].close : this.mid[symbol];

      for (const interval of Object.keys(INTERVALS) as Interval[]) {
        if (interval === "1m") continue;
        this.candles[symbol][interval] = this.aggregate(series, INTERVALS[interval]);
      }
    }
  }

  private aggregate(series: Candle[], seconds: number): Candle[] {
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
        try { this.advance(symbol, at); } catch (err) { logger.error(err, "Tick failed"); }
      }
    }, this.config.tickIntervalMs);
    this.timer.unref?.();
  }

  stop() { if (this.timer) clearInterval(this.timer); this.timer = null; }

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

      for (const symbol of symbols) {
        for (const [interval] of Object.entries(INTERVALS) as [Interval, number][]) {
          const loaded = await persistence.loadCandles(symbol, interval, 500);
          if (loaded.length > 0) this.hydrateCandles(symbol, interval, loaded);
        }
      }
      if (hydratedAny) this._historySeeded = true;
    } catch (err) {
      logger.warn("Persistence load failed");
    }
    if (!this._historySeeded) {
      this.seedHistory(symbols);
      this._historySeeded = true;
    }
  }

  snapshot(): Record<string, { mid: number; tickCount: number }> {
    const out: Record<string, { mid: number; tickCount: number }> = {};
    for (const symbol of Object.keys(INSTRUMENTS)) {
      out[symbol] = { mid: this.mid[symbol] ?? 0, tickCount: this.counter[symbol] ?? 0 };
    }
    return out;
  }
}

// ─── EXPORTS ───
let engine: MarketEngine | null = null;

export function getEngine(): MarketEngine {
  if (!engine) engine = new MarketEngine(loadConfig());
  return engine;
}

export function setEngine(next: MarketEngine | null) {
  engine?.stop();
  engine = next;
}
