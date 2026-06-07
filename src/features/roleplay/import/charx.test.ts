import { describe, it, expect } from "vitest";
import { zipSync, strToU8 } from "fflate";
import { readCardJsonFromCharx } from "./charx";

describe("readCardJsonFromCharx", () => {
  it("reads card.json from a charx zip", () => {
    const json = JSON.stringify({ spec: "chara_card_v3", data: { name: "X" } });
    const zip = zipSync({ "card.json": strToU8(json) });
    expect(readCardJsonFromCharx(zip.buffer)).toBe(json);
  });
  it("throws when card.json is missing", () => {
    const zip = zipSync({ "other.txt": strToU8("nope") });
    expect(() => readCardJsonFromCharx(zip.buffer)).toThrow();
  });
});
