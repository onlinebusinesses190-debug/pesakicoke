/**
 * PESAKI Forex — KES conversion rates.
 *
 * The internal market engine quotes prices in each pair's quote currency, but
 * every account is denominated in KES. Conversions therefore happen here rather
 * than being fetched from an external rate feed, so settlement never depends on
 * a third party being reachable.
 *
 * Rates are configuration, not market data: they are set server-side and can be
 * overridden with PESAKI_FX_KES_RATES as a JSON object. They are deliberately
 * NOT exposed as authoritative live FX rates and are not labelled as such
 * anywhere in the product.
 */

const DEFAULTS: Record<string, number> = {
  USD: 130,
  EUR: 141,
  GBP: 168,
  JPY: 0.88,
  CHF: 152,
  AUD: 85,
  CAD: 95,
  NZD: 79,
};

let cache: Record<string, number> | null = null;

function load(): Record<string, number> {
  if (cache) return cache;
  const raw = process.env.PESAKI_FX_KES_RATES;
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Record<string, number>;
      for (const [code, rate] of Object.entries(parsed)) {
        if (Number.isFinite(rate) && rate > 0) DEFAULTS[code.toUpperCase()] = rate;
      }
    } catch {
      // A malformed override must not take the market down; fall back to defaults.
    }
  }
  cache = DEFAULTS;
  return cache;
}

/** KES value of one unit of a currency. */
export function kesPerUnit(currency: string): number {
  const code = currency.toUpperCase();
  if (code === "KES") return 1;
  const rate = load()[code];
  if (!rate) throw new Error(`No KES rate configured for ${code}`);
  return rate;
}

export function isConvertible(currency: string): boolean {
  const code = currency.toUpperCase();
  return code === "KES" || Boolean(load()[code]);
}

/** Test seam. */
export function resetKesRates() {
  cache = null;
}