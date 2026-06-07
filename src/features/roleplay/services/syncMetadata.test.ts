import { describe, it, expect } from "vitest";
import {
  getSyncDecision,
  setSyncDecision,
  clearSyncDecision,
  getSyncMetadata,
  setSyncMetadata,
} from "./syncMetadata";

describe("sync decision", () => {
  it("stores and reads valid decisions", () => {
    setSyncDecision("u1", "upload");
    expect(getSyncDecision("u1")).toBe("upload");
  });
  it("returns null after clear and for unknown", () => {
    setSyncDecision("u1", "download");
    clearSyncDecision("u1");
    expect(getSyncDecision("u1")).toBeNull();
    expect(getSyncDecision("nope")).toBeNull();
  });
});

describe("sync metadata", () => {
  it("round-trips JSON", () => {
    setSyncMetadata("u1", { lastSyncedAt: "2026-01-01T00:00:00Z" } as never);
    expect(getSyncMetadata("u1")).toEqual({ lastSyncedAt: "2026-01-01T00:00:00Z" });
  });
  it("returns null on corrupt json", () => {
    localStorage.setItem("rp_sync_meta_u1", "{not json");
    expect(getSyncMetadata("u1")).toBeNull();
  });
});
