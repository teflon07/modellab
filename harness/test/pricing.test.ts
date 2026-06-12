import { describe, expect, test } from "bun:test";
import { priceOverride } from "../src/config";

const PRICES = {
  "anthropic/claude-fable-5": { input_per_mtok: 10, output_per_mtok: 50 },
};

describe("priceOverride", () => {
  test("returns null when model has no price entry", () => {
    expect(
      priceOverride(PRICES, "anthropic/claude-haiku-4-5", {
        inputTokens: 519, outputTokens: 200, cacheRead: 0, cacheWrite: 0,
      }),
    ).toBeNull();
  });

  test("computes input+output cost from per-mtok rates", () => {
    const cost = priceOverride(PRICES, "anthropic/claude-fable-5", {
      inputTokens: 519, outputTokens: 200, cacheRead: 0, cacheWrite: 0,
    });
    // 519 * $10/MTok + 200 * $50/MTok = 0.00519 + 0.01 = 0.01519
    expect(cost).toBeCloseTo(0.01519, 10);
  });

  test("bills cache reads at 10% and cache writes at 125% of input rate", () => {
    const cost = priceOverride(PRICES, "anthropic/claude-fable-5", {
      inputTokens: 0, outputTokens: 0, cacheRead: 1_000_000, cacheWrite: 1_000_000,
    });
    // 1M cacheRead * $1/MTok + 1M cacheWrite * $12.50/MTok
    expect(cost).toBeCloseTo(1 + 12.5, 10);
  });
});
