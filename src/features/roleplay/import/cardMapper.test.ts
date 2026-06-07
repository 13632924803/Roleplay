import { describe, it, expect } from "vitest";
import { mapCard } from "./cardMapper";
import type { NormalizedCard } from "./types";

function card(over: Partial<NormalizedCard>): NormalizedCard {
  return {
    sourceSpec: "v2",
    name: "Aria",
    description: "a fox",
    personality: "tsundere",
    scenario: "a tavern",
    first_mes: "hello",
    mes_example: "<example>",
    raw: { spec: "chara_card_v2" },
    ...over,
  };
}

describe("mapCard", () => {
  it("fills structured fields best-effort", () => {
    const { name, card: c, tags } = mapCard(card({ tags: ["fox", "rpg"] }));
    expect(name).toBe("Aria");
    expect(c.identity).toBe("a fox");
    expect(c.personality).toBe("tsundere");
    expect(c.background).toBe("a tavern");
    expect(c.greeting).toBe("hello");
    expect(tags).toEqual(["fox", "rpg"]);
  });
  it("losslessly preserves the original card under extra_settings.sillytavern", () => {
    const { card: c } = mapCard(card({ system_prompt: "SP", post_history_instructions: "PHI" }));
    const st = (c.extra_settings as Record<string, Record<string, unknown>>).sillytavern;
    expect(st.sourceSpec).toBe("v2");
    expect(st.system_prompt).toBe("SP");
    expect(st.post_history_instructions).toBe("PHI");
    expect(st.raw).toEqual({ spec: "chara_card_v2" });
  });
  it("seeds an empty bindings block", () => {
    const { card: c } = mapCard(card({}));
    expect((c.extra_settings as Record<string, unknown>).bindings).toEqual({ worldbook_id: null });
  });
});
