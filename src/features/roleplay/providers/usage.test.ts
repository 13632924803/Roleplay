import { describe, it, expect } from "vitest";
import { normalizeProviderUsage } from "./usage";

describe("normalizeProviderUsage", () => {
  it("flags unavailable for non-object", () => {
    expect(normalizeProviderUsage("deepseek", null).usageAvailable).toBe(false);
  });
  it("parses deepseek cache fields", () => {
    const u = normalizeProviderUsage("deepseek", {
      prompt_tokens: 100,
      completion_tokens: 20,
      total_tokens: 120,
      prompt_cache_hit_tokens: 80,
      prompt_cache_miss_tokens: 20,
    });
    expect(u.inputTokens).toBe(100);
    expect(u.cacheHitInputTokens).toBe(80);
    expect(u.cacheHitRate).toBeCloseTo(0.8);
    expect(u.usageAvailable).toBe(true);
  });
  it("omits cache fields for non-deepseek", () => {
    const u = normalizeProviderUsage("openai_compatible", {
      prompt_tokens: 10,
      completion_tokens: 5,
      prompt_cache_hit_tokens: 3,
    });
    expect(u.cacheHitInputTokens).toBeUndefined();
  });
});
