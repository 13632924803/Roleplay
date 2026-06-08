import { describe, it, expect } from "vitest";
import { mapLorebookEntry } from "./lorebookEntry";

describe("mapLorebookEntry", () => {
  it("maps character_book spec fields (keys/secondary_keys/insertion_order/enabled)", () => {
    const e = mapLorebookEntry({
      keys: ["dragon"],
      secondary_keys: ["fire"],
      content: "c",
      comment: "Dragon",
      insertion_order: 5,
      enabled: true,
      constant: false,
      selective: true,
      case_sensitive: true,
    });
    expect(e.title).toBe("Dragon");
    expect(e.triggers).toEqual(["dragon"]);
    expect(e.priority).toBe(-5);
    expect(e.enabled).toBe(true);
    expect(e.extensions.secondary_keys).toEqual(["fire"]);
    expect(e.extensions.selective).toBe(true);
    expect(e.extensions.case_sensitive).toBe(true);
  });
  it("maps ST World Info export aliases (key/keysecondary/order/disable/caseSensitive)", () => {
    const e = mapLorebookEntry({
      key: ["king"],
      keysecondary: ["throne"],
      content: "c",
      comment: "King",
      order: 3,
      disable: true,
      constant: true,
      caseSensitive: true,
    });
    expect(e.triggers).toEqual(["king"]);
    expect(e.priority).toBe(-3);
    expect(e.enabled).toBe(false); // disable: true
    expect(e.extensions.constant).toBe(true);
    expect(e.extensions.secondary_keys).toEqual(["throne"]);
    expect(e.extensions.case_sensitive).toBe(true);
  });
  it("falls back title to first key, defaults enabled true", () => {
    const e = mapLorebookEntry({ key: ["solo"], content: "c" });
    expect(e.title).toBe("solo");
    expect(e.enabled).toBe(true);
    expect(e.priority).toBe(0);
  });
});
