import { describe, it, expect } from "vitest";
import { estimateTokens, buildBudget, BUDGET_LIMITS } from "./tokenBudget";

describe("estimateTokens", () => {
  it("returns 0 for empty", () => expect(estimateTokens("")).toBe(0));
  it("uses ceil(len/1.5) with min 1", () => {
    expect(estimateTokens("a")).toBe(1);
    expect(estimateTokens("abc")).toBe(2);
  });
});

describe("buildBudget", () => {
  it("keeps high-priority worldbook entries and drops overflow", () => {
    // "short" ~4 tokens fits; big content (3000 chars ~= 2000 tokens) overflows the 2000 wb budget.
    const big = "x".repeat(3000);
    const entries = [
      { id: "a", title: "A", content: "short", priority: 10 },
      { id: "b", title: "B", content: big, priority: 1 },
    ];
    const out = buildBudget("char", "tpl", entries, [], "", []);
    const ids = out.worldbookEntries.map((e) => e.id);
    expect(ids).toContain("a");
    expect(ids).not.toContain("b");
    expect(out.budgetLimit).toBe(8000);
  });

  it("sorts memories by salience and respects memory budget", () => {
    const out = buildBudget(
      "c",
      "t",
      [],
      [
        { id: "m1", title: "m1", content: "low", salience: 1 },
        { id: "m2", title: "m2", content: "high", salience: 9 },
      ],
      "",
      [],
    );
    expect(out.memories[0].id).toBe("m2");
  });

  it("fills recent messages into remaining budget from newest", () => {
    const out = buildBudget("c", "t", [], [], "", ["m-old", "m-new"]);
    expect(out.recentMessages.length).toBeGreaterThan(0);
  });

  it("exposes BUDGET_LIMITS constants", () => {
    expect(BUDGET_LIMITS.worldbook).toBe(2000);
  });
});
