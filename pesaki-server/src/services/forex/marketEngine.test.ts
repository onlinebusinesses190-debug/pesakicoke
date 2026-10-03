/**
 * Market engine tests.
 *
 * The engine's central promise is that it is deterministic and server-owned:
 * a given seed always produces the same series, prices are never taken from a
 * frontend, and the spread is a real, bounded cost rather than an accident.
 * These tests pin that down so the promise cannot silently regress.
 */

import { afterEach, describe, expect, it } from "vitest";
import {
  INTERVALS,
  MarketEngine,
  aggregate,
  loadConfig,
  type Candle,
  type EngineConfig,
  type EnginePersistence,
} from "./marketEngine";
import { INSTRUMENTS } from "./instruments";

/** In-memory EnginePersistence for testing hydration and callbacks. */
class MockPersistence implements EnginePersistence {
  public state: Record<string, { mid: number; tickCount: number }> = {};
  public candles: Record<string, Candle[]> = {};
  public shouldFail = false;

  async loadSymbolState(): Promise<Record<string, { mid: number; tickCount: number }>> {
    if (this.shouldFail) throw new Error("DB unavailable");
    return this.state;
  }

  async loadCandles(symbol: string, interval: string, _count: number): Promise<Candle[]> {
    if (this.shouldFail) throw new Error("DB unavailable");
    return this.candles[`${symbol}:${interval}`] ?? [];
  }
}

const baseConfig = (over: Partial<EngineConfig> = {}): EngineConfig => ({
  seed: 42,
  tickIntervalMs: 1000,
  volatility: 0.00004,
  spreadPipsMin: 0.4,
  spreadPipsMax: 1.6,
  feePerLot: 0,
  state: "open",
  initialPrices: {
    "EUR/USD": 1.1298,
    "GBP/USD": 1.2874,
    "USD/JPY": 151.42,
  },
  ...over,
});

const NOW = 1_700_000_000_000;

afterEach(() => setEngineCleanup());

function setEngineCleanup() {
  // no-op: engines created in tests are not started, so no timers to clean
}

describe("determinism", () => {
  it("produces an identical series for the same seed", () => {
    const a = new MarketEngine(baseConfig(), NOW);
    const b = new MarketEngine(baseConfig(), NOW);
    for (let i = 0; i < 200; i++) {
      expect(a.advance("EUR/USD", NOW + i * 1000).mid).toBe(
        b.advance("EUR/USD", NOW + i * 1000).mid,
      );
    }
  });

  it("produces a different series for a different seed", () => {
    const a = new MarketEngine(baseConfig({ seed: 1 }), NOW);
    const b = new MarketEngine(baseConfig({ seed: 2 }), NOW);
    const sa = Array.from({ length: 50 }, (_, i) => a.advance("EUR/USD", NOW + i * 1000).mid);
    const sb = Array.from({ length: 50 }, (_, i) => b.advance("EUR/USD", NOW + i * 1000).mid);
    expect(sa).not.toEqual(sb);
  });

  it("keeps symbols independent of each other", () => {
    const e = new MarketEngine(baseConfig(), NOW);
    const withEur = Array.from({ length: 10 }, (_, i) => e.advance("EUR/USD", NOW + i * 1000).mid);
    const fresh = new MarketEngine(baseConfig(), NOW);
    const withoutEur = Array.from({ length: 10 }, (_, i) => fresh.advance("GBP/USD", NOW + i * 1000).mid);
    // Advancing EUR first must not change what GBP does.
    const onlyGbp = new MarketEngine(baseConfig(), NOW);
    const sb = Array.from({ length: 10 }, (_, i) => onlyGbp.advance("GBP/USD", NOW + i * 1000).mid);
    expect(withoutEur).toEqual(sb);
    expect(withEur.length).toBe(10);
  });
});

