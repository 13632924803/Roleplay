import type { PreparedEntry } from "./types";

function strArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}
function firstString(...vals: unknown[]): string | undefined {
  for (const v of vals) if (typeof v === "string" && v.trim()) return v.trim();
  return undefined;
}

/** Map one lorebook entry into a PreparedEntry. Tolerates both the character_book
 *  spec field names (keys/secondary_keys/insertion_order/enabled) and the
 *  SillyTavern World Info export aliases (key/keysecondary/order/disable/caseSensitive).
 *  Advanced fields are captured under `extensions` (stored losslessly). */
export function mapLorebookEntry(raw: Record<string, unknown>): PreparedEntry {
  const keys = strArray(raw.keys ?? raw.key);
  const secondaryKeys = strArray(raw.secondary_keys ?? raw.keysecondary);
  const title = firstString(raw.comment, raw.name) ?? keys[0] ?? "未命名条目";
  const order =
    typeof raw.insertion_order === "number"
      ? raw.insertion_order
      : typeof raw.order === "number"
        ? raw.order
        : undefined;
  const priority = order !== undefined ? -order : 0;
  const enabled = typeof raw.enabled === "boolean" ? raw.enabled : raw.disable !== true;

  return {
    title,
    content: typeof raw.content === "string" ? raw.content : "",
    triggers: keys,
    priority,
    enabled,
    extensions: {
      secondary_keys: secondaryKeys,
      constant: raw.constant === true,
      selective: raw.selective === true,
      case_sensitive: raw.case_sensitive === true || raw.caseSensitive === true,
      position: raw.position ?? null,
      scan_depth: raw.scan_depth ?? raw.scanDepth ?? null,
      use_regex: raw.use_regex === true,
      raw,
    },
  };
}
