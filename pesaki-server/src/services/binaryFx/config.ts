/**
 * Binary FX configuration.
 *
 * Centralised so stake limits, expiries, payouts and the tie rule live in one
 * place and are not scattered across the frontend. All values are server
 * authoritative: the frontend only ever reads them, never decides them.
 */
export const BFX = {
  /** Assets the binary product exposes, drawn from the PESAKI market engine. */
  ASSETS: ["EUR/USD", "GBP/USD", "USD/JPY", "USD/CHF", "AUD/USD", "NZD/USD", "XAU/USD"] as const,

  /** Fixed expiry durations, in seconds. */
  EXPIRIES: [
    { label: "10s", seconds: 10 },
    { label: "30s", seconds: 30 },
    { label: "1m", seconds: 60 },
    { label: "5m", seconds: 300 },
    { label: "15m", seconds: 900 },
  ] as const,

  /** Payout as a fraction of stake (0.90 = 90%). Configurable per asset. */
  PAYOUT: 0.9 as const,

  /** Stake limits, in KES. */
  MIN_STAKE: 10,
  MAX_STAKE: 5000,

  /** Maximum number of concurrent open binary trades per user. */
  MAX_OPEN: 10,

  /** Tie rule when expiryPrice === entryPrice. */
  TIE: "loss" as const, // 'loss' | 'push' | 'void'

  /** Demo starting balance, in KES. */
  DEMO_START: 10000,

  /** Settlement reference prefix. */
  SETTLEMENT_PREFIX: "BFX-",
} as const;

export type BfxAsset = (typeof BFX.ASSETS)[number];
export type BfxDirection = "up" | "down";
export type BfxMode = "demo" | "real";
export type BfxStatus = "open" | "win" | "loss" | "tie" | "cancelled";