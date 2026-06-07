import { describe, it, expect } from "vitest";
import { prepareImport } from "./prepareImport";

function jsonFile(obj: unknown): File {
  return new File([JSON.stringify(obj)], "c.json", { type: "application/json" });
}

describe("prepareImport", () => {
  it("prepares a V2 card with embedded book", async () => {
    const out = await prepareImport(
      jsonFile({
        spec: "chara_card_v2",
        data: {
          name: "Aria",
          description: "fox",
          personality: "kind",
          scenario: "tavern",
          first_mes: "hi",
          mes_example: "ex",
          tags: ["rpg"],
          character_book: { name: "Lore", entries: [{ keys: ["dragon"], content: "big", insertion_order: 2 }] },
        },
      }),
    );
    expect(out.name).toBe("Aria");
    expect(out.card.identity).toBe("fox");
    expect(out.worldbook!.name).toBe("Lore");
    expect(out.worldbook!.entries[0].triggers).toEqual(["dragon"]);
    expect(out.avatarDataUrl).toBeNull(); // JSON file has no image
  });
  it("has null worldbook when no character_book", async () => {
    const out = await prepareImport(jsonFile({ name: "Solo", first_mes: "hey", description: "d" }));
    expect(out.worldbook).toBeNull();
    expect(out.sourceSpec).toBe("v1");
  });
});
