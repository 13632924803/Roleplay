# SillyTavern 角色卡导入 实现计划（子项目 1）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让用户把 SillyTavern 角色卡（V1/V2/V3，JSON/PNG/CHARX）直接导入即用，内嵌世界书按角色绑定、新建会话选中该角色时自动挂载。

**Architecture:** 四层纯函数管线（提取→解析→映射→落库）+ 一个 UI 导入入口。解析/映射全是可单测纯函数；落库复用现有 useCharacters/useWorldbooks 钩子（自带 local/cloud/镜像分支）；提示词管线加"酒馆分支"，现有行为不变。

**Tech Stack:** TypeScript + Vitest + React Testing Library + fflate（仅 CHARX 解 zip）+ 浏览器 canvas（头像缩放）。

**关联 spec:** `docs/superpowers/specs/2026-06-07-sillytavern-card-import-design.md`
**分支:** `feat/sillytavern-card-import`

---

## 文件结构

**新建（`src/features/roleplay/import/`）：**
- `types.ts` — `NormalizedCard` / `STCharacterBook` / `STCharacterBookEntry` / `PreparedImport` / `PreparedEntry`
- `png.ts` — 从 PNG ArrayBuffer 读 tEXt chunk，解出卡 JSON 字符串
- `charx.ts` — 从 .charx zip 读 `card.json`
- `detectAndRead.ts` — 按 magic bytes/扩展名探测载体，返回卡 JSON 字符串
- `parseCard.ts` — 卡 JSON → `NormalizedCard`（识别 V1/V2/V3）
- `cardMapper.ts` — `NormalizedCard` → `{ name, card, tags }`
- `lorebookMapper.ts` — `STCharacterBook` → `{ name, entries: PreparedEntry[] }`
- `avatar.ts` — Blob → 缩放 data URL
- `prepareImport.ts` — 编排：File → `PreparedImport`（纯准备，不落库）
- 各 `*.test.ts`

**修改：**
- `package.json` — 加 `fflate` 依赖
- `src/features/roleplay/utils/characterPrompt.ts` — 加酒馆分支 + `getBoundWorldbookId`
- `src/features/roleplay/hooks/useCharacters.ts` — `create` 增加可选 `avatarPath`
- `src/features/roleplay/hooks/useChatSession.ts:712-721,764` — createSession 自动挂载绑定世界书
- `src/features/roleplay/components/studio/CharacterList.tsx` — 加「导入」按钮 + onImport + 头像图显示
- `src/pages/StudioPage.tsx` — 接 import 预览弹窗 + 落库
- 新建 `src/features/roleplay/components/studio/ImportPreviewModal.tsx`

---

# 阶段 1 — 依赖与类型

### Task 1: 安装 fflate + 定义导入类型

**Files:** Modify `package.json`; Create `src/features/roleplay/import/types.ts`

- [ ] **Step 1: 安装 fflate**

Run: `npm install fflate@^0.8`
Expected: `added 1 package`。

- [ ] **Step 2: 创建 `types.ts`**

```ts
import type { CharacterCardData } from "../utils/characterPrompt";

export type SourceSpec = "v1" | "v2" | "v3";

export interface STCharacterBookEntry {
  keys?: string[];
  content?: string;
  enabled?: boolean;
  insertion_order?: number;
  name?: string;
  comment?: string;
  // advanced fields preserved but not interpreted in sub-project 1
  [k: string]: unknown;
}

export interface STCharacterBook {
  name?: string;
  entries?: STCharacterBookEntry[];
  [k: string]: unknown;
}

export interface NormalizedCard {
  sourceSpec: SourceSpec;
  name: string;
  description: string;
  personality: string;
  scenario: string;
  first_mes: string;
  mes_example: string;
  system_prompt?: string;
  post_history_instructions?: string;
  alternate_greetings?: string[];
  creator_notes?: string;
  tags?: string[];
  creator?: string;
  character_version?: string;
  nickname?: string;
  character_book?: STCharacterBook;
  extensions?: Record<string, unknown>;
  raw: unknown;
}

export interface PreparedEntry {
  title: string;
  content: string;
  triggers: string[];
  priority: number;
}

export interface PreparedImport {
  sourceSpec: SourceSpec;
  name: string;
  card: CharacterCardData;
  tags: string[];
  avatarDataUrl: string | null;
  worldbook: { name: string; entries: PreparedEntry[] } | null;
}
```

- [ ] **Step 3: 提交** — `git add package.json package-lock.json src/features/roleplay/import/types.ts && git commit -m "feat(import): add fflate + import types"`

---

# 阶段 2 — 提取层

### Task 2: PNG tEXt chunk 解析

