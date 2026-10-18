/**
 * KES rate tests.
 *
 * The /forex/rates endpoint surfaces kesPerUnit("USD") as `usdToKes`. These
 * tests pin the default value and the env-override path so the frontend can
 * always convert KSh balances to a USD equivalent.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { kesPerUnit, isConvertible, resetKesRates } from "./kesRates";

describe("kesRates — default USD rate", () => {
  afterEach(() => resetKesRates());

  it("returns 130 KES per USD by default", () => {
    expect(kesPerUnit("USD")).toBe(130);
  });

  it("exposes the shape the /forex/rates endpoint returns", () => {
    // The endpoint does: { success: true, usdToKes: kesPerUnit("USD") }
    const endpointResponse = { success: true, usdToKes: kesPerUnit("USD") };
    expect(endpointResponse).toEqual({ success: true, usdToKes: 130 });
  });
});

describe("kesRates — isConvertible", () => {
  afterEach(() => resetKesRates());

  it("recognises KES itself", () => {
    expect(isConvertible("KES")).toBe(true);
  });

  it("recognises configured major currencies", () => {
    expect(isConvertible("USD")).toBe(true);
    expect(isConvertible("EUR")).toBe(true);
    expect(isConvertible("GBP")).toBe(true);
  });

  it("rejects unknown currencies", () => {
    expect(isConvertible("XYZ")).toBe(false);
  });
});

describe("kesRates — env override", () => {
  afterEach(() => resetKesRates());

  it("overrides the USD rate from PESAKI_FX_KES_RATES", () => {
    vi.stubEnv("PESAKI_FX_KES_RATES", JSON.stringify({ USD: 150 }));
    expect(kesPerUnit("USD")).toBe(150);
  });

  it("falls back to defaults when the env var is absent", () => {
    vi.stubEnv("PESAKI_FX_KES_RATES", undefined);
    expect(kesPerUnit("USD")).toBe(130);
  });

  it("ignores a malformed env value and keeps defaults", () => {
    vi.stubEnv("PESAKI_FX_KES_RATES", "{not valid json");
    expect(kesPerUnit("USD")).toBe(130);
  });
});
