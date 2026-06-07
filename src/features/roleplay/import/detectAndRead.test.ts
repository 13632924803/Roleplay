import { describe, it, expect } from "vitest";
import { zipSync, strToU8 } from "fflate";
import { readCardJson } from "./detectAndRead";

function file(name: string, buf: ArrayBuffer | string, type = ""): File {
  return new File([typeof buf === "string" ? buf : new Uint8Array(buf)], name, { type });
}

describe("readCardJson", () => {
  it("reads a plain .json file", async () => {
    const json = JSON.stringify({ spec: "chara_card_v2" });
    expect(await readCardJson(file("c.json", json))).toBe(json);
  });
  it("reads a .charx file", async () => {
    const json = JSON.stringify({ spec: "chara_card_v3" });
    const zip = zipSync({ "card.json": strToU8(json) });
    expect(await readCardJson(file("c.charx", zip.buffer))).toBe(json);
  });
  it("rejects unknown content", async () => {
    await expect(readCardJson(file("c.bin", "garbage"))).rejects.toThrow();
  });
});
