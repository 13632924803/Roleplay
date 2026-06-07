import { describe, it, expect, vi } from "vitest";
import { downscaleToDataUrl } from "./avatar";

describe("downscaleToDataUrl", () => {
  it("returns null when the image fails to decode (jsdom has no canvas/image)", async () => {
    // jsdom can't decode images; simulate the Image error path deterministically.
    vi.stubGlobal(
      "Image",
      class {
        onerror: (() => void) | null = null;
        onload: (() => void) | null = null;
        width = 0;
        height = 0;
        set src(_v: string) {
          queueMicrotask(() => this.onerror?.());
        }
      },
    );
    const out = await downscaleToDataUrl(new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" }));
    expect(out).toBeNull();
  });
});
