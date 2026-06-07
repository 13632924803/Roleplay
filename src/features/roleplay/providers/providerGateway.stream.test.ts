import { describe, it, expect, vi } from "vitest";

vi.mock("../services/hostedCredentialsService", () => ({
  sendHostedProviderChatStream: async (
    _input: unknown,
    cb: { onDelta: (t: string) => void; onUsage: (u: unknown) => void; onDone: () => void },
  ) => {
    cb.onDelta("Hello");
    cb.onDelta(" world");
    cb.onDone();
  },
  testHostedCredential: vi.fn(),
  sendHostedProviderChat: vi.fn(),
}));

describe("sendProviderStreamRequest (hosted)", () => {
  it("yields deltas in order without polling", async () => {
    const { sendProviderStreamRequest } = await import("./providerGateway");
    const cfg = {
      provider: "deepseek",
      model: "deepseek-v4-flash",
      baseURL: "",
      apiKey: "",
      apiKeyStorageMode: "hosted_encrypted",
      credentialId: "cred-1",
      temperature: 1,
      maxTokens: 100,
      streamEnabled: true,
    } as never;

    const chunks: string[] = [];
    for await (const c of sendProviderStreamRequest(false, cfg, [{ role: "user", content: "hi" }])) {
      if (c.content) chunks.push(c.content);
    }
    expect(chunks.join("")).toBe("Hello world");
  });
});
