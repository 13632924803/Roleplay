import { describe, it, expect } from "vitest";
import { mapCharacterBook } from "./lorebookMapper";

describe("mapCharacterBook", () => {
  it("maps entries and reverses insertion_order into priority", () => {
    const out = mapCharacterBook(
      {
        name: "Lore",
        entries: [
          { keys: ["dragon", "wyrm"], content: "big lizard", enabled: true, insertion_order: 5, comment: "Dragons" },
          { keys: ["king"], content: "the king", enabled: false, insertion_order: 1 },
        ],
      },
      "Aria",
    );
    expect(out!.name).toBe("Lore");
    expect(out!.entries[0]).toEqual({ title: "Dragons", content: "big lizard", triggers: ["dragon", "wyrm"], priority: -5 });
    expect(out!.entries[1].priority).toBe(-1);
    expect(out!.entries[1].title).toBe("king"); // falls back to first key
  });
  it("returns null for empty book", () => {
    expect(mapCharacterBook(undefined, "X")).toBeNull();
    expect(mapCharacterBook({ entries: [] }, "X")).toBeNull();
  });
  it("defaults book name to character-based name", () => {
    const out = mapCharacterBook({ entries: [{ keys: ["a"], content: "c" }] }, "Aria");
    expect(out!.name).toBe("Aria 的世界书");
  });
});
