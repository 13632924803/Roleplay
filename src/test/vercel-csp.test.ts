import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

describe("vercel security headers", () => {
  it("declares a Content-Security-Policy with expected directives", () => {
    // vitest runs from the project root, so a cwd-relative path resolves vercel.json.
    const vercel = JSON.parse(readFileSync("vercel.json", "utf-8"));
    const headers = vercel.headers[0].headers as { key: string; value: string }[];
    const csp = headers.find((h) => h.key === "Content-Security-Policy");
    expect(csp).toBeTruthy();
    // Security-critical: scripts restricted to self (no inline/eval) — the core
    // XSS protection — plus anti-clickjacking and object lockdown.
    expect(csp!.value).toContain("default-src 'self'");
    expect(csp!.value).toContain("script-src 'self'");
    expect(csp!.value).toContain("frame-ancestors 'none'");
    expect(csp!.value).toContain("object-src 'none'");
    // connect/img stay open over https for BYOK base URLs and remote avatars.
    expect(csp!.value).toContain("connect-src 'self' https:");
  });
});
