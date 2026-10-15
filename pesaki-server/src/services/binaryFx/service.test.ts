/**
 * Binary FX settlement fairness tests.
 *
 * These tests pin the core fairness invariant: outcome is decided by a strict
 * price comparison with no rounding bias. Equal price is always a loss. A
 * 0.00001 move is respected in the correct direction.
 */

import { describe, expect, it, vi } from "vitest";

// Mock supabase and wallet dependencies so the test can load service.ts
// without needing real env vars / DB connections.
vi.mock("../../lib/supabase", () => ({ supabase: {} }));
vi.mock("../../wallet/service", () => ({
  debit: vi.fn(),
  credit: vi.fn(),
  getBalance: vi.fn(),
}));

import { determineOutcome } from "./service";
import { BFX } from "./config";

describe("determineOutcome — fairness rules", () => {
  it("BUY, price UP by 0.00005 → WIN", () => {
    const entry = 1.12980;
    const exit = 1.12985; // +0.00005
    expect(determineOutcome("up", entry, exit)).toBe("win");
  });

  it("BUY, price DOWN by 0.00005 → LOSS", () => {
    const entry = 1.12985;
    const exit = 1.12980; // -0.00005
    expect(determineOutcome("up", entry, exit)).toBe("loss");
  });

  it("BUY, price exactly the same → LOSS (tie = loss)", () => {
    const entry = 1.12980;
    const exit = 1.12980;
    expect(determineOutcome("up", entry, exit)).toBe("loss");
  });

  it("SELL, price DOWN by 0.00005 → WIN", () => {
    const entry = 1.12985;
    const exit = 1.12980; // -0.00005
    expect(determineOutcome("down", entry, exit)).toBe("win");
  });

  it("SELL, price UP by 0.00005 → LOSS", () => {
    const entry = 1.12980;
    const exit = 1.12985; // +0.00005
    expect(determineOutcome("down", entry, exit)).toBe("loss");
  });

  it("floating-point near-equal with tiny epsilon does not flip outcome", () => {
    const entry = 1.12980;
    const exit = 1.12980 + 1e-10; // below EPS threshold → treated as equal → LOSS
    expect(determineOutcome("up", entry, exit)).toBe("loss");
  });

  it("move just above EPS → WIN (respects tiny differences)", () => {
    const entry = 1.12980;
    const exit = 1.12980 + 0.000001; // above EPS → WIN
    expect(determineOutcome("up", entry, exit)).toBe("win");
  });

  it("config confirms payout is 60%", () => {
    expect(BFX.PAYOUT).toBe(0.6);
  });

  it("config confirms tie rule is loss", () => {
    expect(BFX.TIE).toBe("loss");
  });
});
