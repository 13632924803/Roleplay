import { readCardJson, fileToArrayBuffer } from "./detectAndRead";
import { parseCard } from "./parseCard";
import { mapCard } from "./cardMapper";
import { mapCharacterBook } from "./lorebookMapper";
import { downscaleToDataUrl } from "./avatar";
import type { PreparedImport } from "./types";

/** Read + parse + map a file into a PreparedImport (no persistence). */
export async function prepareImport(file: File): Promise<PreparedImport> {
  const jsonText = await readCardJson(file);
  const normalized = parseCard(jsonText);
  const { name, card, tags } = mapCard(normalized);
  const worldbook = mapCharacterBook(normalized.character_book, name);

  // Avatar: only PNG files carry the portrait image itself.
  let avatarDataUrl: string | null = null;
  const head = new Uint8Array((await fileToArrayBuffer(file)).slice(0, 4));
  if (head[0] === 137 && head[1] === 80 && head[2] === 78 && head[3] === 71) {
    avatarDataUrl = await downscaleToDataUrl(file);
  }

  return { sourceSpec: normalized.sourceSpec, name, card, tags, avatarDataUrl, worldbook };
}
