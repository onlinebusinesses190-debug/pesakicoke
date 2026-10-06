// Pesaki FX market engine — deterministic, shared by server and browser.
// Price of every pair is a pure function of (pair, time): the same for all users,
// survives refreshes, never "resets", yet is unpredictable to the eye.
// It is built from 7 layers of smooth random noise (seconds → days), each seeded per pair.

export interface Pair {
  symbol: string; label: string; name: string;
  base: number; digits: number; spreadPts: number; volMul: number;
}

export const PAIRS: Pair[] = [
  { symbol: "EURUSD", label: "EUR/USD", name: "Euro vs US Dollar", base: 1.0852, digits: 5, spreadPts: 12, volMul: 1 },
  { symbol: "GBPUSD", label: "GBP/USD", name: "British Pound vs US Dollar", base: 1.2648, digits: 5, spreadPts: 15, volMul: 1.15 },
  { symbol: "USDJPY", label: "USD/JPY", name: "US Dollar vs Japanese Yen", base: 149.52, digits: 3, spreadPts: 14, volMul: 1.1 },
  { symbol: "AUDUSD", label: "AUD/USD", name: "Australian Dollar vs US Dollar", base: 0.6551, digits: 5, spreadPts: 14, volMul: 1.2 },
  { symbol: "USDCAD", label: "USD/CAD", name: "US Dollar vs Canadian Dollar", base: 1.3602, digits: 5, spreadPts: 18, volMul: 0.9 },
  { symbol: "USDCHF", label: "USD/CHF", name: "US Dollar vs Swiss Franc", base: 0.8803, digits: 5, spreadPts: 16, volMul: 0.95 },
  { symbol: "NZDUSD", label: "NZD/USD", name: "New Zealand Dollar vs US Dollar", base: 0.6004, digits: 5, spreadPts: 18, volMul: 1.25 },
  { symbol: "EURJPY", label: "EUR/JPY", name: "Euro vs Japanese Yen", base: 162.24, digits: 3, spreadPts: 20, volMul: 1.2 },
  { symbol: "GBPJPY", label: "GBP/JPY", name: "British Pound vs Japanese Yen", base: 189.11, digits: 3, spreadPts: 28, volMul: 1.45 },
  { symbol: "XAUUSD", label: "XAU/USD", name: "Gold vs US Dollar", base: 2351.4, digits: 2, spreadPts: 30, volMul: 1.6 },
];

export const LEVERAGE = 10;
export const MIN_AMOUNT = 100;
export const MAX_AMOUNT = 100_000;
export const DEMO_START = 100_000;

export const TIMEFRAMES = { M1: 60, M5: 300, M15: 900, H1: 3600, H4: 14400 } as const;
export type TF = keyof typeof TIMEFRAMES;

export const getPair = (symbol: string) => PAIRS.find((p) => p.symbol === symbol);

const PERIODS = [2, 15, 90, 600, 3600, 21600, 259200];
// Accelerated synthetic practice prices; not a real forex feed.
const AMPS = PERIODS.map((p) => 0.00035 * Math.sqrt(p / 60) * (p <= 600 ? 35 : 4));

function strSeed(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h | 0;
}
const SEEDS: Record<string, number[]> = {};
for (const p of PAIRS) SEEDS[p.symbol] = PERIODS.map((_, k) => strSeed(`${p.symbol}#${k}`));

function hash(seed: number, i: number) {
  let h = Math.imul(i | 0, 0x27d4eb2d) ^ seed;
  h ^= h >>> 15; h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return ((h >>> 0) / 4294967295) * 2 - 1;
}
function noise(seed: number, x: number) {
  const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f);
  const a = hash(seed, i), b = hash(seed, i + 1);
  return a + (b - a) * u;
}

const round = (v: number, d: number) => Math.round(v * 10 ** d) / 10 ** d;

/** Mid price at unix time t (seconds, may be fractional). */
export function midAt(pair: Pair, t: number) {
  const seeds = SEEDS[pair.symbol];
  let x = 0;
  for (let k = 0; k < PERIODS.length; k++) x += AMPS[k] * noise(seeds[k], t / PERIODS[k]);
  return pair.base * Math.exp(x * pair.volMul);
}

export interface Quote { bid: number; ask: number; mid: number }
export function quoteAt(pair: Pair, t: number): Quote {
  const mid = midAt(pair, t);
  const half = (pair.spreadPts * 10 ** -pair.digits) / 2;
  return { bid: round(mid - half, pair.digits), ask: round(mid + half, pair.digits), mid };
}

export interface Candle { t: number; o: number; h: number; l: number; c: number }
export function candlesAt(pair: Pair, tf: TF, now: number, count: number): Candle[] {
  const sec = TIMEFRAMES[tf];
  const cur = Math.floor(now / sec) * sec;
  const out: Candle[] = [];
  const S = 20;
  for (let i = count - 1; i >= 0; i--) {
    const t0 = cur - i * sec;
    const t1 = Math.min(t0 + sec, now);
    let h = -Infinity, l = Infinity, o = 0, c = 0;
    for (let k = 0; k <= S; k++) {
      const p = midAt(pair, t0 + ((t1 - t0) * k) / S);
      if (k === 0) o = p;
      if (k === S) c = p;
      h = Math.max(h, p); l = Math.min(l, p);
    }
    out.push({ t: t0, o: round(o, pair.digits), h: round(h, pair.digits), l: round(l, pair.digits), c: round(c, pair.digits) });
  }
  return out;
}

/** Change vs 24h ago, in %. */
export function dayChange(pair: Pair, now: number) {
  return ((midAt(pair, now) - midAt(pair, now - 86400)) / midAt(pair, now - 86400)) * 100;
}

export type Side = "buy" | "sell";
/** Profit/loss in KSh: trade amount × price move %. Buy closes at bid, sell at ask. */
export function calcPnl(t: { side: Side; amount: number; entry: number }, q: Quote) {
  const exit = t.side === "buy" ? q.bid : q.ask;
  const dir = t.side === "buy" ? 1 : -1;
  return { exit, pnl: Math.round(t.amount * dir * ((exit - t.entry) / t.entry) * 100) / 100 };
}
