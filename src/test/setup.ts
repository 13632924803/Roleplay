import "@testing-library/jest-dom/vitest";
import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";

// Node 22+ ships an experimental globalThis.localStorage that is `undefined`
// unless `--localstorage-file` is passed, which shadows jsdom's localStorage.
// Provide a deterministic in-memory Storage so tests relying on localStorage
// (e.g. syncMetadata) work consistently across Node versions.
function createMemoryStorage(): Storage {
  let store: Record<string, string> = {};
  return {
    get length() {
      return Object.keys(store).length;
    },
    clear() {
      store = {};
    },
    getItem(key: string) {
      return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null;
    },
    setItem(key: string, value: string) {
      store[key] = String(value);
    },
    removeItem(key: string) {
      delete store[key];
    },
    key(index: number) {
      return Object.keys(store)[index] ?? null;
    },
  } as Storage;
}

vi.stubGlobal("localStorage", createMemoryStorage());

afterEach(() => {
  cleanup();
  localStorage.clear();
});