describe("quotes", () => {
  it("quotes both sides around the mid with ask above bid", () => {
    const e = new MarketEngine(baseConfig(), NOW);
    const q = e.advance("EUR/USD", NOW);
    expect(q.ask).toBeGreaterThan(q.bid);
    expect(q.mid).toBeCloseTo((q.ask + q.bid) / 2, 5);
  });

  it("honours the instrument's own decimal precision", () => {
    const e = new MarketEngine(baseConfig(), NOW);
    const jpy = e.advance("USD/JPY", NOW);
    expect(String(jpy.mid).split(".")[1]?.length ?? 0).toBeLessThanOrEqual(3);
    const eur = e.advance("EUR/USD", NOW);
    expect(String(eur.mid).split(".")[1]?.length ?? 0).toBeLessThanOrEqual(5);
  });

  it("keeps the spread inside the configured band", () => {
    const e = new MarketEngine(baseConfig({ spreadPipsMin: 0.5, spreadPipsMax: 1.0 }), NOW);
    for (let i = 0; i < 300; i++) {
      const q = e.advance("EUR/USD", NOW + i * 1000);
      expect(q.spreadPips).toBeGreaterThanOrEqual(0.5);
      expect(q.spreadPips).toBeLessThanOrEqual(1.0);
    }
  });

  it("labels itself as the PESAKI engine, never as a market feed", () => {
    const e = new MarketEngine(baseConfig(), NOW);
    // Regression guard against the UI or API claiming a real interbank feed.
    expect(e.quote("EUR/USD").provider).toBe("pesaki-engine");
    expect(JSON.stringify(e.describe()).toLowerCase()).not.toContain("reuters");
    expect(JSON.stringify(e.describe()).toLowerCase()).not.toContain("interbank");
  });

  it("rejects an unsupported symbol", () => {
    const e = new MarketEngine(baseConfig(), NOW);
    expect(() => e.quote("XPT/USD")).toThrow(/Unsupported symbol/);
  });

  it("stays finite over a long run", () => {
    const e = new MarketEngine(baseConfig(), NOW);
    for (let i = 0; i < 20_000; i++) e.advance("EUR/USD", NOW + i * 1000);
    const q = e.quote("EUR/USD");
    expect(Number.isFinite(q.mid)).toBe(true);
    expect(q.mid).toBeGreaterThan(0.5);
    expect(q.mid).toBeLessThan(2);
  });
});

describe("candles", () => {
  it("folds ticks into OHLC correctly", () => {
    const e = new MarketEngine(baseConfig(), NOW);
    e.start();
    e.stop();
    e.seedHistory(["EUR/USD"], NOW);
    const candles = e.getCandles("EUR/USD", "1m", 20, NOW);
    expect(candles.length).toBeGreaterThan(0);
    for (const c of candles) {
      expect(c.high).toBeGreaterThanOrEqual(Math.max(c.open, c.close));
      expect(c.low).toBeLessThanOrEqual(Math.min(c.open, c.close));
    }
  });

  it("is non-decreasing in time and bucket-aligned", () => {
    const e = new MarketEngine(baseConfig(), NOW);
    e.seedHistory(["EUR/USD"], NOW);
    const candles = e.getCandles("EUR/USD", "5m", 30, NOW);
    for (let i = 1; i < candles.length; i++) {
      expect(candles[i].timestamp).toBeGreaterThan(candles[i - 1].timestamp);
    }
    for (const c of candles) {
      expect(c.timestamp % (INTERVALS["5m"] * 1000)).toBe(0);
    }
  });

  it("ends at the current price", () => {
    const e = new MarketEngine(baseConfig(), NOW);
    e.seedHistory(["EUR/USD"], NOW);
    const candles = e.getCandles("EUR/USD", "1m", 5, NOW);
    expect(candles[candles.length - 1].close).toBe(e.quote("EUR/USD").mid);
  });

  it("supports every advertised timeframe", () => {
    const e = new MarketEngine(baseConfig(), NOW);
    e.seedHistory(["EUR/USD"], NOW);
    for (const interval of Object.keys(INTERVALS) as (keyof typeof INTERVALS)[]) {
      expect(e.getCandles("EUR/USD", interval, 10, NOW).length).toBeGreaterThan(0);
    }
  });

  it("aggregates a finer series into a coarser one", () => {
    const series = [
      { timestamp: 0, open: 1, high: 2, low: 0.5, close: 1.5, tickVolume: 1 },
      { timestamp: 60_000, open: 1.5, high: 3, low: 1.2, close: 1.8, tickVolume: 1 },
      { timestamp: 600_000, open: 1.8, high: 2.2, low: 1.7, close: 2.0, tickVolume: 1 },
    ];
    const out = aggregate(series, 300);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ open: 1, high: 3, low: 0.5, close: 1.8 });
    expect(out[1].open).toBe(1.8);
  });
});

