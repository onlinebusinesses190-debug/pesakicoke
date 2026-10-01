/**
 * PESAKI Forex — instrument specifications.
 *
 * FX pairs do not all share the same precision. JPY pairs quote to 2 decimals,
 * most others to 4 (5 for fractional pairs). Pip size and contract size drive
 * every P/L and margin calculation, so they live here rather than being guessed
 * at the call site.
 */

export interface InstrumentSpec {
  /** Canonical symbol, e.g. "EUR/USD". */
  symbol: string;
  base: string;
  quote: string;
  /** Price decimals as quoted by the market. */
  digits: number;
  /** Value of one pip in quote currency per 1.0 lot. */
  pipSize: number;
  /** Quote-currency value of one standard lot. */
  contractSize: number;
  minLot: number;
  maxLot: number;
  lotStep: number;
  /** Typical spread in pips, used for cost display before a live quote lands. */
  typicalSpreadPips: number;
}

export const INSTRUMENTS: Record<string, InstrumentSpec> = {
  "EUR/USD": {
    symbol: "EUR/USD",
    base: "EUR",
    quote: "USD",
    digits: 5,
    pipSize: 0.0001,
    contractSize: 100000,
    minLot: 0.01,
    maxLot: 100,
    lotStep: 0.01,
    typicalSpreadPips: 0.8,
  },
  "GBP/USD": {
    symbol: "GBP/USD",
    base: "GBP",
    quote: "USD",
    digits: 5,
    pipSize: 0.0001,
    contractSize: 100000,
    minLot: 0.01,
    maxLot: 100,
    lotStep: 0.01,
    typicalSpreadPips: 1.0,
  },
  "USD/JPY": {
    symbol: "USD/JPY",
    base: "USD",
    quote: "JPY",
    digits: 3,
    pipSize: 0.01,
    contractSize: 100000,
    minLot: 0.01,
    maxLot: 100,
    lotStep: 0.01,
    typicalSpreadPips: 0.9,
  },
  "USD/CHF": {
    symbol: "USD/CHF",
    base: "USD",
    quote: "CHF",
    digits: 5,
    pipSize: 0.0001,
    contractSize: 100000,
    minLot: 0.01,
    maxLot: 100,
    lotStep: 0.01,
    typicalSpreadPips: 1.2,
  },
  "AUD/USD": {
    symbol: "AUD/USD",
    base: "AUD",
    quote: "USD",
    digits: 5,
    pipSize: 0.0001,
    contractSize: 100000,
    minLot: 0.01,
    maxLot: 100,
    lotStep: 0.01,
    typicalSpreadPips: 0.9,
  },
  "USD/CAD": {
    symbol: "USD/CAD",
    base: "USD",
    quote: "CAD",
    digits: 5,
    pipSize: 0.0001,
    contractSize: 100000,
    minLot: 0.01,
    maxLot: 100,
    lotStep: 0.01,
    typicalSpreadPips: 1.3,
  },
  "NZD/USD": {
    symbol: "NZD/USD",
    base: "NZD",
    quote: "USD",
    digits: 5,
    pipSize: 0.0001,
    contractSize: 100000,
    minLot: 0.01,
    maxLot: 100,
    lotStep: 0.01,
    typicalSpreadPips: 1.4,
  },
  "EUR/GBP": {
    symbol: "EUR/GBP",
    base: "EUR",
    quote: "GBP",
    digits: 5,
    pipSize: 0.0001,
    contractSize: 100000,
    minLot: 0.01,
    maxLot: 100,
    lotStep: 0.01,
    typicalSpreadPips: 1.0,
  },
  "EUR/JPY": {
    symbol: "EUR/JPY",
    base: "EUR",
    quote: "JPY",
    digits: 3,
    pipSize: 0.01,
    contractSize: 100000,
    minLot: 0.01,
    maxLot: 100,
    lotStep: 0.01,
    typicalSpreadPips: 1.3,
  },
  "GBP/JPY": {
    symbol: "GBP/JPY",
    base: "GBP",
    quote: "JPY",
    digits: 3,
    pipSize: 0.01,
    contractSize: 100000,
    minLot: 0.01,
    maxLot: 100,
    lotStep: 0.01,
    typicalSpreadPips: 1.8,
  },
};

export const SYMBOLS = Object.keys(INSTRUMENTS);

export function getInstrument(symbol: string): InstrumentSpec | undefined {
  return INSTRUMENTS[symbol.toUpperCase()];
}

/** Currencies that can be derived from the provider's base rates. */
export const SUPPORTED_CURRENCIES = [
  "USD",
  "GBP",
  "JPY",
  "CHF",
  "AUD",
  "CAD",
  "NZD",
  "KES",
];

/** Round a price to the instrument's quoted precision. */
export function roundToDigits(price: number, digits: number): number {
  const f = Math.pow(10, digits);
  return Math.round(price * f) / f;
}

/** Convert a price difference into pips for the given instrument. */
export function toPips(delta: number, instrument: InstrumentSpec): number {
  return delta / instrument.pipSize;
}

/** Convert a pip count back into a price difference. */
export function fromPips(pips: number, instrument: InstrumentSpec): number {
  return pips * instrument.pipSize;
}