**Files:** Create `src/features/roleplay/import/png.ts`, `png.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
import { describe, it, expect } from "vitest";
import { readCardJsonFromPng } from "./png";

// Build a minimal PNG: signature + one tEXt chunk (keyword + \0 + base64) + IEND.
function makePng(keyword: string, text: string): ArrayBuffer {
  const enc = new TextEncoder();
  const sig = [137, 80, 78, 71, 13, 10, 26, 10];
  const data = [...enc.encode(keyword), 0, ...enc.encode(text)];
  const chunk = (type: string, body: number[]) => {
    const len = body.length;
    const typeBytes = [...enc.encode(type)];
    return [
      (len >>> 24) & 255, (len >>> 16) & 255, (len >>> 8) & 255, len & 255,
      ...typeBytes, ...body,
      0, 0, 0, 0, // fake CRC (parser ignores CRC)
    ];
  };
  const bytes = [...sig, ...chunk("tEXt", data), ...chunk("IEND", [])];
  return new Uint8Array(bytes).buffer;
}

describe("readCardJsonFromPng", () => {
  it("reads a chara (V2) tEXt chunk as base64 JSON", () => {
    const json = JSON.stringify({ spec: "chara_card_v2" });
    const b64 = btoa(json);
    const png = makePng("chara", b64);
    expect(readCardJsonFromPng(png)).toBe(json);
  });
  it("prefers ccv3 over chara when both exist", () => {
    // craft a PNG with both: ccv3 first
    const v3 = btoa(JSON.stringify({ spec: "chara_card_v3" }));
    const png = makePng("ccv3", v3);
    expect(JSON.parse(readCardJsonFromPng(png)!).spec).toBe("chara_card_v3");
  });
  it("throws on non-PNG input", () => {
    expect(() => readCardJsonFromPng(new Uint8Array([1, 2, 3]).buffer)).toThrow();
  });
});
```

- [ ] **Step 2: 运行确认失败** — `npm run test -- import/png` — Expected: FAIL（模块不存在）。

- [ ] **Step 3: 实现 `png.ts`**

```ts
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
```

- [ ] **Step 4: 运行确认通过** — `npm run test -- import/png` — Expected: 3 passed.
- [ ] **Step 5: 提交** — `git commit -m "feat(import): PNG tEXt card extraction"`

---

### Task 3: CHARX zip 解析

**Files:** Create `src/features/roleplay/import/charx.ts`, `charx.test.ts`

- [ ] **Step 1: 写失败测试**（用 fflate 造一个含 card.json 的 zip）

```ts
import { describe, it, expect } from "vitest";
import { zipSync, strToU8 } from "fflate";
import { readCardJsonFromCharx } from "./charx";

describe("readCardJsonFromCharx", () => {
  it("reads card.json from a charx zip", () => {
    const json = JSON.stringify({ spec: "chara_card_v3", data: { name: "X" } });
    const zip = zipSync({ "card.json": strToU8(json) });
    expect(readCardJsonFromCharx(zip.buffer)).toBe(json);
  });
  it("throws when card.json is missing", () => {
    const zip = zipSync({ "other.txt": strToU8("nope") });
    expect(() => readCardJsonFromCharx(zip.buffer)).toThrow();
  });
});
```

- [ ] **Step 2: 运行确认失败** — `npm run test -- import/charx` — Expected: FAIL.

- [ ] **Step 3: 实现 `charx.ts`**

```ts
import { unzipSync, strFromU8 } from "fflate";

/** Read the root card.json string from a .charx (zip) buffer. */
export function readCardJsonFromCharx(buffer: ArrayBuffer): string {
  const files = unzipSync(new Uint8Array(buffer));
  const entry = files["card.json"];
  if (!entry) throw new Error("CHARX 文件缺少 card.json。");
  return strFromU8(entry);
}
```

- [ ] **Step 4: 运行确认通过** — `npm run test -- import/charx` — Expected: 2 passed.
- [ ] **Step 5: 提交** — `git commit -m "feat(import): CHARX zip card extraction"`

---

### Task 4: 载体探测

**Files:** Create `src/features/roleplay/import/detectAndRead.ts`, `detectAndRead.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
import { describe, it, expect } from "vitest";
import { zipSync, strToU8 } from "fflate";
import { readCardJson } from "./detectAndRead";

function file(name: string, buf: ArrayBuffer | string, type = ""): File {
  return new File([typeof buf === "string" ? buf : new Uint8Array(buf)], name, { type });
}

describe("readCardJson", () => {
  it("reads a plain .json file", async () => {
    const json = JSON.stringify({ spec: "chara_card_v2" });
    expect(await readCardJson(file("c.json", json))).toBe(json);
  });
  it("reads a .charx file", async () => {
    const json = JSON.stringify({ spec: "chara_card_v3" });
    const zip = zipSync({ "card.json": strToU8(json) });
    expect(await readCardJson(file("c.charx", zip.buffer))).toBe(json);
  });
  it("rejects unknown content", async () => {
    await expect(readCardJson(file("c.bin", "garbage"))).rejects.toThrow();
  });
});
```

- [ ] **Step 2: 运行确认失败** — `npm run test -- detectAndRead` — Expected: FAIL.

- [ ] **Step 3: 实现 `detectAndRead.ts`**

