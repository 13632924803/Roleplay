import { describe, it, expect } from "vitest";
import { parseKeywords, matchKeywords, triggerWorldbookEntries } from "./worldbookTrigger";
import type { WorldbookEntryRow } from "../types/database";

function entry(over: Partial<WorldbookEntryRow>): WorldbookEntryRow {
  return {
    id: "e1",
    worldbook_id: "w",
    user_id: "u",
    title: "t",
    category: "general",
    content: "c",
    triggers: [],
    priority: 0,
    enabled: true,
    scope: "global",
    token_estimate: null,
    last_triggered_at: null,
    trigger_count: 0,
    deleted_at: null,
    deleted_reason: null,
    created_at: "",
    updated_at: "",
    ...over,
  };
}

describe("parseKeywords", () => {
  it("splits on CN/EN separators and dedupes", () => {
    expect(parseKeywords("a, b，c、a")).toEqual(["a", "b", "c"]);
  });
  it("handles array and null", () => {
    expect(parseKeywords(["x", "y"])).toEqual(["x", "y"]);
    expect(parseKeywords(null)).toEqual([]);
  });
});

describe("matchKeywords", () => {
  it("matches case-insensitively ignoring punctuation/space", () => {
    expect(matchKeywords("Hello, WORLD!", "world")).toEqual(["world"]);
  });
  it("returns empty when no input", () => {
    expect(matchKeywords("", "world")).toEqual([]);
  });
});

describe("triggerWorldbookEntries", () => {
  it("skips disabled entries", () => {
    const r = triggerWorldbookEntries(
      [entry({ enabled: false, triggers: ["dragon"] })],
      "a dragon",
      [],
      null,
      null,
      new Set(),
    );
    expect(r.skipped[0].reason).toBe("条目已禁用");
  });
  it("marks injected when id in budget set", () => {
    const e = entry({ id: "k", triggers: ["dragon"] });
    const r = triggerWorldbookEntries([e], "dragon!", [], null, null, new Set(["k"]));
    expect(r.triggered[0].injected).toBe(true);
  });
  it("triggers but not injected when over budget", () => {
    const e = entry({ id: "k", triggers: ["dragon"] });
    const r = triggerWorldbookEntries([e], "dragon!", [], null, null, new Set());
    expect(r.triggered[0].injected).toBe(false);
  });
});

describe("advanced semantics", () => {
  it("injects a constant entry with no keyword match", () => {
    const e = entry({ id: "k", triggers: ["unrelated"], extensions: { constant: true } });
    const r = triggerWorldbookEntries([e], "nothing here", [], null, null, new Set(["k"]));
    expect(r.triggered[0].injected).toBe(true);
  });
  it("requires both primary and secondary keys when selective", () => {
    const base = { id: "k", triggers: ["dragon"], extensions: { selective: true, secondary_keys: ["fire"] } };
    const miss = triggerWorldbookEntries([entry(base)], "a dragon appears", [], null, null, new Set(["k"]));
    expect(miss.triggered).toHaveLength(0); // secondary "fire" not present
    const hit = triggerWorldbookEntries([entry(base)], "a fire dragon", [], null, null, new Set(["k"]));
    expect(hit.triggered[0].injected).toBe(true);
  });
  it("respects case_sensitive", () => {
    const lower = triggerWorldbookEntries(
      [entry({ id: "k", triggers: ["Dragon"], extensions: { case_sensitive: true } })],
      "a dragon",
      [],
      null,
      null,
      new Set(["k"]),
    );
    expect(lower.triggered).toHaveLength(0); // "dragon" != "Dragon"
    const exact = triggerWorldbookEntries(
      [entry({ id: "k", triggers: ["Dragon"], extensions: { case_sensitive: true } })],
      "a Dragon",
      [],
      null,
      null,
      new Set(["k"]),
    );
    expect(exact.triggered[0].injected).toBe(true);
  });
});
