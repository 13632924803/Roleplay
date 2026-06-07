import { describe, it, expect, vi, beforeEach } from "vitest";
import { logger, setLogLevel } from "./logger";

describe("logger", () => {
  beforeEach(() => setLogLevel("debug"));

  it("forwards error to console.error", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    logger.error("x");
    expect(spy).toHaveBeenCalledWith("x");
  });

  it("suppresses debug when level is warn", () => {
    setLogLevel("warn");
    const spy = vi.spyOn(console, "debug").mockImplementation(() => {});
    logger.debug("hidden");
    expect(spy).not.toHaveBeenCalled();
  });

  it("emits warn and error at warn level", () => {
    setLogLevel("warn");
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    logger.warn("w");
    logger.error("e");
    expect(warnSpy).toHaveBeenCalledWith("w");
    expect(errSpy).toHaveBeenCalledWith("e");
  });
});
