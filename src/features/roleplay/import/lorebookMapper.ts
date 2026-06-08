import type { PreparedEntry, STCharacterBook } from "./types";
import { mapLorebookEntry } from "./lorebookEntry";

/** Map a ST character_book into a worldbook name + prepared entries, or null if empty.
 *  Entry mapping is shared with standalone lorebook import via mapLorebookEntry. */
export function mapCharacterBook(
  book: STCharacterBook | undefined,
  characterName: string,
): { name: string; entries: PreparedEntry[] } | null {
  if (!book || !Array.isArray(book.entries) || book.entries.length === 0) return null;
  const entries = book.entries.map((e) => mapLorebookEntry(e as Record<string, unknown>));
  const name = (typeof book.name === "string" && book.name.trim()) || `${characterName} 的世界书`;
  return { name, entries };
}
