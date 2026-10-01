/**
 * Risk-engine tests.
 *
 * These cover the maths that decides how large a position may be, what margin it
 * consumes, and what P/L it realises. The cases are chosen around the failure
 * modes that silently cost a user money: rounding that does not match the lot
 * step, sizes below the broker minimum, JPY pairs that do not share EUR/USD
 * precision, and stop/target validation that must reject rather than throw.
 */

import { describe, expect, it } from "vitest";
import { getInstrument } from "./instruments";
import {
  calculatePositionSize,
  computePnl,
  computePnlFromUnits,
  configuredLeverage,
  marginForLots,
  marginState,
  minTradeAmount,
  pipValuePerLot,
  settlementLegs,
  sizeFromTradeAmount,
  validateLots,
  validateStopLoss,
  validateTakeProfit,
  validateTradeAmount,
} from "./risk";

const EURUSD = getInstrument("EUR/USD")!;
const USDJPY = getInstrument("USD/JPY")!;
/** KES per USD, arbitrary but fixed so the arithmetic is checkable by hand. */
const USD_KES = 130;

describe("pipValuePerLot", () => {
  it("is USD 10 converted to KES for a USD-quoted pair", () => {
    // 100k units * 0.0001 = USD 10 per pip per lot.
    expect(pipValuePerLot(EURUSD, USD_KES)).toBeCloseTo(10 * USD_KES, 6);
  });

  it("uses JPY pip size for a JPY-quoted pair", () => {
    // 100k * 0.01 = JPY 1000 per pip per lot, then converted to KES.
    expect(pipValuePerLot(USDJPY, USD_KES)).toBeCloseTo(1000 * USD_KES, 6);
  });
});

describe("calculatePositionSize", () => {
  const base = {
    balance: 100_000,
    riskPercent: 1,
    entryPrice: 1.1,
    stopLossPrice: 1.095, // 50 pips on EUR/USD
    instrument: EURUSD,
    quoteToKes: USD_KES,
  };

  it("spends the risk budget across the stop distance", () => {
    const out = calculatePositionSize(base);
    // Risk KES 1000; pip value KES 1300 -> 1000 / (1300 * 50) = 0.015384 lots,
    // floored to the 0.01 step so the realised risk stays inside the budget.
    expect(out.lots).toBe(0.01);
    expect(out.riskAmount).toBe(1000);
    expect(out.stopDistancePips).toBeCloseTo(50, 5);
  });

  it("never risks more than the stated percentage", () => {
    const out = calculatePositionSize({
      ...base,
      balance: 7_333,
      riskPercent: 1,
    });
    // The whole point of rounding: the realised risk must stay within budget,
    // so lots floor to the lot step instead of rounding up past it.
    const realisedRisk =
      out.lots * pipValuePerLot(EURUSD, USD_KES) * out.stopDistancePips;
    expect(realisedRisk).toBeLessThanOrEqual(out.riskAmount + 1e-9);
  });

  it("keeps units consistent with the returned lot size", () => {
    // Regression: units and margin used to be derived from an unrounded value
    // while `lots` was rounded, so the ticket advertised more units than the
    // order would actually create.
    for (const entry of [1.1, 1.2345, 1.09, 1.5]) {
      const out = calculatePositionSize({ ...base, entryPrice: entry });
      expect(out.units).toBe(Math.round(out.lots * EURUSD.contractSize));
    }
  });

  it("keeps margin consistent with the returned lot size", () => {
    const out = calculatePositionSize(base);
    expect(out.marginRequired).toBe(
      marginForLots(out.lots, base.entryPrice, EURUSD, USD_KES),
    );
  });

  it("produces a size the order endpoint will accept", () => {
    // A preview that suggests 0.013 lots would be rejected by validateLots,
    // leaving the user with a ticket that cannot be submitted.
    for (const balance of [500, 1_000, 5_000, 50_000, 250_000]) {
      const out = calculatePositionSize({ ...base, balance });
      if (out.lots === 0) continue;
      expect(validateLots(out.lots, EURUSD).ok).toBe(true);
    }
  });

  it("returns zero rather than an untradeable sub-minimum size", () => {
    // KES 20 of risk cannot buy 0.01 lots; it must not report 0.00 as tradable.
    const out = calculatePositionSize({ ...base, balance: 100 });
    if (out.lots < EURUSD.minLot) expect(out.lots).toBe(0);
    else expect(validateLots(out.lots, EURUSD).ok).toBe(true);
  });

  it("caps size at the instrument maximum", () => {
    const out = calculatePositionSize({
      ...base,
      balance: 500_000_000,
      stopLossPrice: 1.0999, // 1 pip
    });
    expect(out.lots).toBeLessThanOrEqual(EURUSD.maxLot);
  });

  it("returns a zeroed result for a zero-width stop", () => {
    const out = calculatePositionSize({ ...base, stopLossPrice: base.entryPrice });
    expect(out.lots).toBe(0);
    expect(out.units).toBe(0);
    expect(out.marginRequired).toBe(0);
  });

  it("sizes JPY pairs on their own pip size", () => {
    // JPY pip value is 130,000 KES, so a 50 pip stop needs a budget large
    // enough to fund at least the 0.01 lot minimum.
    const out = calculatePositionSize({
      balance: 10_000_000,
      riskPercent: 1,
      entryPrice: 150,
      stopLossPrice: 149.5, // 50 pips on USD/JPY
      instrument: USDJPY,
      quoteToKes: USD_KES,
    });
    expect(out.stopDistancePips).toBeCloseTo(50, 5);
    expect(out.lots).toBeGreaterThan(0);
    expect(validateLots(out.lots, USDJPY).ok).toBe(true);
  });

  it("reports zero when the budget cannot fund the minimum JPY size", () => {
    const out = calculatePositionSize({
      balance: 100_000,
      riskPercent: 1,
      entryPrice: 150,
      stopLossPrice: 149.5,
      instrument: USDJPY,
      quoteToKes: USD_KES,
    });
    expect(out.lots).toBe(0);
    expect(out.marginRequired).toBe(0);
  });
});

