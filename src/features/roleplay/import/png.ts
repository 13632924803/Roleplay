const PNG_SIG = [137, 80, 78, 71, 13, 10, 26, 10];

function latin1(bytes: Uint8Array, start: number, end: number): string {
  let s = "";
  for (let i = start; i < end; i++) s += String.fromCharCode(bytes[i]);
  return s;
}

/** Extract the value of the first tEXt chunk matching `keyword`, or null. */
function extractTextChunk(buffer: ArrayBuffer, keyword: string): string | null {
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < 8; i++) {
    if (bytes[i] !== PNG_SIG[i]) throw new Error("不是有效的 PNG 文件。");
  }
  const dv = new DataView(buffer);
  let off = 8;
  while (off + 8 <= bytes.length) {
    const len = dv.getUint32(off);
    off += 4;
    const type = latin1(bytes, off, off + 4);
    off += 4;
    if (type === "tEXt") {
      let nul = off;
      const dataEnd = off + len;
      while (nul < dataEnd && bytes[nul] !== 0) nul++;
      const kw = latin1(bytes, off, nul);
      if (kw === keyword) return latin1(bytes, nul + 1, dataEnd);
    }
    off += len + 4; // data + CRC
    if (type === "IEND") break;
  }
  return null;
}

function base64Utf8ToString(b64: string): string {
  const binary = atob(b64.trim());
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/** Read embedded character card JSON from a PNG (ccv3 preferred, then chara). */
export function readCardJsonFromPng(buffer: ArrayBuffer): string | null {
  const raw = extractTextChunk(buffer, "ccv3") ?? extractTextChunk(buffer, "chara");
  if (raw == null) return null;
  return base64Utf8ToString(raw);
}
