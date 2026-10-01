/**
 * PESAKI Forex — pricing and risk engine.
 *
 * FX P/L is small relative to position size, so every monetary result is rounded
 * explicitly at a defined point rather than relying on float behaviour. Position
 * sizes are floored to the instrument's lot step so a computed size never risks
 * more than the stated budget.
 *
 * Note: the P/L and margin paths below use floating point with explicit rounding
 * rather than integer minor units. `toCents`/`fromCents` are provided for call
 * sites that need exact cent arithmetic, but are not yet used internally.
 *
 * Money is rounded to 2dp (cents) unless the function is explicitly returning
 * a price, which uses the instrument's own precision.
 */

import type { InstrumentSpec } from "./instruments";

/** Convert a decimal number into integer cents without float drift. */
export function toCents(amount: number): bigint {
  return BigInt(Math.round(amount * 100));
}

export function fromCents(cents: bigint): number {
  return Number(cents) / 100;
}

export interface RiskInputs {
  /** Account equity the position is sized against. */
  balance: number;
  /** Percent of balance the user is willing to lose, e.g. 1 for 1%. */
  riskPercent: number;
  entryPrice: number;
  stopLossPrice: number;
  instrument: InstrumentSpec;
  /** KES value of one unit of the instrument's quote currency. */
  quoteToKes: number;
}

export interface RiskOutput {
  lots: number;
  units: number;
  riskAmount: number;
  pipValuePerLot: number;
  stopDistancePips: number;
  marginRequired: number;
  plCurrency: "KES";
}

/**
 * Pip value for one standard lot, in account currency (KES).
 *
 * A pip is worth contractSize * pipSize in the instrument's quote currency
 * (USD 10 for EUR/USD, JPY 1000 for USD/JPY). quoteToKes converts that into
 * KES so every pair can be compared on one account balance.
 */
export function pipValuePerLot(
  instrument: InstrumentSpec,
  quoteToKes: number,
): number {
  return instrument.contractSize * instrument.pipSize * quoteToKes;
}

export function calculatePositionSize(input: RiskInputs): RiskOutput {
  const { balance, riskPercent, entryPrice, stopLossPrice, instrument } = input;
  const quoteToKes = input.quoteToKes;

  const riskAmount = (balance * riskPercent) / 100;
  const stopDistance = Math.abs(entryPrice - stopLossPrice);
  const stopDistancePips = stopDistance / instrument.pipSize;

  const pv = pipValuePerLot(instrument, quoteToKes);

  if (stopDistancePips <= 0 || pv <= 0) {
    return {
      lots: 0,
      units: 0,
      riskAmount: 0,
      pipValuePerLot: Number(pv.toFixed(4)),
      stopDistancePips: 0,
      marginRequired: 0,
      plCurrency: "KES",
    };
  }

  const rawLots = riskAmount / (pv * stopDistancePips);

  // Floor to the instrument's lot step. Rounding to the nearest step would let a
  // computed size round *up* past the risk budget, and returning an unrounded
  // value would advertise units and margin that the order never creates.
  const stepped = Math.floor(rawLots / instrument.lotStep + 1e-9) * instrument.lotStep;
  const capped = Math.min(Math.max(stepped, 0), instrument.maxLot);
  // A size below the broker minimum is not tradeable, so report zero rather than
  // a fraction of a lot the order endpoint would reject.
  const rounded = Number(capped.toFixed(4));
  const lots = rounded < instrument.minLot ? 0 : rounded;
  const units = Math.round(lots * instrument.contractSize);

  return {
    lots,
    units,
    riskAmount: Number(riskAmount.toFixed(2)),
    pipValuePerLot: Number(pv.toFixed(4)),
    stopDistancePips: Number(stopDistancePips.toFixed(1)),
    marginRequired: marginForLots(lots, entryPrice, instrument, quoteToKes),
    plCurrency: "KES",
  };
}

