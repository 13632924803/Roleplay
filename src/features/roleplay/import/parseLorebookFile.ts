import { mapLorebookEntry } from "./lorebookEntry";
import type { ImportedLorebook } from "./types";

function entriesToArray(entries: unknown): Record<string, unknown>[] {
  if (Array.isArray(entries)) return entries as Record<string, unknown>[];
  if (entries && typeof entries === "object") {
    return Object.values(entries as Record<string, unknown>).filter(
      (e): e is Record<string, unknown> => !!e && typeof e === "object",
    );
  }
  return [];
}

/** Parse a standalone lorebook file (object-keyed WI, array, or lorebook_v3). */
export function parseLorebookFile(jsonText: string): ImportedLorebook {
  let obj: unknown;
  try {
    obj = JSON.parse(jsonText);
  } catch {
    throw new Error("世界书不是有效的 JSON。");
  }
  if (!obj || typeof obj !== "object") throw new Error("世界书格式无效。");
  const o = obj as Record<string, unknown>;

  // lorebook_v3 nests under `data`; otherwise `entries` is at the top level.
  const container =
    o.spec === "lorebook_v3" && o.data && typeof o.data === "object"
      ? (o.data as Record<string, unknown>)
      : o;
  const rawEntries = entriesToArray(container.entries);
  if (rawEntries.length === 0) throw new Error("未找到世界书条目（entries）。");

  const name =
    (typeof container.name === "string" && container.name.trim()) ||
    `导入的世界书 ${new Date().toISOString().slice(0, 10)}`;
  return { name, entries: rawEntries.map(mapLorebookEntry) };
}
