import { unzipSync, strFromU8 } from "fflate";

/** Read the root card.json string from a .charx (zip) buffer. */
export function readCardJsonFromCharx(buffer: ArrayBuffer): string {
  const files = unzipSync(new Uint8Array(buffer));
  const entry = files["card.json"];
  if (!entry) throw new Error("CHARX 文件缺少 card.json。");
  return strFromU8(entry);
}