/**
 * Margin for a position, in KES.
 *
 * Notional = lots * contractSize * entryPrice, expressed in the quote currency
 * and converted with quoteToKes. marginPercent follows the broker convention
 * where 100 means unlevered 1:1.
 */
export function marginForLots(
  lots: number,
  entryPrice: number,
  instrument: InstrumentSpec,
  quoteToKes: number,
  marginPercent = 100,
): number {
  const notionalQuote = lots * instrument.contractSize * entryPrice;
  const notionalKes = notionalQuote * quoteToKes;
  return Number((notionalKes * (marginPercent / 100)).toFixed(2));
}

export interface PnlInput {
  side: "buy" | "sell";
  lots: number;
  entryPrice: number;
  exitPrice: number;
  instrument: InstrumentSpec;
  quoteToKes: number;
}

/** Unrealised or realised P/L in account currency (KES). */
export function computePnl(input: PnlInput): number {
  const { side, lots, entryPrice, exitPrice, instrument, quoteToKes } = input;
  const delta = side === "buy" ? exitPrice - entryPrice : entryPrice - exitPrice;
  const pnlQuote = lots * instrument.contractSize * delta;
  return Number((pnlQuote * quoteToKes).toFixed(2));
}

export interface MarginState {
  balance: number;
  equity: number;
  usedMargin: number;
  freeMargin: number;
  marginLevelPercent: number | null;
}

export function marginState(
  balance: number,
  unrealisedPnl: number,
  usedMargin: number,
): MarginState {
  const equity = Number((balance + unrealisedPnl).toFixed(2));
  const free = Number((equity - usedMargin).toFixed(2));
  const marginLevel = usedMargin > 0 ? Number(((equity / usedMargin) * 100).toFixed(2)) : null;
  return { balance, equity, usedMargin, freeMargin: free, marginLevelPercent: marginLevel };
}

export interface ValidationResult {
  ok: boolean;
  error?: string;
}

/**
 * Server-side order validation. Mirrors the rules the UI shows, so a bad
 * request is rejected with the same human-readable message rather than a 500.
 */
export function validateStopLoss(
  side: "buy" | "sell",
  entry: number,
  stopLoss: number | null,
): ValidationResult {
  if (stopLoss === null) return { ok: true };
  if (!Number.isFinite(stopLoss)) return { ok: false, error: "Stop loss is not a valid price" };
  if (side === "buy" && stopLoss >= entry) {
    return { ok: false, error: "You cannot place a BUY stop-loss at or above the entry price" };
  }
  if (side === "sell" && stopLoss <= entry) {
    return { ok: false, error: "You cannot place a SELL stop-loss at or below the entry price" };
  }
  return { ok: true };
}

export function validateTakeProfit(
  side: "buy" | "sell",
  entry: number,
  takeProfit: number | null,
): ValidationResult {
  if (takeProfit === null) return { ok: true };
  if (!Number.isFinite(takeProfit)) return { ok: false, error: "Take profit is not a valid price" };
  if (side === "buy" && takeProfit <= entry) {
    return { ok: false, error: "You cannot place a BUY take-profit at or below the entry price" };
  }
  if (side === "sell" && takeProfit >= entry) {
    return { ok: false, error: "You cannot place a SELL take-profit at or above the entry price" };
  }
  return { ok: true };
}

export function validateLots(lots: number, instrument: InstrumentSpec): ValidationResult {
  if (!Number.isFinite(lots)) return { ok: false, error: "Position size is not valid" };
  if (lots <= 0) return { ok: false, error: "Position size must be greater than zero" };
  if (lots < instrument.minLot) {
    return { ok: false, error: `Minimum position size is ${instrument.minLot} lots` };
  }
  if (lots > instrument.maxLot) {
    return { ok: false, error: `Maximum position size is ${instrument.maxLot} lots` };
  }
  const steps = lots / instrument.lotStep;
  if (Math.abs(steps - Math.round(steps)) > 1e-9) {
    return { ok: false, error: `Position size must be a multiple of ${instrument.lotStep} lots` };
  }
  return { ok: true };
}