```ts
import { readCardJsonFromPng } from "./png";
import { readCardJsonFromCharx } from "./charx";

function hasPngMagic(b: Uint8Array): boolean {
  return b[0] === 137 && b[1] === 80 && b[2] === 78 && b[3] === 71;
}
function hasZipMagic(b: Uint8Array): boolean {
  return b[0] === 0x50 && b[1] === 0x4b;
}

/** Read the embedded/plain character card JSON string from a dropped file. */
export async function readCardJson(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
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
  if (!text.startsWith("{")) throw new Error("无法识别的文件：不是 PNG / CHARX / JSON 角色卡。");
  return text;
}
```

- [ ] **Step 4: 运行确认通过** — `npm run test -- detectAndRead` — Expected: 3 passed.
- [ ] **Step 5: 提交** — `git commit -m "feat(import): file carrier detection"`

---

# 阶段 3 — 解析层

### Task 5: V1/V2/V3 → NormalizedCard

**Files:** Create `src/features/roleplay/import/parseCard.ts`, `parseCard.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
import { describe, it, expect } from "vitest";
import { parseCard } from "./parseCard";

describe("parseCard", () => {
  it("parses a V2 card", () => {
    const c = parseCard(JSON.stringify({
      spec: "chara_card_v2",
      data: { name: "Aria", description: "desc", personality: "kind", scenario: "scene", first_mes: "hi", mes_example: "ex", tags: ["a"] },
    }));
    expect(c.sourceSpec).toBe("v2");
    expect(c.name).toBe("Aria");
    expect(c.first_mes).toBe("hi");
    expect(c.tags).toEqual(["a"]);
  });
  it("parses a V3 card with nickname", () => {
    const c = parseCard(JSON.stringify({
      spec: "chara_card_v3",
      data: { name: "Vex", nickname: "V", description: "d", first_mes: "yo" },
    }));
    expect(c.sourceSpec).toBe("v3");
    expect(c.nickname).toBe("V");
  });
  it("parses a flat V1 card", () => {
    const c = parseCard(JSON.stringify({ name: "Old", description: "d", first_mes: "hey", personality: "p", scenario: "s", mes_example: "m" }));
    expect(c.sourceSpec).toBe("v1");
    expect(c.name).toBe("Old");
  });
  it("throws on non-card json", () => {
    expect(() => parseCard(JSON.stringify({ foo: 1 }))).toThrow();
  });
});
```

- [ ] **Step 2: 运行确认失败** — `npm run test -- parseCard` — Expected: FAIL.

- [ ] **Step 3: 实现 `parseCard.ts`**

```ts
import type { NormalizedCard, SourceSpec, STCharacterBook } from "./types";

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}
function strArr(v: unknown): string[] | undefined {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : undefined;
}

function fromData(data: Record<string, unknown>, spec: SourceSpec, raw: unknown): NormalizedCard {
  return {
    sourceSpec: spec,
    name: str(data.name),
    description: str(data.description),
    personality: str(data.personality),
    scenario: str(data.scenario),
    first_mes: str(data.first_mes),
    mes_example: str(data.mes_example),
    system_prompt: str(data.system_prompt) || undefined,
    post_history_instructions: str(data.post_history_instructions) || undefined,
    alternate_greetings: strArr(data.alternate_greetings),
    creator_notes: str(data.creator_notes) || undefined,
    tags: strArr(data.tags),
    creator: str(data.creator) || undefined,
    character_version: str(data.character_version) || undefined,
    nickname: str(data.nickname) || undefined,
    character_book: (data.character_book as STCharacterBook) ?? undefined,
    extensions: (data.extensions as Record<string, unknown>) ?? undefined,
    raw,
  };
}

/** Parse a card JSON string (V1 flat / V2 / V3) into a NormalizedCard. */
export function parseCard(jsonText: string): NormalizedCard {
  let obj: unknown;
  try {
    obj = JSON.parse(jsonText);
  } catch {
    throw new Error("角色卡不是有效的 JSON。");
  }
  if (!obj || typeof obj !== "object") throw new Error("角色卡格式无效。");
  const o = obj as Record<string, unknown>;

  if (o.spec === "chara_card_v3" && o.data && typeof o.data === "object") {
    return fromData(o.data as Record<string, unknown>, "v3", obj);
  }
  if (o.spec === "chara_card_v2" && o.data && typeof o.data === "object") {
    return fromData(o.data as Record<string, unknown>, "v2", obj);
  }
  // V1: flat object — require at least name + first_mes/description to look like a card
  if (typeof o.name === "string" && (typeof o.first_mes === "string" || typeof o.description === "string")) {
    return fromData(o, "v1", obj);
  }
  throw new Error("无法识别的角色卡：缺少 spec 或必要字段。");
}
```

- [ ] **Step 4: 运行确认通过** — `npm run test -- parseCard` — Expected: 4 passed.
- [ ] **Step 5: 提交** — `git commit -m "feat(import): parse V1/V2/V3 into NormalizedCard"`

---

# 阶段 4 — 映射层

### Task 6: lorebookMapper（内嵌世界书）