describe("marginForLots", () => {
  it("scales linearly with size", () => {
    const one = marginForLots(1, 1.1, EURUSD, USD_KES);
    const ten = marginForLots(10, 1.1, EURUSD, USD_KES);
    expect(ten).toBeCloseTo(one * 10, 6);
  });

  it("applies leverage as a fraction of notional", () => {
    // 1 lot EUR/USD at 1.1000 = USD 110,000 = KES 14,300,000 unlevered.
    expect(marginForLots(1, 1.1, EURUSD, USD_KES)).toBeCloseTo(14_300_000, 2);
    expect(marginForLots(1, 1.1, EURUSD, USD_KES, 1)).toBeCloseTo(143_000, 2);
  });
});

describe("computePnl", () => {
  it("pays a buy when price rises", () => {
    // 1 lot, 50 pip rise on EUR/USD: USD 500 -> KES 65,000.
    expect(
      computePnl({
        side: "buy",
        lots: 1,
        entryPrice: 1.1,
        exitPrice: 1.105,
        instrument: EURUSD,
        quoteToKes: USD_KES,
      }),
    ).toBeCloseTo(50 * 1300, 2);
  });

  it("charges a buy when price falls", () => {
    expect(
      computePnl({
        side: "buy",
        lots: 1,
        entryPrice: 1.1,
        exitPrice: 1.095,
        instrument: EURUSD,
        quoteToKes: USD_KES,
      }),
    ).toBeCloseTo(-65_000, 2);
  });

  it("is exactly negated for the opposite side", () => {
    const args = {
      lots: 0.5,
      entryPrice: 1.1,
      exitPrice: 1.1042,
      instrument: EURUSD,
      quoteToKes: USD_KES,
    };
    const buy = computePnl({ ...args, side: "buy" });
    const sell = computePnl({ ...args, side: "sell" });
    expect(sell).toBeCloseTo(-buy, 6);
  });

  it("returns zero at the entry price", () => {
    expect(
      computePnl({
        side: "sell",
        lots: 2,
        entryPrice: 1.1,
        exitPrice: 1.1,
        instrument: EURUSD,
        quoteToKes: USD_KES,
      }),
    ).toBe(0);
  });
});

