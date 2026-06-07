import { describe, it, expect } from "vitest";
import { estimateDeepSeekCost } from "./deepseekPricing";
import type { ProviderUsage } from "../provider.types";

function usage(over: Partial<ProviderUsage>): ProviderUsage {
  return { usageAvailable: true, rawUsage: {}, sourceProvider: "deepseek", ...over };
}

describe("estimateDeepSeekCost", () => {
  it("returns null when usage unavailable", () => {
    expect(estimateDeepSeekCost(usage({ usageAvailable: false }), "deepseek-v4-flash")).toBeNull();
  });
  it("computes split cache hit/miss input cost", () => {
    const c = estimateDeepSeekCost(
      usage({ outputTokens: 1_000_000, cacheHitInputTokens: 1_000_000, cacheMissInputTokens: 0 }),
      "deepseek-v4-flash",
    );
    expect(c?.outputCost).toBeCloseTo(0.28, 5);
    expect(c?.cacheHitInputCost).toBeCloseTo(0.0028, 5);
  });
  it("warns and falls back for legacy model name", () => {
    const c = estimateDeepSeekCost(usage({ inputTokens: 100, outputTokens: 10 }), "deepseek-chat");
    expect(c?.estimateWarning).toContain("deepseek-v4-flash");
  });
});
