import { describe, it, expect } from "vitest";
import { parseLorebookFile } from "./parseLorebookFile";

describe("parseLorebookFile", () => {
  it("parses object-keyed WI export ({entries:{0:..}})", () => {
    const lb = parseLorebookFile(
      JSON.stringify({
        name: "MyLore",
        entries: {
          "0": { key: ["a"], content: "ca", order: 1 },
          "1": { key: ["b"], content: "cb", order: 2 },
        },
      }),
    );
    expect(lb.name).toBe("MyLore");
    expect(lb.entries).toHaveLength(2);
    expect(lb.entries[0].triggers).toEqual(["a"]);
  });
  it("parses array form ({entries:[..]})", () => {
    const lb = parseLorebookFile(JSON.stringify({ entries: [{ keys: ["x"], content: "c" }] }));
    expect(lb.entries[0].triggers).toEqual(["x"]);
  });
  it("parses lorebook_v3 ({spec,data:{entries:[..]}})", () => {
    const lb = parseLorebookFile(
      JSON.stringify({ spec: "lorebook_v3", data: { name: "V3", entries: [{ keys: ["z"], content: "c" }] } }),
    );
    expect(lb.name).toBe("V3");
    expect(lb.entries[0].triggers).toEqual(["z"]);
  });
  it("throws on a non-lorebook object", () => {
    expect(() => parseLorebookFile(JSON.stringify({ foo: 1 }))).toThrow();
  });
});