describe("sizeFromTradeAmount", () => {
  const base = {
    tradeAmount: 1_000,
    entryPrice: 1.1,
    instrument: EURUSD,
    quoteToKes: USD_KES,
    leverage: 10,
  };

  it("commits exactly the requested amount as margin", () => {
    // Margin is the capital the user committed. Nothing else is charged, and
    // leverage must not inflate the figure.
    expect(sizeFromTradeAmount(base).margin).toBe(1_000);
  });

  it("derives exposure as the amount times leverage", () => {
    expect(sizeFromTradeAmount(base).exposure).toBe(10_000);
  });

  it("converts exposure into units at the entry price", () => {
    // 10,000 KES of exposure at 1.1000 and KES 130/USD is 10,000 / 143 = 69.93 USD.
    const out = sizeFromTradeAmount(base);
    expect(out.units).toBeCloseTo(10_000 / (1.1 * USD_KES), 6);
  });

  it("never consumes more margin than the account has free", () => {
    // The production failure: at leverage 1 the old path demanded KSh 1,468,623
    // for a 0.10 lot trade against a KSh 100,000 balance, so every order was
    // rejected. Sizing from the committed amount keeps margin == amount.
    const out = sizeFromTradeAmount({ ...base, leverage: 1, tradeAmount: 1_000 });
    expect(out.margin).toBeLessThanOrEqual(100_000);
  });

  it("can express the product minimum of KSh 100 as a real position", () => {
    // A 0.01 lot is ~KSh 14,700 of notional, so the KSh 100 minimum is
    // impossible to express in lots. In units it is a legitimate small trade.
    const out = sizeFromTradeAmount({ ...base, tradeAmount: 100 });
    expect(out.units).toBeGreaterThan(0);
    expect(out.margin).toBe(100);
  });

  it("keeps the derived lots consistent with the derived units", () => {
    const out = sizeFromTradeAmount(base);
    expect(out.lots).toBeCloseTo(out.units / EURUSD.contractSize, 10);
  });

  it("scales linearly with the committed amount", () => {
    const one = sizeFromTradeAmount({ ...base, tradeAmount: 500 });
    const two = sizeFromTradeAmount({ ...base, tradeAmount: 1_000 });
    expect(two.units).toBeCloseTo(one.units * 2, 10);
  });
});

describe("computePnlFromUnits", () => {
  it("pays a buy when price rises", () => {
    // units already represent notional, so contract size must not reappear.
    // 1,000 units * 0.0050 * KES 130 = KES 650.
    expect(computePnlFromUnits("buy", 1_000, 1.1, 1.105, USD_KES)).toBeCloseTo(650, 2);
  });

  it("charges a sell when price rises", () => {
    expect(computePnlFromUnits("sell", 1_000, 1.1, 1.105, USD_KES)).toBeCloseTo(-650, 2);
  });

  it("agrees with the lot-based P/L for the same notional", () => {
    // 1 lot EUR/USD is 100,000 units. Both paths must price identically, which
    // is what keeps stored lot quantities and unit maths consistent.
    const lotPnl = computePnl({
      side: "buy",
      lots: 1,
      entryPrice: 1.1,
      exitPrice: 1.105,
      instrument: EURUSD,
      quoteToKes: USD_KES,
    });
    expect(computePnlFromUnits("buy", EURUSD.contractSize, 1.1, 1.105, USD_KES)).toBeCloseTo(
      lotPnl,
      2,
    );
  });

  it("returns zero at the entry price", () => {
    expect(computePnlFromUnits("buy", 1_000, 1.1, 1.1, USD_KES)).toBe(0);
  });
});

describe("validateTradeAmount", () => {
  it("accepts the minimum and above", () => {
    expect(validateTradeAmount(100, 100_000).ok).toBe(true);
    expect(validateTradeAmount(5_000, 100_000).ok).toBe(true);
  });

  it("rejects amounts below the configured minimum", () => {
    const check = validateTradeAmount(50, 100_000);
    expect(check.ok).toBe(false);
    expect(check.error).toContain(String(minTradeAmount()));
  });

  it("rejects an amount larger than free margin", () => {
    const check = validateTradeAmount(500_000, 100_000);
    expect(check.ok).toBe(false);
    expect(check.error).toContain("insufficient free margin");
  });

  it("rejects non-positive and non-finite amounts instead of throwing", () => {
    expect(validateTradeAmount(0, 100_000).ok).toBe(false);
    expect(validateTradeAmount(-100, 100_000).ok).toBe(false);
    expect(validateTradeAmount(Number.NaN, 100_000).ok).toBe(false);
  });

  it("enforces a per-trade exposure cap when one is configured", () => {
    // The cap is in KES notional, so the allowed amount is cap / leverage.
    const cap = 100_000;
    const allowed = cap / configuredLeverage();
    expect(validateTradeAmount(allowed, 10_000_000, cap).ok).toBe(true);
    expect(validateTradeAmount(allowed * 2, 10_000_000, cap).ok).toBe(false);
  });
});

