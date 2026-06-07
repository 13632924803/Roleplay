import { describe, it, expect } from "vitest";
import { createStreamQueue } from "./streamQueue";

describe("createStreamQueue", () => {
  it("yields pushed values in order then completes", async () => {
    const q = createStreamQueue<number>();
    q.push(1);
    q.push(2);
    q.close();
    const out: number[] = [];
    for await (const v of q.iterable) out.push(v);
    expect(out).toEqual([1, 2]);
  });

  it("delivers values pushed after consumer starts waiting", async () => {
    const q = createStreamQueue<string>();
    const collected: string[] = [];
    const done = (async () => {
      for await (const v of q.iterable) collected.push(v);
    })();
    await Promise.resolve();
    q.push("a");
    q.push("b");
    q.close();
    await done;
    expect(collected).toEqual(["a", "b"]);
  });

  it("propagates errors", async () => {
    const q = createStreamQueue<number>();
    q.fail(new Error("boom"));
    await expect(
      (async () => {
        for await (const _ of q.iterable) void _;
      })(),
    ).rejects.toThrow("boom");
  });
});