**Files:** Create `src/features/roleplay/import/lorebookMapper.ts`, `lorebookMapper.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
import { describe, it, expect } from "vitest";
import { mapCharacterBook } from "./lorebookMapper";

describe("mapCharacterBook", () => {
  it("maps entries and reverses insertion_order into priority", () => {
    const out = mapCharacterBook({
      name: "Lore",
      entries: [
        { keys: ["dragon", "wyrm"], content: "big lizard", enabled: true, insertion_order: 5, comment: "Dragons" },
        { keys: ["king"], content: "the king", enabled: false, insertion_order: 1 },
      ],
    }, "Aria");
    expect(out!.name).toBe("Lore");
    expect(out!.entries[0]).toEqual({ title: "Dragons", content: "big lizard", triggers: ["dragon", "wyrm"], priority: -5 });
    expect(out!.entries[1].priority).toBe(-1);
    expect(out!.entries[1].title).toBe("king"); // falls back to first key
  });
  it("returns null for empty book", () => {
    expect(mapCharacterBook(undefined, "X")).toBeNull();
    expect(mapCharacterBook({ entries: [] }, "X")).toBeNull();
  });
  it("defaults book name to character-based name", () => {
    const out = mapCharacterBook({ entries: [{ keys: ["a"], content: "c" }] }, "Aria");
    expect(out!.name).toBe("Aria 的世界书");
  });
});
```

- [ ] **Step 2: 运行确认失败** — `npm run test -- lorebookMapper` — Expected: FAIL.

- [ ] **Step 3: 实现 `lorebookMapper.ts`**

```ts
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
    return { title, content: typeof e.content === "string" ? e.content : "", triggers: keys, priority };
  });

  const name = (typeof book.name === "string" && book.name.trim()) || `${characterName} 的世界书`;
  return { name, entries };
}
```

- [ ] **Step 4: 运行确认通过** — `npm run test -- lorebookMapper` — Expected: 3 passed.
- [ ] **Step 5: 提交** — `git commit -m "feat(import): map character_book to worldbook entries"`

---

### Task 7: cardMapper（字段映射 + 无损保留）

**Files:** Create `src/features/roleplay/import/cardMapper.ts`, `cardMapper.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
import { describe, it, expect } from "vitest";
import { mapCard } from "./cardMapper";
import type { NormalizedCard } from "./types";

function card(over: Partial<NormalizedCard>): NormalizedCard {
  return {
    sourceSpec: "v2", name: "Aria", description: "a fox", personality: "tsundere",
    scenario: "a tavern", first_mes: "hello", mes_example: "<example>",
    raw: { spec: "chara_card_v2" }, ...over,
  };
}

describe("mapCard", () => {
  it("fills structured fields best-effort", () => {
    const { name, card: c, tags } = mapCard(card({ tags: ["fox", "rpg"] }));
    expect(name).toBe("Aria");
    expect(c.identity).toBe("a fox");
    expect(c.personality).toBe("tsundere");
    expect(c.background).toBe("a tavern");
    expect(c.greeting).toBe("hello");
    expect(tags).toEqual(["fox", "rpg"]);
  });
  it("losslessly preserves the original card under extra_settings.sillytavern", () => {
    const { card: c } = mapCard(card({ system_prompt: "SP", post_history_instructions: "PHI" }));
    const st = (c.extra_settings as Record<string, any>).sillytavern;
    expect(st.sourceSpec).toBe("v2");
    expect(st.system_prompt).toBe("SP");
    expect(st.post_history_instructions).toBe("PHI");
    expect(st.raw).toEqual({ spec: "chara_card_v2" });
  });
  it("seeds an empty bindings block", () => {
    const { card: c } = mapCard(card({}));
    expect((c.extra_settings as Record<string, any>).bindings).toEqual({ worldbook_id: null });
  });
});
```

- [ ] **Step 2: 运行确认失败** — `npm run test -- cardMapper` — Expected: FAIL.

- [ ] **Step 3: 实现 `cardMapper.ts`**

```ts
import type { NormalizedCard } from "./types";
import { EMPTY_CARD, type CharacterCardData } from "../utils/characterPrompt";

/** Map a NormalizedCard into { name, CharacterCardData, tags }. Hybrid: structured
 *  fill for editing + lossless ST preservation under extra_settings.sillytavern. */
export function mapCard(n: NormalizedCard): { name: string; card: CharacterCardData; tags: string[] } {
  const card: CharacterCardData = {
    ...EMPTY_CARD,
    identity: n.description,
    personality: n.personality,
    background: n.scenario,
    greeting: n.first_mes,
    user_nickname: "",
    extra_settings: {
      sillytavern: {
        sourceSpec: n.sourceSpec,
        raw: n.raw,
        system_prompt: n.system_prompt ?? "",
        post_history_instructions: n.post_history_instructions ?? "",
        mes_example: n.mes_example ?? "",
        alternate_greetings: n.alternate_greetings ?? [],
        creator: n.creator ?? "",
        character_version: n.character_version ?? "",
        nickname: n.nickname ?? "",
        creator_notes: n.creator_notes ?? "",
      },
      bindings: { worldbook_id: null as string | null },
    },
  };
  return { name: n.name || "未命名角色", card, tags: n.tags ?? [] };
}
```

