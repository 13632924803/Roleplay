// @vitest-environment node
import { describe, it, expect, beforeAll } from "vitest";

const SECRET = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))));

beforeAll(() => {
  (globalThis as Record<string, unknown>).Deno = {
    env: { get: (k: string) => (k === "API_KEY_ENCRYPTION_SECRET" ? SECRET : undefined) },
  };
});

describe("crypto round-trip", () => {
  it("decrypts what it encrypts", async () => {
    const { encryptApiKey, decryptApiKey } = await import("./crypto.ts");
    const { encrypted_api_key, encryption_iv } = await encryptApiKey("sk-secret-123");
    const back = await decryptApiKey(encrypted_api_key, encryption_iv);
    expect(back).toBe("sk-secret-123");
  });
  it("produces a stable fingerprint", async () => {
    const { createKeyFingerprint } = await import("./crypto.ts");
    const a = await createKeyFingerprint("sk-x");
    const b = await createKeyFingerprint("sk-x");
    expect(a).toBe(b);
    expect(a).not.toHaveLength(0);
  });
});

describe("crypto secret hardening", () => {
  it("throws on an invalid (non-base64 / wrong-length) secret instead of weak fallback", async () => {
    (globalThis as Record<string, unknown>).Deno = {
      env: { get: (k: string) => (k === "API_KEY_ENCRYPTION_SECRET" ? "too-short" : undefined) },
    };
    const { encryptApiKey } = await import("./crypto.ts");
    await expect(encryptApiKey("x")).rejects.toThrow();
  });
});
