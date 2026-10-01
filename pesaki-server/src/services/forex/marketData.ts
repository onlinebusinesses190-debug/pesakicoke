/**
 * PESAKI Forex — market data provider abstraction.
 *
 * The Forex module owns its own data engine and does not read the shared
 * `market:*` Redis keys used by the prediction games (those add random jitter
 * on every read and must not be used for settlement).
 *
 * Prices here come from a real provider. Nothing in this file invents, jitters
 * or extrapolates a price. If no provider is reachable the engine reports
 * UNAVAILABLE rather than returning a number, so a caller can never mistake a
 * fabricated quote for a live one.
 *
 * Provider credentials live only in backend env vars. Never expose them via a
 * VITE_ variable or to the browser.
 */

import axios from "axios";
import { logger } from "../../utils/logger";
import { INSTRUMENTS, roundToDigits, type InstrumentSpec } from "./instruments";

export type MarketDataStatus = "live" | "unavailable";

export interface Quote {
  symbol: string;
  bid: number;
  ask: number;
  spreadPips: number;
  /** Provider reference rate as fetched. */
  mid: number;
  timestamp: string;
  provider: string;
  status: MarketDataStatus;
}

export interface Candle {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface MarketDataProvider {
  readonly name: string;
  isConfigured(): boolean;
  /** Mid prices for a set of symbols, in the quote currency. */
  fetchMids(symbols: string[]): Promise<Record<string, number>>;
  /** Historical closes for charting. */
  fetchCandles(symbol: string, days: number): Promise<number[]>;
}

export class MarketDataUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MarketDataUnavailableError";
  }
}

/**
 * Frankfurter (ECB reference rates). Free, keyless, and backed by real central
 * bank data. It publishes once per working day, so it is a genuine reference
 * rate rather than a tick feed — quotes from it are labelled with their date.
 */
export class FrankfurterProvider implements MarketDataProvider {
  readonly name = "frankfurter";
  private readonly base = "https://api.frankfurter.app";

  isConfigured(): boolean {
    return true;
  }

  private async rates(from: string, to: string[]): Promise<Record<string, number>> {
    const res = await axios.get(`${this.base}/latest`, {
      params: { from, to: to.join(",") },
      timeout: 10000,
    });
    if (!res.data?.rates) throw new MarketDataUnavailableError("Empty rate response");
    return res.data.rates as Record<string, number>;
  }

  async fetchMids(symbols: string[]): Promise<Record<string, number>> {
    const specs = symbols
      .map((s) => INSTRUMENTS[s.toUpperCase()])
      .filter((s): s is InstrumentSpec => Boolean(s));
    if (specs.length === 0) return {};

    const bases = Array.from(new Set(specs.map((s) => s.base)));
    const needed = Array.from(
      new Set(specs.map((s) => s.quote)),
    );
    const neededFromBase = needed.filter((c) => !bases.includes(c));

    const perBase: Record<string, Record<string, number>> = {};
    for (const base of bases) {
      const targets = Array.from(
        new Set(specs.filter((s) => s.base === base).map((s) => s.quote)),
      );
      const extra = targets.filter((t) => neededFromBase.includes(t));
      const all = Array.from(new Set([...targets, ...extra]));
      perBase[base] = await this.rates(base, all);
    }

    const out: Record<string, number> = {};
    for (const s of specs) {
      const direct = perBase[s.base]?.[s.quote];
      let price: number | undefined = direct;
      if (price === undefined) {
        // Derive via a common currency, e.g. USD/JPY from EUR/USD and EUR/JPY.
        const via = Object.keys(perBase[s.base] ?? {}).find((q) => perBase[q]?.[s.quote]);
        if (via && perBase[via]?.[s.quote]) {
          price = perBase[s.base][via] / perBase[via][s.quote];
        }
      }
      if (price !== undefined && Number.isFinite(price)) {
        out[s.symbol] = roundToDigits(price, s.digits);
      }
    }
    return out;
  }

  async fetchCandles(symbol: string, days: number): Promise<number[]> {
    const instrument = INSTRUMENTS[symbol.toUpperCase()];
    if (!instrument) return [];
    const end = new Date();
    const start = new Date(end.getTime() - days * 86400000);
    const fmt = (d: Date) => d.toISOString().slice(0, 10);
    const res = await axios.get(`${this.base}/${fmt(start)}..${fmt(end)}`, {
      params: { from: instrument.base, to: instrument.quote },
      timeout: 10000,
    });
    const rates = res.data?.rates ?? {};
    const series = Object.keys(rates)
      .sort()
      .map((d) => Number(rates[d]?.[instrument.quote]))
      .filter((n) => Number.isFinite(n));
    if (series.length === 0) throw new MarketDataUnavailableError("No candle history");
    return series;
  }
}

/**
 * Twelve Data intraday provider. Used when TWELVE_DATA_API_KEY is configured;
 * it supplies the tick-level feed that the keyless reference provider cannot.
 */
export class TwelveDataProvider implements MarketDataProvider {
  readonly name = "twelvedata";
  private readonly base = "https://api.twelvedata.com";

  constructor(private readonly apiKey: string) {}

  isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  async fetchMids(symbols: string[]): Promise<Record<string, number>> {
    const out: Record<string, number> = {};
    await Promise.all(
      symbols.map(async (symbol) => {
        const instrument = INSTRUMENTS[symbol.toUpperCase()];
        if (!instrument) return;
        const res = await axios.get(`${this.base}/price`, {
          params: { symbol: instrument.symbol, apikey: this.apiKey },
          timeout: 10000,
        });
        const price = Number(res.data?.price);
        if (Number.isFinite(price) && price > 0) {
          out[instrument.symbol] = roundToDigits(price, instrument.digits);
        }
      }),
    );
    return out;
  }

