import { describe, it, expect } from "vitest";
import {
  shiftIndexedSet,
  removeIndexedSet,
  truncateIndexedSet,
  parseMemorySuggestionDrafts,
} from "./useChatSession";

describe("indexed set helpers", () => {
  it("shifts indices by inserted count", () => {
    expect([...shiftIndexedSet(new Set([0, 2]), 2)]).toEqual([2, 4]);
  });
  it("removes an index and renumbers higher ones", () => {
    expect([...removeIndexedSet(new Set([0, 1, 3]), 1)]).toEqual([0, 2]);
  });
  it("truncates to max exclusive", () => {
    expect([...truncateIndexedSet(new Set([0, 1, 5]), 2)]).toEqual([0, 1]);
  });
});

describe("parseMemorySuggestionDrafts", () => {
  it("parses a JSON array, stripping code fences", () => {
    const raw = '```json\n[{"title":"A","content":"内容","salience":0.5}]\n```';
    const drafts = parseMemorySuggestionDrafts(raw, "msg-1");
    expect(drafts[0].title).toBe("A");
    expect(drafts[0].content).toBe("内容");
    expect(drafts[0].sourceMessageId).toBe("msg-1");
  });
  it("throws on content without usable memories", () => {
    expect(() => parseMemorySuggestionDrafts("不是json", null)).toThrow();
  });
});