- [ ] **Step 4: 运行确认通过** — `npm run test -- cardMapper` — Expected: 3 passed.
- [ ] **Step 5: 提交** — `git commit -m "feat(import): map NormalizedCard to character card data"`

---

### Task 8: avatar 缩放

**Files:** Create `src/features/roleplay/import/avatar.ts`, `avatar.test.ts`

- [ ] **Step 1: 写测试**（jsdom 无 canvas 渲染：mock Image + canvas，验证调用与回退）

```ts
import { describe, it, expect, vi } from "vitest";
import { downscaleToDataUrl } from "./avatar";

describe("downscaleToDataUrl", () => {
  it("returns null when image fails to load", async () => {
    // jsdom Image never fires onload for a fake blob; simulate error path
    vi.stubGlobal("Image", class {
      onerror: (() => void) | null = null;
      onload: (() => void) | null = null;
      set src(_v: string) { queueMicrotask(() => this.onerror?.()); }
    });
    const out = await downscaleToDataUrl(new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" }));
    expect(out).toBeNull();
  });
});
```

- [ ] **Step 2: 运行确认失败** — `npm run test -- import/avatar` — Expected: FAIL.

- [ ] **Step 3: 实现 `avatar.ts`**

```ts
/** Downscale an image blob to a max dimension and return a PNG data URL, or null on failure. */
export function downscaleToDataUrl(blob: Blob, max = 512): Promise<string | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      try {
        const scale = Math.min(1, max / Math.max(img.width || 1, img.height || 1));
        const w = Math.max(1, Math.round((img.width || max) * scale));
        const h = Math.max(1, Math.round((img.height || max) * scale));
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) return resolve(null);
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/png"));
      } catch {
        resolve(null);
      } finally {
        URL.revokeObjectURL(url);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });
}
```

- [ ] **Step 4: 运行确认通过** — `npm run test -- import/avatar` — Expected: PASS.
- [ ] **Step 5: 提交** — `git commit -m "feat(import): avatar downscale to data URL"`

---

### Task 9: prepareImport 编排器

**Files:** Create `src/features/roleplay/import/prepareImport.ts`, `prepareImport.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
import { describe, it, expect } from "vitest";
import { prepareImport } from "./prepareImport";

function jsonFile(obj: unknown): File {
  return new File([JSON.stringify(obj)], "c.json", { type: "application/json" });
}

describe("prepareImport", () => {
  it("prepares a V2 card with embedded book", async () => {
    const out = await prepareImport(jsonFile({
      spec: "chara_card_v2",
      data: {
        name: "Aria", description: "fox", personality: "kind", scenario: "tavern",
        first_mes: "hi", mes_example: "ex", tags: ["rpg"],
        character_book: { name: "Lore", entries: [{ keys: ["dragon"], content: "big", insertion_order: 2 }] },
      },
    }));
    expect(out.name).toBe("Aria");
    expect(out.card.identity).toBe("fox");
    expect(out.worldbook!.name).toBe("Lore");
    expect(out.worldbook!.entries[0].triggers).toEqual(["dragon"]);
    expect(out.avatarDataUrl).toBeNull(); // JSON file has no image
  });
  it("has null worldbook when no character_book", async () => {
    const out = await prepareImport(jsonFile({ name: "Solo", first_mes: "hey", description: "d" }));
    expect(out.worldbook).toBeNull();
    expect(out.sourceSpec).toBe("v1");
  });
});
```

- [ ] **Step 2: 运行确认失败** — `npm run test -- prepareImport` — Expected: FAIL.

- [ ] **Step 3: 实现 `prepareImport.ts`**

```ts
import { readCardJson } from "./detectAndRead";
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
  const head = new Uint8Array((await file.arrayBuffer()).slice(0, 4));
  if (head[0] === 137 && head[1] === 80 && head[2] === 78 && head[3] === 71) {
    avatarDataUrl = await downscaleToDataUrl(file);
  }

  return { sourceSpec: normalized.sourceSpec, name, card, tags, avatarDataUrl, worldbook };
}
```

- [ ] **Step 4: 运行确认通过** — `npm run test -- prepareImport` — Expected: 2 passed.
- [ ] **Step 5: 提交** — `git commit -m "feat(import): prepareImport orchestrator"`

---

# 阶段 5 — 提示词管线 + 绑定读取

### Task 10: characterPrompt 加酒馆分支 + getBoundWorldbookId

**Files:** Modify `src/features/roleplay/utils/characterPrompt.ts`; Modify `src/features/roleplay/utils/characterPrompt.test.ts`

- [ ] **Step 1: 追加失败测试**（到现有 characterPrompt.test.ts）

```ts
import { getBoundWorldbookId } from "./characterPrompt";

describe("SillyTavern branch", () => {
  it("builds an ST-style prompt when sillytavern data is present", () => {
    const c = char({
      extra_settings: {
        sillytavern: { sourceSpec: "v2", raw: {}, system_prompt: "Be concise.", post_history_instructions: "Stay in character." },
      },
      identity: "a fox spirit",
      personality: "tsundere",
      background: "a quiet tavern",
    });
    const p = buildCharacterSystemPrompt(c);
    expect(p).toContain("a fox spirit");
    expect(p).toContain("Be concise.");
    expect(p).toContain("Stay in character.");
  });
  it("reads the bound worldbook id", () => {
    const c = char({ extra_settings: { bindings: { worldbook_id: "wb-1" } } });
    expect(getBoundWorldbookId(c)).toBe("wb-1");
    expect(getBoundWorldbookId(char({}))).toBeNull();
  });
});
```