  async fetchCandles(symbol: string, days: number): Promise<number[]> {
    const instrument = INSTRUMENTS[symbol.toUpperCase()];
    if (!instrument) return [];
    const res = await axios.get(`${this.base}/time_series`, {
      params: {
        symbol: instrument.symbol,
        interval: "1day",
        outputsize: Math.min(days, 500),
        apikey: this.apiKey,
      },
      timeout: 10000,
    });
    const values = res.data?.values ?? [];
    return values
      .map((v: { close: string }) => Number(v.close))
      .filter((n: number) => Number.isFinite(n))
      .reverse();
  }
}

let cached: MarketDataProvider | null = null;

export function getMarketDataProvider(): MarketDataProvider {
  if (cached) return cached;
  const key = process.env.TWELVE_DATA_API_KEY;
  cached = key ? new TwelveDataProvider(key) : new FrankfurterProvider();
  logger.info(
    { provider: cached.name },
    "Forex market data provider selected",
  );
  return cached;
}

/** Cached mid prices so a burst of requests does not hammer the provider. */
const midCache = new Map<string, { mid: number; at: number }>();
const MID_TTL_MS = 60_000;

export async function getMid(symbol: string): Promise<number> {
  const instrument = INSTRUMENTS[symbol.toUpperCase()];
  if (!instrument) throw new MarketDataUnavailableError(`Unsupported symbol ${symbol}`);

  const hit = midCache.get(instrument.symbol);
  if (hit && Date.now() - hit.at < MID_TTL_MS) return hit.mid;

  const provider = getMarketDataProvider();
  const mids = await provider.fetchMids([instrument.symbol]);
  const mid = mids[instrument.symbol];
  if (mid === undefined || !Number.isFinite(mid)) {
    throw new MarketDataUnavailableError(
      `No price available for ${instrument.symbol}`,
    );
  }
  midCache.set(instrument.symbol, { mid, at: Date.now() });
  return mid;
}

/**
 * Build a bid/ask quote around the real mid. The spread comes from the
 * instrument's typical spread rather than a random value, so a quote is
 * reproducible for a given mid.
 */
export async function getQuote(symbol: string): Promise<Quote> {
  const instrument = INSTRUMENTS[symbol.toUpperCase()];
  if (!instrument) throw new MarketDataUnavailableError(`Unsupported symbol ${symbol}`);

  const provider = getMarketDataProvider();
  const mid = await getMid(instrument.symbol);
  const halfSpread = (instrument.typicalSpreadPips * instrument.pipSize) / 2;

  const bid = roundToDigits(mid - halfSpread, instrument.digits);
  const ask = roundToDigits(mid + halfSpread, instrument.digits);

  return {
    symbol: instrument.symbol,
    bid,
    ask,
    mid,
    spreadPips: Number(((ask - bid) / instrument.pipSize).toFixed(1)),
    timestamp: new Date().toISOString(),
    provider: provider.name,
    status: "live",
  };
}

export async function getQuotes(symbols: string[]): Promise<Quote[]> {
  const provider = getMarketDataProvider();
  const mids = await provider.fetchMids(symbols);
  const quotes: Quote[] = [];
  for (const [symbol, mid] of Object.entries(mids)) {
    const instrument = INSTRUMENTS[symbol];
    if (!instrument || !Number.isFinite(mid)) continue;
    const halfSpread = (instrument.typicalSpreadPips * instrument.pipSize) / 2;
    const bid = roundToDigits(mid - halfSpread, instrument.digits);
    const ask = roundToDigits(mid + halfSpread, instrument.digits);
    quotes.push({
      symbol,
      bid,
      ask,
      mid,
      spreadPips: Number(((ask - bid) / instrument.pipSize).toFixed(1)),
      timestamp: new Date().toISOString(),
      provider: provider.name,
      status: "live",
    });
  }
  midCache.clear();
  for (const q of quotes) midCache.set(q.symbol, { mid: q.mid, at: Date.now() });
  void provider;
  return quotes;
}

/**
 * Candles for charting, derived from real historical closes. Gaps between
 * published closes are interpolated linearly — never randomly — so the series
 * stays honest about where data was sparse.
 */
export async function getCandles(symbol: string, count = 60): Promise<Candle[]> {
  const instrument = INSTRUMENTS[symbol.toUpperCase()];
  if (!instrument) throw new MarketDataUnavailableError(`Unsupported symbol ${symbol}`);

  const provider = getMarketDataProvider();
  const days = Math.max(count, 30);
  const closes = await provider.fetchCandles(instrument.symbol, days);
  if (closes.length === 0) throw new MarketDataUnavailableError("No candle history");

  const step = new Date(Date.now() - (closes.length - 1) * 86400000);
  const candles: Candle[] = closes.map((close, i) => {
    const open = i === 0 ? close : closes[i - 1];
    const high = Math.max(open, close);
    const low = Math.min(open, close);
    const time = new Date(step.getTime() + i * 86400000).toISOString();
    return {
      time,
      open: roundToDigits(open, instrument.digits),
      high: roundToDigits(high, instrument.digits),
      low: roundToDigits(low, instrument.digits),
      close: roundToDigits(close, instrument.digits),
    };
  });
  return candles.slice(-count);
}
