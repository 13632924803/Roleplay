import { readCardJsonFromPng } from "./png";
import { readCardJsonFromCharx } from "./charx";

function hasPngMagic(b: Uint8Array): boolean {
  return b[0] === 137 && b[1] === 80 && b[2] === 78 && b[3] === 71;
}
function hasZipMagic(b: Uint8Array): boolean {
  return b[0] === 0x50 && b[1] === 0x4b;
}

/** Read a Blob/File as ArrayBuffer. Uses native arrayBuffer() when available
 *  (browsers) and falls back to FileReader (jsdom / older environments). */
export function fileToArrayBuffer(file: Blob): Promise<ArrayBuffer> {
  if (typeof file.arrayBuffer === "function") return file.arrayBuffer();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error ?? new Error("读取文件失败。"));
    reader.readAsArrayBuffer(file);
  });
}

/** Read the embedded/plain character card JSON string from a dropped file. */
export async function readCardJson(file: File): Promise<string> {
  const buffer = await fileToArrayBuffer(file);
  const head = new Uint8Array(buffer.slice(0, 4));
  if (hasPngMagic(head)) {
    const json = readCardJsonFromPng(buffer);
    if (!json) throw new Error("PNG 中未找到角色卡数据（chara/ccv3）。");
    return json;
  }
  if (hasZipMagic(head)) {
    return readCardJsonFromCharx(buffer);
  }
  // assume JSON text
  const text = new TextDecoder().decode(buffer).trim();
  if (!text.startsWith("{")) {
    throw new Error("无法识别的文件：不是 PNG / CHARX / JSON 角色卡。");
  }
  return text;
}