- [ ] **Step 2: 运行确认失败** — `npm run test -- characterPrompt` — Expected: 新用例 FAIL（getBoundWorldbookId 未导出、ST 分支未实现）。

- [ ] **Step 3: 在 `characterPrompt.ts` 实现**

在 `buildCharacterSystemPrompt` 开头加 ST 分支（在现有逻辑之前）：

```ts
export function getBoundWorldbookId(c: CharacterRow): string | null {
  const ex = (c.card_json as Record<string, unknown>)?.extra_settings as Record<string, unknown> | undefined;
  const bindings = ex?.bindings as Record<string, unknown> | undefined;
  const id = bindings?.worldbook_id;
  return typeof id === "string" && id ? id : null;
}

function getSillyTavern(c: CharacterRow): Record<string, unknown> | null {
  const ex = (c.card_json as Record<string, unknown>)?.extra_settings as Record<string, unknown> | undefined;
  const st = ex?.sillytavern as Record<string, unknown> | undefined;
  return st ?? null;
}
```

在 `buildCharacterSystemPrompt(c, templateContent?)` 函数体最前面插入：

```ts
  const st = getSillyTavern(c);
  if (st) {
    const card = parseCharacterCard(c);
    const parts: string[] = [`你正在扮演「${c.name}」。保持角色，不要跳出。`];
    if (card.identity) parts.push(card.identity);
    if (card.personality) parts.push(`Personality: ${card.personality}`);
    if (card.background) parts.push(`Scenario: ${card.background}`);
    const sys = String(st.system_prompt ?? "").trim();
    if (sys) parts.push(sys);
    const example = String(st.mes_example ?? "").trim();
    if (example) parts.push(`Example dialogue:\n${example}`);
    const post = String(st.post_history_instructions ?? "").trim();
    if (post) parts.push(post);
    const body = parts.join("\n\n");
    if (!templateContent) return body;
    return `${templateContent.replace(/\{\{char\}\}/g, c.name).replace(/\{\{user\}\}/g, card.user_nickname || "用户")}\n\n---\n${body}`;
  }
```

（现有中文结构逻辑保持在其后，未改。）

- [ ] **Step 4: 运行确认通过** — `npm run test -- characterPrompt` — Expected: 全部通过（原 6 个 + 新 2 个）。
- [ ] **Step 5: 提交** — `git commit -m "feat(prompt): SillyTavern prompt branch + getBoundWorldbookId"`

---

# 阶段 6 — 落库接入

### Task 11: useCharacters.create 支持 avatarPath

**Files:** Modify `src/features/roleplay/hooks/useCharacters.ts:13,49-64`

- [ ] **Step 1: 改接口与实现** — 把 `create` 签名与 body 改为接受可选 `avatarPath`：

接口（第 13 行）：
```ts
  create: (name: string, card: CharacterCardData, tags?: string[], avatarPath?: string) => Promise<CharacterRow | null>;
```
实现（第 49 行起）：
```ts
  const create = useCallback(async (name: string, card: CharacterCardData, tags?: string[], avatarPath?: string) => {
    try {
      const payload = { name, card_json: packCharacterCard(card), tags: tags ?? [], ...(avatarPath ? { avatar_path: avatarPath } : {}) };
      const row = isDemo || !supabase || !userId
        ? await LocalRepo.createCharacter(payload)
        : await Repo.createCharacter(supabase, userId, payload);
      if (row) {
        setCharacters((prev) => [row, ...prev]);
        if (!isDemo && supabase && userId) LocalMirror.mirrorCharacter(row);
      }
      return row;
    } catch (e) {
      setError(String(e));
      return null;
    }
  }, [isDemo, userId]);
```

- [ ] **Step 2: 验证** — Run: `npm run typecheck` — Expected: 0（现有 3 参调用仍兼容）。
- [ ] **Step 3: 提交** — `git commit -m "feat(characters): optional avatarPath on create"`

---

### Task 12: createSession 自动挂载绑定世界书

**Files:** Modify `src/features/roleplay/hooks/useChatSession.ts:712-721,757-764`

- [ ] **Step 1: 改 createSession** — 引入 `getBoundWorldbookId`（已在 line 20 的 characterPrompt import 中追加），在加载 `character` 后计算绑定，并把它写进 meta 与 state。

在 import 行（约 line 19-20）追加 `getBoundWorldbookId`：
```ts
import { buildCharacterSystemPrompt, buildSessionMeta, parseSessionMeta, SESSION_META_VERSION, getBoundWorldbookId, type SessionMeta } from "../utils/characterPrompt";
```

