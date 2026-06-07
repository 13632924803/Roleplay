import type { PreparedEntry, STCharacterBook } from "./types";

/** Map a ST character_book into a worldbook name + prepared entries, or null if empty. */
export function mapCharacterBook(
  book: STCharacterBook | undefined,
  characterName: string,
): { name: string; entries: PreparedEntry[] } | null {
  if (!book || !Array.isArray(book.entries) || book.entries.length === 0) return null;

  const entries: PreparedEntry[] = book.entries.map((e) => {
    const keys = Array.isArray(e.keys) ? e.keys.filter((k): k is string => typeof k === "string") : [];
    const title =
      (typeof e.comment === "string" && e.comment.trim()) ||
      (typeof e.name === "string" && e.name.trim()) ||
      keys[0] ||
      "未命名条目";
    // ST: lower insertion_order = inserted earlier. App: higher priority = kept first.
    // Negate to preserve relative order without assuming an upper bound.
    const priority = typeof e.insertion_order === "number" ? -e.insertion_order : 0;
    return {
      title,
      content: typeof e.content === "string" ? e.content : "",
      triggers: keys,
      priority,
    };
  });

  const name = (typeof book.name === "string" && book.name.trim()) || `${characterName} 的世界书`;
  return { name, entries };
}
