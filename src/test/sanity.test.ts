import { describe, it, expect } from "vitest";

describe("test harness", () => {
  it("runs", () => {
    expect(1 + 1).toBe(2);
  });
  it("has jsdom + jest-dom", () => {
    const el = document.createElement("div");
    el.textContent = "ok";
    document.body.appendChild(el);
    expect(el).toBeInTheDocument();
  });
  it("provides a working localStorage", () => {
    localStorage.setItem("k", "v");
    expect(localStorage.getItem("k")).toBe("v");
  });
});
