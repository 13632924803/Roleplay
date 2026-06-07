import { describe, it, expect } from "vitest";
import { parseCard } from "./parseCard";

describe("parseCard", () => {
  it("parses a V2 card", () => {
    const c = parseCard(
      JSON.stringify({
        spec: "chara_card_v2",
        data: {
          name: "Aria",
          description: "desc",
          personality: "kind",
          scenario: "scene",
          first_mes: "hi",
          mes_example: "ex",
          tags: ["a"],
        },
      }),
    );
    expect(c.sourceSpec).toBe("v2");
    expect(c.name).toBe("Aria");
    expect(c.first_mes).toBe("hi");
    expect(c.tags).toEqual(["a"]);
  });
  it("parses a V3 card with nickname", () => {
    const c = parseCard(
      JSON.stringify({
        spec: "chara_card_v3",
        data: { name: "Vex", nickname: "V", description: "d", first_mes: "yo" },
      }),
    );
    expect(c.sourceSpec).toBe("v3");
    expect(c.nickname).toBe("V");
  });
  it("parses a flat V1 card", () => {
    const c = parseCard(
      JSON.stringify({
        name: "Old",
        description: "d",
        first_mes: "hey",
        personality: "p",
        scenario: "s",
        mes_example: "m",
      }),
    );
    expect(c.sourceSpec).toBe("v1");
    expect(c.name).toBe("Old");
  });
  it("throws on non-card json", () => {
    expect(() => parseCard(JSON.stringify({ foo: 1 }))).toThrow();
  });
});