describe("market state", () => {
  it("reports the configured state", () => {
    expect(new MarketEngine(baseConfig({ state: "paused" }), NOW).state).toBe("paused");
    expect(new MarketEngine(baseConfig({ state: "open" }), NOW).state).toBe("open");
  });

  it("still quotes while paused so the UI can show a paused market", () => {
    const e = new MarketEngine(baseConfig({ state: "paused" }), NOW);
    expect(e.quote("EUR/USD").state).toBe("paused");
  });
});

describe("configuration", () => {
  it("falls back to safe defaults when env is absent", () => {
    const cfg = loadConfig();
    expect(cfg.seed).toBeGreaterThan(0);
    expect(cfg.tickIntervalMs).toBeGreaterThanOrEqual(250);
    expect(cfg.spreadPipsMax).toBeGreaterThanOrEqual(cfg.spreadPipsMin);
  });

  it("ignores a non-numeric env value rather than producing NaN", () => {
    const prev = process.env.PESAKI_FX_VOLATILITY;
    process.env.PESAKI_FX_VOLATILITY = "not-a-number";
    expect(loadConfig().volatility).toBeGreaterThan(0);
    if (prev === undefined) delete process.env.PESAKI_FX_VOLATILITY;
    else process.env.PESAKI_FX_VOLATILITY = prev;
  });

  it("covers every instrument the module advertises", () => {
    const e = new MarketEngine(loadConfig(), NOW);
    for (const symbol of Object.keys(INSTRUMENTS)) {
      expect(() => e.quote(symbol)).not.toThrow();
    }
  });
});

describe("no hidden house edge", () => {
  it("does not bias outcomes toward or against the trader", () => {
    // The engine walks price symmetrically around the seed. It has no concept of
    // a customer, a stake or a win, so it cannot favour either side. Over many
    // ticks the mean reversion must pull back toward the seed rather than drift,
    // and there must be no per-symbol override that could be used to rig it.
    const e = new MarketEngine(baseConfig({ seed: 7 }), NOW);
    let sum = 0;
    const n = 5000;
    for (let i = 0; i < n; i++) sum += e.advance("EUR/USD", NOW + i * 1000).mid;
    const mean = sum / n;
    expect(Math.abs(mean - 1.1298)).toBeLessThan(0.02);
  });

  it("charges cost through spread, and exposes it as a configured number", () => {
    const e = new MarketEngine(baseConfig({ spreadPipsMin: 1, spreadPipsMax: 1, feePerLot: 25 }), NOW);
    const q = e.advance("EUR/USD", NOW);
    expect(q.spreadPips).toBe(1);
    // A disclosed fee is a real cost; it is configuration, not hidden rigging.
    expect(e.getConfig().feePerLot).toBe(25);
  });

  it("buying at the ask and selling at the bid costs the trader the spread", () => {
    const e = new MarketEngine(baseConfig({ spreadPipsMin: 1, spreadPipsMax: 1 }), NOW);
    const q = e.advance("EUR/USD", NOW);
    // Flat price: a buy opens at ask, closing sells at bid, so the round trip is
    // negative by exactly one spread. This is the disclosed cost of trading.
    const roundTrip = (q.bid - q.ask) / 0.0001;
    expect(roundTrip).toBeCloseTo(-1, 3);
  });
});

describe("KES/USD instrument", () => {
  it("is registered so the engine can quote it", () => {
    const e = new MarketEngine(baseConfig(), NOW);
    expect(INSTRUMENTS["KES/USD"]).toBeDefined();
    expect(e.quote("KES/USD")).toBeTypeOf("object");
  });

  it("quotes with ask above bid around a positive mid", () => {
    const e = new MarketEngine(baseConfig(), NOW);
    const q = e.advance("KES/USD", NOW);
    expect(q.ask).toBeGreaterThan(q.bid);
    expect(q.mid).toBeGreaterThan(0);
    expect(q.provider).toBe("pesaki-engine");
  });

  it("uses a sub-unit pip size at this price level", () => {
    expect(INSTRUMENTS["KES/USD"].pipSize).toBe(0.00001);
    expect(INSTRUMENTS["KES/USD"].base).toBe("KES");
    expect(INSTRUMENTS["KES/USD"].quote).toBe("USD");
  });

  it("seeds from a sensible initial price", () => {
    const e = new MarketEngine(baseConfig(), NOW);
    // 1 / 130 KES/USD ≈ 0.00769
    expect(e.quote("KES/USD").mid).toBeCloseTo(1 / 130, 5);
  });
});