createSession 内，把建会话那段（712-721）改为：
```ts
      const character = characterId
        ? (isLocalMode ? await LocalRepo.getCharacter(characterId) : await Repo.getCharacter(supabase!, characterId))
        : null;
      const boundWbId = character ? getBoundWorldbookId(character) : null;
      const initialWbIds = boundWbId ? [boundWbId] : [];
      const title = character ? `${character.name} - new chat` : `New chat ${new Date().toLocaleTimeString("zh-CN")}`;
      const meta = buildSessionMeta({ _meta_version: SESSION_META_VERSION, _worldbook_ids: initialWbIds });
      const row = isLocalMode
        ? await LocalRepo.createSession({ title, primary_character_id: characterId ?? undefined, system_prompt: meta })
        : await Repo.createSession(supabase!, userId!, { title, primary_character_id: characterId ?? undefined, system_prompt: meta });
```

并把 state 里的 `worldbookIds: []`（line 764）改为：
```ts
        worldbookIds: initialWbIds,
```

- [ ] **Step 2: 验证** — Run: `npm run typecheck && npm run test -- characterPrompt` — Expected: 0 / 绿。
- [ ] **Step 3: 提交** — `git commit -m "feat(chat): auto-attach a character's bound worldbook on session create"`

---

# 阶段 7 — 导入 UI

### Task 13: CharacterList 加导入入口 + 头像图显示

**Files:** Modify `src/features/roleplay/components/studio/CharacterList.tsx`

- [ ] **Step 1: 加 onImport prop + 「导入」按钮** — 在 `CharacterListProps` 加 `onImport: () => void;`；在搜索行的「创建」按钮旁加：
```tsx
        <button onClick={onImport} className="neo-button flex items-center gap-1.5 rounded-[20px] px-4 py-2.5 text-xs text-ink-500">
          <Upload className="h-3.5 w-3.5" />
          导入
        </button>
```
（从 `lucide-react` import `Upload`。）

- [ ] **Step 2: 头像图显示** — 把头像格（约 95-97 行）改为：当 `character.avatar_path` 以 `data:` 开头时渲染 `<img>`，否则保持 emoji/首字母：
```tsx
                <div className="neo-panel-soft flex h-12 w-12 flex-shrink-0 items-center justify-center overflow-hidden rounded-[18px] text-lg text-brand-500">
                  {character.avatar_path?.startsWith("data:")
                    ? <img src={character.avatar_path} alt={character.name} className="h-full w-full object-cover" />
                    : (character.avatar_emoji || character.name[0])}
                </div>
```

- [ ] **Step 3: 验证** — Run: `npm run typecheck` — Expected: 0（StudioPage 需补 onImport，见 Task 14；先允许 TS 报缺 prop，Task 14 一起过）。
- [ ] **Step 4: 提交（与 Task 14 一起）** — 见 Task 14。

---

### Task 14: ImportPreviewModal + StudioPage 接线落库

**Files:** Create `src/features/roleplay/components/studio/ImportPreviewModal.tsx`; Modify `src/pages/StudioPage.tsx`

- [ ] **Step 1: 创建 `ImportPreviewModal.tsx`**

```tsx
import type { PreparedImport } from "../../import/types";

export function ImportPreviewModal({
  prepared,
  onConfirm,
  onClose,
}: {
  prepared: PreparedImport;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="neo-panel-soft flex h-14 w-14 items-center justify-center overflow-hidden rounded-[18px] text-xl text-brand-500">
          {prepared.avatarDataUrl ? <img src={prepared.avatarDataUrl} alt={prepared.name} className="h-full w-full object-cover" /> : prepared.name[0]}
        </div>
        <div>
          <h3 className="text-sm font-semibold text-ink-800">{prepared.name}</h3>
          <p className="text-xs text-ink-400">规范 {prepared.sourceSpec.toUpperCase()}{prepared.worldbook ? ` · 世界书 ${prepared.worldbook.entries.length} 条` : ""}</p>
        </div>
      </div>
      <p className="line-clamp-3 text-xs text-ink-400">{prepared.card.identity || "（无简介）"}</p>
      <div className="flex gap-2">
        <button onClick={onConfirm} className="neo-button-primary flex-1 rounded-[18px] px-4 py-2.5 text-sm">导入</button>
        <button onClick={onClose} className="neo-button rounded-[18px] px-4 py-2.5 text-sm text-ink-600">取消</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: StudioPage 接线** — 在 `StudioPage` 顶部加隐藏 file input + 状态，向 `CharacterList` 传 `onImport`，解析后弹 `AppModal` 包 `ImportPreviewModal`，确认时落库。

加状态与 import（StudioPage 内）：
```tsx
import { useRef } from "react";
import { prepareImport } from "../features/roleplay/import/prepareImport";
import { ImportPreviewModal } from "../features/roleplay/components/studio/ImportPreviewModal";
import type { PreparedImport } from "../features/roleplay/import/types";
import { logger } from "../shared/lib/logger";
// ...
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [prepared, setPrepared] = useState<PreparedImport | null>(null);

  async function handleFile(file: File) {
    try {
      setPrepared(await prepareImport(file));
    } catch (e) {
      alert(e instanceof Error ? e.message : "导入失败：无法识别该文件。");
      logger.warn("[import] failed", e);
    }
  }

  async function confirmImport() {
    if (!prepared) return;
    let worldbookId: string | null = null;
    if (prepared.worldbook) {
      const wb = await wbs.createWb(prepared.worldbook.name);
      if (wb) {
        worldbookId = wb.id;
        for (const e of prepared.worldbook.entries) {
          await wbs.createEntry(wb.id, e.title, e.content, e.triggers, e.priority);
        }
      }
    }
    const card = { ...prepared.card, extra_settings: { ...prepared.card.extra_settings, bindings: { worldbook_id: worldbookId } } };
    await chars.create(prepared.name, card, prepared.tags, prepared.avatarDataUrl ?? undefined);
    setPrepared(null);
  }
