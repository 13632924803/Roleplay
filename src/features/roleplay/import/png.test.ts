import { describe, it, expect } from "vitest";
import { readCardJsonFromPng } from "./png";

// Build a minimal PNG: signature + one tEXt chunk (keyword + \0 + text) + IEND.
function makePng(keyword: string, text: string): ArrayBuffer {
  const enc = new TextEncoder();
  const sig = [137, 80, 78, 71, 13, 10, 26, 10];
  const data = [...enc.encode(keyword), 0, ...enc.encode(text)];
  const chunk = (type: string, body: number[]) => {
    const len = body.length;
    const typeBytes = [...enc.encode(type)];
    return [
      (len >>> 24) & 255,
      (len >>> 16) & 255,
      (len >>> 8) & 255,
      len & 255,
      ...typeBytes,
      ...body,
      0, 0, 0, 0, // fake CRC (parser ignores CRC)
    ];
  };
  const bytes = [...sig, ...chunk("tEXt", data), ...chunk("IEND", [])];
  return new Uint8Array(bytes).buffer;
}

describe("readCardJsonFromPng", () => {
  it("reads a chara (V2) tEXt chunk as base64 JSON", () => {
    const json = JSON.stringify({ spec: "chara_card_v2" });
    const png = makePng("chara", btoa(json));
    expect(readCardJsonFromPng(png)).toBe(json);
  });
  it("reads a ccv3 (V3) tEXt chunk", () => {
    const v3 = btoa(JSON.stringify({ spec: "chara_card_v3" }));
    const png = makePng("ccv3", v3);
    expect(JSON.parse(readCardJsonFromPng(png)!).spec).toBe("chara_card_v3");
  });
  it("throws on non-PNG input", () => {
    expect(() => readCardJsonFromPng(new Uint8Array([1, 2, 3]).buffer)).toThrow();
  });
});