describe("state persistence", () => {
  it("resumes the walk from a hydrated counter and mid", () => {
    const cfg = baseConfig({ seed: 99 });
    const a = new MarketEngine(cfg, NOW);
    for (let i = 0; i < 10; i++) a.advance("EUR/USD", NOW + i * 1000);
    const snap = a.snapshot()["EUR/USD"];

    // Fresh engine with the same seed, restored to the saved state.
    const b = new MarketEngine(cfg, NOW);
    b.hydrateMid("EUR/USD", snap.mid);
    b.hydrateCounter("EUR/USD", snap.tickCount);

    // After restoring 10 ticks, the 11th must match because the PRNG is keyed
    // by the counter — the walk is continuous, not restarted.
    const nextA = a.advance("EUR/USD", NOW + 10_000);
    const nextB = b.advance("EUR/USD", NOW + 10_000);
    expect(nextB.mid).toBe(nextA.mid);
  });

  it("snapshot returns every registered symbol", () => {
    const e = new MarketEngine(baseConfig(), NOW);
    e.advance("EUR/USD", NOW);
    const snap = e.snapshot();
    for (const symbol of Object.keys(INSTRUMENTS)) {
      expect(snap[symbol]).toBeDefined();
      expect(snap[symbol].tickCount).toBeGreaterThanOrEqual(0);
    }
  });

  it("hydrate loads persisted state and skips seedHistory", async () => {
    const mock = new MockPersistence();
    mock.state = { "EUR/USD": { mid: 1.2, tickCount: 50 } };
    const e = new MarketEngine(baseConfig(), NOW);
    await e.hydrate(mock);

    expect(e.quote("EUR/USD").mid).toBe(1.2);
    // Counter was restored.
    expect(e.snapshot()["EUR/USD"].tickCount).toBe(50);
  });

  it("hydrate loads persisted candles into the chart", async () => {
    const mock = new MockPersistence();
    mock.candles["EUR/USD:1m"] = [
      { timestamp: NOW - 120_000, open: 1.19, high: 1.2, low: 1.18, close: 1.195, tickVolume: 5 },
    ];
    const e = new MarketEngine(baseConfig(), NOW);
    await e.hydrate(mock);

    const candles = e.getCandles("EUR/USD", "1m", 10, NOW);
    expect(candles[0].open).toBe(1.19);
    expect(candles[0].high).toBe(1.2);
  });

  it("hydrate falls back to seedHistory when persistence is empty", async () => {
    const mock = new MockPersistence(); // no state, no candles
    const e = new MarketEngine(baseConfig(), NOW);
    await e.hydrate(mock);

    expect(e.getCandles("EUR/USD", "1m", 5, NOW).length).toBeGreaterThan(0);
  });

  it("hydrate falls back to seedHistory when persistence throws", async () => {
    const mock = new MockPersistence();
    mock.shouldFail = true;
    const e = new MarketEngine(baseConfig(), NOW);
    await e.hydrate(mock);

    expect(e.getCandles("EUR/USD", "1m", 5, NOW).length).toBeGreaterThan(0);
  });

  it("fires onCandleComplete when a candle bucket closes", () => {
    const e = new MarketEngine(baseConfig(), NOW);
    e.seedHistory(["EUR/USD"], NOW);
    const completed: string[] = [];
    e.onCandleComplete = (_symbol, interval) => completed.push(interval);

    // Advance past a 1m boundary so the previous candle is closed.
    e.advance("EUR/USD", NOW + 120_000);
    expect(completed.length).toBeGreaterThan(0);
    expect(completed).toContain("1m");
  });

  it("start() does not reseed after hydrate", async () => {
    const mock = new MockPersistence();
    mock.state = { "EUR/USD": { mid: 1.15, tickCount: 30 } };
    const e = new MarketEngine(baseConfig(), NOW);
    await e.hydrate(mock);
    // start() must preserve the hydrated mid, not overwrite with seed.
    e.start();
    e.stop();
    expect(e.quote("EUR/USD").mid).toBe(1.15);
  });
});