```

`CharacterList` 调用处加 `onImport={() => fileInputRef.current?.click()}`，并在页面渲染隐藏 input + 预览弹窗：
```tsx
        <input
          ref={fileInputRef}
          type="file"
          accept=".json,.png,.charx"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f); e.target.value = ""; }}
        />
        {prepared ? (
          <AppModal open title="导入角色卡" description="确认后将创建角色（及其内嵌世界书）。" onClose={() => setPrepared(null)} size="sm">
            <ImportPreviewModal prepared={prepared} onConfirm={() => void confirmImport()} onClose={() => setPrepared(null)} />
          </AppModal>
        ) : null}
```

- [ ] **Step 3: 验证** — Run: `npm run typecheck && npm run lint && npm run build` — Expected: 全绿。
- [ ] **Step 4: 提交** — `git add -A && git commit -m "feat(import): studio import button + preview modal + persistence"`

---

# 阶段 8 — 端到端 + 收口

### Task 15: E2E 导入冒烟

**Files:** Create `e2e/import.spec.ts`

- [ ] **Step 1: 写 spec**（访客模式：把一张 V2 JSON 卡写进文件选择器，确认角色出现）

```ts
import { test, expect } from "@playwright/test";

test("guest can import a V2 JSON character card", async ({ page }) => {
  await page.goto("/studio");
  await expect(page.getByRole("heading", { name: "创作工坊" })).toBeVisible();

  const card = JSON.stringify({
    spec: "chara_card_v2",
    spec_version: "2.0",
    data: { name: "ImportedAria", description: "a fox spirit", personality: "kind", scenario: "tavern", first_mes: "hi", mes_example: "", tags: ["rpg"] },
  });

  await page.getByRole("button", { name: "导入" }).first().click();
  await page.setInputFiles('input[type="file"]', {
    name: "aria.json",
    mimeType: "application/json",
    buffer: Buffer.from(card, "utf-8"),
  });
  await expect(page.getByText("ImportedAria")).toBeVisible();
  await page.getByRole("button", { name: "导入" }).last().click(); // confirm in modal
  await expect(page.getByRole("heading", { name: "ImportedAria" })).toBeVisible();
});
```

> 选择器若与运行态不符，先 `npm run dev` 手动确认按钮/弹窗文案再调整（与子项目 0 E2E 同法）。

- [ ] **Step 2: 运行** — `npm run test:e2e -- import` — Expected: 1 passed。
- [ ] **Step 3: 提交** — `git commit -m "test(e2e): import a V2 JSON card smoke"`

---

### Task 16: 全量验证收口

- [ ] **Step 1: 跑全部门禁** — Run: `npm run typecheck && npm run lint && npm run test && npm run build` — Expected: 全绿（lint 0 error）。
- [ ] **Step 2: 收口** — 按 `superpowers:finishing-a-development-branch` 处理合并/推送。

---

## 自查（Self-Review）

**Spec 覆盖：**
- V1/V2/V3 解析 → Task 5 ✓；PNG/CHARX/JSON 载体 → Task 2,3,4 ✓
- 混合映射（无损+结构填充）→ Task 7 ✓；提示词酒馆分支 → Task 10 ✓
- 内嵌世界书→世界书 + insertion_order 反转 → Task 6 ✓
- 按角色绑定 + 仅新建会话挂载 → Task 10(getBoundWorldbookId) + 12 ✓
- 头像 data URL + 显示 → Task 8,11,13 ✓
- 导入 UI（按钮/预览/落库/错误）→ Task 13,14 ✓
- fflate 依赖 → Task 1 ✓；E2E → Task 15 ✓

**类型/命名一致性：** `PreparedImport`/`PreparedEntry`/`NormalizedCard`（Task 1）贯穿 6/7/9/14；`mapCard` 返回 `{name,card,tags}`（7）被 `prepareImport`（9）消费；`getBoundWorldbookId`（10）被 createSession（12）调用；`create(name,card,tags,avatarPath)`（11）被 StudioPage（14）调用——一致。

**无占位符：** 各 step 含可运行代码/命令；E2E 选择器需运行态确认（已注明，与子项目 0 同法）。

**执行顺序：** 严格按 Task 1→16；Task 13 的 TS 报缺 prop 在 Task 14 一并消除（已注明）。