describe("configuredLeverage", () => {
  it("falls back to a positive multiplier when unset", () => {
    const lev = configuredLeverage();
    expect(lev).toBeGreaterThan(0);
    expect(Number.isFinite(lev)).toBe(true);
  });
});

describe("settlementLegs", () => {
  const base = {
    side: "buy" as const,
    units: 1_000,
    entryPrice: 1.1,
    exitPrice: 1.105,
    quoteToKes: USD_KES,
    margin: 1_000,
  };

  it("returns the full margin lock to the user", () => {
    // Collateral must come back whether the trade won or lost; the user is never
    // left holding margin for a position that no longer exists.
    expect(settlementLegs(base).marginRelease).toBe(1_000);
    expect(settlementLegs({ ...base, exitPrice: 1.09 }).marginRelease).toBe(1_000);
  });

  it("credits a winning position and debits nothing", () => {
    const legs = settlementLegs(base);
    expect(legs.profit).toBeCloseTo(650, 2);
    expect(legs.loss).toBe(0);
  });

  it("debits a losing position and credits nothing", () => {
    const legs = settlementLegs({ ...base, exitPrice: 1.095 });
    expect(legs.loss).toBeCloseTo(650, 2);
    expect(legs.profit).toBe(0);
  });

  it("settles both legs at zero for a scratch trade", () => {
    const legs = settlementLegs({ ...base, exitPrice: base.entryPrice });
    expect(legs.profit).toBe(0);
    expect(legs.loss).toBe(0);
    expect(legs.marginRelease).toBe(1_000);
  });

  it("never returns a negative margin release", () => {
    // A negative would debit the user for releasing their own collateral.
    expect(settlementLegs({ ...base, margin: -50 }).marginRelease).toBe(0);
  });

  it("handles a short position losing", () => {
    const legs = settlementLegs({ ...base, side: "sell", exitPrice: 1.105 });
    expect(legs.loss).toBeCloseTo(650, 2);
    expect(legs.profit).toBe(0);
  });
});

describe("marginState", () => {
  it("adds unrealised P/L to balance for equity", () => {
    const s = marginState(100_000, -5_000, 20_000);
    expect(s.equity).toBe(95_000);
    expect(s.freeMargin).toBe(75_000);
    expect(s.marginLevelPercent).toBeCloseTo(475, 2);
  });

  it("reports no margin level when nothing is used", () => {
    expect(marginState(100_000, 0, 0).marginLevelPercent).toBeNull();
  });
});

describe("validateStopLoss", () => {
  it("accepts a stop on the losing side for both directions", () => {
    expect(validateStopLoss("buy", 1.1, 1.09).ok).toBe(true);
    expect(validateStopLoss("sell", 1.1, 1.11).ok).toBe(true);
  });

  it("allows an omitted stop", () => {
    expect(validateStopLoss("buy", 1.1, null).ok).toBe(true);
  });

  it("rejects a stop on the winning side", () => {
    expect(validateStopLoss("buy", 1.1, 1.11).ok).toBe(false);
    expect(validateStopLoss("sell", 1.1, 1.09).ok).toBe(false);
  });

  it("rejects a non-finite price instead of throwing", () => {
    expect(validateStopLoss("buy", 1.1, Number.NaN).ok).toBe(false);
  });
});

describe("validateTakeProfit", () => {
  it("accepts a target on the winning side for both directions", () => {
    expect(validateTakeProfit("buy", 1.1, 1.11).ok).toBe(true);
    expect(validateTakeProfit("sell", 1.1, 1.09).ok).toBe(true);
  });

  it("rejects a target on the losing side", () => {
    expect(validateTakeProfit("buy", 1.1, 1.09).ok).toBe(false);
    expect(validateTakeProfit("sell", 1.1, 1.11).ok).toBe(false);
  });
});

describe("validateLots", () => {
  it("accepts a valid step-multiple size", () => {
    expect(validateLots(0.01, EURUSD).ok).toBe(true);
    expect(validateLots(1.5, EURUSD).ok).toBe(true);
  });

  it("rejects sizes outside the instrument bounds", () => {
    expect(validateLots(0, EURUSD).ok).toBe(false);
    expect(validateLots(-1, EURUSD).ok).toBe(false);
    expect(validateLots(0.005, EURUSD).ok).toBe(false);
    expect(validateLots(1000, EURUSD).ok).toBe(false);
  });

  it("rejects a size off the lot step", () => {
    expect(validateLots(0.125, EURUSD).ok).toBe(false);
  });
});