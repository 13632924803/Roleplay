# 世界书导入 + 高级语义 实现计划（子项目 2）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 支持导入独立 SillyTavern 世界书文件（全字段无损落库），并真正实现 `constant` / `selective`+`secondary_keys` / `case_sensitive` 运行语义。

**Architecture:** 纯函数解析/映射层 + worldbook_entries 新增 `extensions` JSONB 列 + 触发引擎小扩展（接到已有的常驻/动态分层）+ 世界书页导入 UI。条目映射 `mapLorebookEntry` 做字段别名兼容（ST WI 内部名 vs character_book 规范名），独立文件与卡内嵌共用。

**Tech Stack:** TypeScript + Vitest + React Testing Library + Playwright（无新增运行时依赖）。

**关联 spec:** `docs/superpowers/specs/2026-06-08-worldbook-import-design.md`
**分支:** `feat/worldbook-import`

> ⚠️ **交付时要单独告诉用户跑的运维步骤**：在 Supabase 跑迁移 `0009_worldbook_entry_extensions.sql`（仅云端同步用户需要；纯本地模式无需任何操作）。

---

## 文件结构

**新建：**
- `supabase/migrations/0009_worldbook_entry_extensions.sql` — 加 `extensions jsonb`
- `src/features/roleplay/import/lorebookEntry.ts` — `mapLorebookEntry`（别名兼容 + extensions 抽取）
- `src/features/roleplay/import/parseLorebookFile.ts` — 三形状解析 → `ImportedLorebook`
- 各 `*.test.ts`

**修改：**
- `src/features/roleplay/types/database.ts` — `WorldbookEntryRow.extensions?`
- `src/features/roleplay/types/roleplay.ts` — `CreateWorldbookEntry.extensions?`
- `src/features/roleplay/repositories/localRoleplayRepository.ts:357-` — 透传 extensions
- `src/features/roleplay/import/types.ts` — `PreparedEntry` 加 `enabled/extensions`；加 `ImportedLorebook`
- `src/features/roleplay/import/lorebookMapper.ts` — `mapCharacterBook` 改用 `mapLorebookEntry`
- `src/features/roleplay/import/lorebookMapper.test.ts` — 更新断言含 enabled/extensions
- `src/features/roleplay/hooks/useWorldbooks.ts` — 加 `importLorebook`
- `src/features/roleplay/context/worldbookTrigger.ts` — constant/selective/case_sensitive
- `src/features/roleplay/context/worldbookTrigger.test.ts` — 新语义测试
- `src/features/roleplay/context/contextBuilder.ts:204-210` — alwaysOn 含 constant
- `src/features/roleplay/components/studio/WorldbookList.tsx` — 导入按钮 + onImportWb
- `src/pages/StudioPage.tsx` — 世界书导入接线 + 内嵌书改走 importLorebook
- `e2e/lorebook-import.spec.ts` — E2E

---

# 阶段 1 — 数据模型

### Task 1: 迁移 + 类型 + 仓库透传 extensions

**Files:** Create `supabase/migrations/0009_worldbook_entry_extensions.sql`; Modify `types/database.ts`, `types/roleplay.ts`, `localRoleplayRepository.ts`

- [ ] **Step 1: 写迁移** `0009_worldbook_entry_extensions.sql`

```sql
-- Sub-project 2: store SillyTavern advanced worldbook fields losslessly.
alter table public.worldbook_entries
  add column if not exists extensions jsonb not null default '{}';
```

- [ ] **Step 2: `WorldbookEntryRow` 加字段**（`types/database.ts`，在 `trigger_count` 后）

```ts
  trigger_count: number;
  extensions?: Record<string, unknown>;
```

- [ ] **Step 3: `CreateWorldbookEntry` 加字段**（`types/roleplay.ts`，把 `"extensions"` 加进 Partial Pick）

```ts
export type CreateWorldbookEntry = Pick<
  WorldbookEntryRow,
  "worldbook_id" | "title" | "content"
> &
  Partial<
    Pick<
      WorldbookEntryRow,
      "category" | "triggers" | "priority" | "enabled" | "scope" | "token_estimate" | "extensions"
    >
  >;
```

- [ ] **Step 4: LocalRepo 透传**（`localRoleplayRepository.ts`，在 `createWorldbookEntry` 的 row 里 `trigger_count: 0,` 后加）

```ts
    trigger_count: 0,
    extensions: input.extensions ?? {},
```

> Repo（云端）`createWorldbookEntry` 用 `.insert({ ...input, user_id })` 已自动透传 extensions，**无需改**。注：云端导入需先跑迁移；未跑迁移时含 extensions 的 insert 会因列不存在而报错（已在交付清单提示）。非导入的旧建条目不传 extensions，不受影响。

- [ ] **Step 5: 验证** — Run: `npm run typecheck` — Expected: 0。
- [ ] **Step 6: 提交** — `git add -A && git commit -m "feat(worldbook): add extensions jsonb column + types"`

---

# 阶段 2 — 共享条目映射（别名兼容 + extensions）

### Task 2: mapLorebookEntry + 重构 lorebookMapper

**Files:** Modify `import/types.ts`; Create `import/lorebookEntry.ts`, `import/lorebookEntry.test.ts`; Modify `import/lorebookMapper.ts`, `import/lorebookMapper.test.ts`

- [ ] **Step 1: `PreparedEntry` 扩展 + `ImportedLorebook`**（`import/types.ts`）

把 `PreparedEntry` 改为：
```ts
export interface PreparedEntry {
  title: string;
  content: string;
  triggers: string[];
  priority: number;
  enabled: boolean;
  extensions: Record<string, unknown>;
}

export interface ImportedLorebook {
  name: string;
  entries: PreparedEntry[];
}
```

- [ ] **Step 2: 写 `lorebookEntry.test.ts`**（别名兼容是重点）

```ts
import { describe, it, expect } from "vitest";
import { mapLorebookEntry } from "./lorebookEntry";

describe("mapLorebookEntry", () => {
  it("maps character_book spec fields (keys/secondary_keys/insertion_order/enabled)", () => {
    const e = mapLorebookEntry({
      keys: ["dragon"], secondary_keys: ["fire"], content: "c", comment: "Dragon",
      insertion_order: 5, enabled: true, constant: false, selective: true, case_sensitive: true,
    });
    expect(e.title).toBe("Dragon");
    expect(e.triggers).toEqual(["dragon"]);
    expect(e.priority).toBe(-5);
    expect(e.enabled).toBe(true);
    expect(e.extensions.secondary_keys).toEqual(["fire"]);
    expect(e.extensions.selective).toBe(true);
    expect(e.extensions.case_sensitive).toBe(true);
  });
  it("maps ST World Info export aliases (key/keysecondary/order/disable/caseSensitive)", () => {
    const e = mapLorebookEntry({
      key: ["king"], keysecondary: ["throne"], content: "c", comment: "King",
      order: 3, disable: true, constant: true, caseSensitive: true,
    });
    expect(e.triggers).toEqual(["king"]);
    expect(e.priority).toBe(-3);
    expect(e.enabled).toBe(false); // disable: true
    expect(e.extensions.constant).toBe(true);
    expect(e.extensions.secondary_keys).toEqual(["throne"]);
    expect(e.extensions.case_sensitive).toBe(true);
  });
  it("falls back title to first key, defaults enabled true", () => {
    const e = mapLorebookEntry({ key: ["solo"], content: "c" });
    expect(e.title).toBe("solo");
    expect(e.enabled).toBe(true);
    expect(e.priority).toBe(0);
  });
});
```

- [ ] **Step 3: 运行确认失败** — `npm run test -- lorebookEntry` — Expected: FAIL。

- [ ] **Step 4: 实现 `lorebookEntry.ts`**

```ts
import type { PreparedEntry } from "./types";

function strArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}
function firstString(...vals: unknown[]): string | undefined {
  for (const v of vals) if (typeof v === "string" && v.trim()) return v.trim();
  return undefined;
}

/** Map one lorebook entry (character_book spec OR SillyTavern WI export aliases)
 *  into a PreparedEntry with advanced fields captured under extensions. */
export function mapLorebookEntry(raw: Record<string, unknown>): PreparedEntry {
  const keys = strArray(raw.keys ?? raw.key);
  const secondaryKeys = strArray(raw.secondary_keys ?? raw.keysecondary);
  const title = firstString(raw.comment, raw.name) ?? keys[0] ?? "未命名条目";
  const order = typeof raw.insertion_order === "number" ? raw.insertion_order
    : typeof raw.order === "number" ? raw.order : undefined;
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
```

- [ ] **Step 5: 重构 `lorebookMapper.ts`** — `mapCharacterBook` 改用 `mapLorebookEntry`：

```ts
import type { PreparedEntry, STCharacterBook } from "./types";
import { mapLorebookEntry } from "./lorebookEntry";

export function mapCharacterBook(
  book: STCharacterBook | undefined,
  characterName: string,
): { name: string; entries: PreparedEntry[] } | null {
  if (!book || !Array.isArray(book.entries) || book.entries.length === 0) return null;
  const entries = book.entries.map((e) => mapLorebookEntry(e as Record<string, unknown>));
  const name = (typeof book.name === "string" && book.name.trim()) || `${characterName} 的世界书`;
  return { name, entries };
}
```

- [ ] **Step 6: 更新 `lorebookMapper.test.ts`** — 旧的 `toEqual({title,content,triggers,priority})` 改为含新字段：

```ts
    expect(out!.entries[0]).toEqual({
      title: "Dragons", content: "big lizard", triggers: ["dragon", "wyrm"], priority: -5,
      enabled: true,
      extensions: { secondary_keys: [], constant: false, selective: false, case_sensitive: false, position: null, scan_depth: null, use_regex: false, raw: out!.entries[0].extensions.raw },
    });
```
（其余断言 `entries[1].priority === -1`、`entries[1].title === "king"`、空书 null、默认书名不变。）

- [ ] **Step 7: 运行** — `npm run test -- lorebookEntry lorebookMapper prepareImport` — Expected: 全绿（prepareImport 的 worldbook.entries 现在带 extensions，原断言仍成立）。
- [ ] **Step 8: 提交** — `git commit -m "feat(import): shared mapLorebookEntry with alias + extensions; reuse in mapCharacterBook"`

---

# 阶段 3 — 独立文件解析

### Task 3: parseLorebookFile（三形状）

**Files:** Create `import/parseLorebookFile.ts`, `import/parseLorebookFile.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
import { describe, it, expect } from "vitest";
import { parseLorebookFile } from "./parseLorebookFile";

describe("parseLorebookFile", () => {
  it("parses object-keyed WI export ({entries:{0:..}})", () => {
    const lb = parseLorebookFile(JSON.stringify({
      name: "MyLore",
      entries: { "0": { key: ["a"], content: "ca", order: 1 }, "1": { key: ["b"], content: "cb", order: 2 } },
    }));
    expect(lb.name).toBe("MyLore");
    expect(lb.entries).toHaveLength(2);
    expect(lb.entries[0].triggers).toEqual(["a"]);
  });
  it("parses array form ({entries:[..]})", () => {
    const lb = parseLorebookFile(JSON.stringify({ entries: [{ keys: ["x"], content: "c" }] }));
    expect(lb.entries[0].triggers).toEqual(["x"]);
  });
  it("parses lorebook_v3 ({spec,data:{entries:[..]}})", () => {
    const lb = parseLorebookFile(JSON.stringify({ spec: "lorebook_v3", data: { name: "V3", entries: [{ keys: ["z"], content: "c" }] } }));
    expect(lb.name).toBe("V3");
    expect(lb.entries[0].triggers).toEqual(["z"]);
  });
  it("throws on a non-lorebook object", () => {
    expect(() => parseLorebookFile(JSON.stringify({ foo: 1 }))).toThrow();
  });
});
```

- [ ] **Step 2: 运行确认失败** — `npm run test -- parseLorebookFile` — Expected: FAIL。

- [ ] **Step 3: 实现 `parseLorebookFile.ts`**

```ts
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

  // lorebook_v3 nests under data; otherwise entries at top level.
  const container = (o.spec === "lorebook_v3" && o.data && typeof o.data === "object"
    ? (o.data as Record<string, unknown>)
    : o);
  const rawEntries = entriesToArray(container.entries);
  if (rawEntries.length === 0) throw new Error("未找到世界书条目（entries）。");

  const name =
    (typeof container.name === "string" && container.name.trim()) ||
    `导入的世界书 ${new Date().toISOString().slice(0, 10)}`;
  return { name, entries: rawEntries.map(mapLorebookEntry) };
}
```

- [ ] **Step 4: 运行确认通过** — `npm run test -- parseLorebookFile` — Expected: 4 passed。
- [ ] **Step 5: 提交** — `git commit -m "feat(import): standalone lorebook file parser (3 shapes)"`

---

# 阶段 4 — 落库

### Task 4: useWorldbooks.importLorebook

**Files:** Modify `src/features/roleplay/hooks/useWorldbooks.ts`

- [ ] **Step 1: 加 import + 方法到接口与实现** — 文件头加 import：

```ts
import type { PreparedEntry } from "../import/types";
```

接口 `UseWorldbooksReturn` 加：
```ts
  importLorebook: (name: string, entries: PreparedEntry[]) => Promise<WorldbookRow | null>;
```

实现（放在 `createEntry` 之后；批量建、末尾单次 refresh）：
```ts
  const importLorebook = useCallback(async (name: string, importedEntries: PreparedEntry[]) => {
    const wb = isDemo || !supabase || !userId
      ? await LocalRepo.createWorldbook({ name, tags: [] })
      : await Repo.createWorldbook(supabase, userId, { name, tags: [] });
    if (!wb) return null;
    if (!isDemo && supabase && userId) LocalMirror.mirrorWorldbook(wb);
    for (const e of importedEntries) {
      const input = {
        worldbook_id: wb.id, title: e.title, content: e.content,
        triggers: e.triggers, priority: e.priority, enabled: e.enabled, extensions: e.extensions,
      };
      if (isDemo || !supabase || !userId) {
        await LocalRepo.createWorldbookEntry(input);
      } else {
        const row = await Repo.createWorldbookEntry(supabase, userId, input);
        if (row) LocalMirror.mirrorWorldbookEntry(row);
      }
    }
    setWorldbooks((prev) => [wb, ...prev]);
    return wb;
  }, [isDemo, userId]);
```

并在 return 对象里加 `importLorebook,`。

- [ ] **Step 2: 验证** — Run: `npm run typecheck` — Expected: 0。
- [ ] **Step 3: 提交** — `git commit -m "feat(worldbook): importLorebook bulk-create with extensions"`

---

# 阶段 5 — 触发引擎语义

### Task 5: worldbookTrigger 加 constant/selective/case_sensitive

**Files:** Modify `src/features/roleplay/context/worldbookTrigger.ts`; Modify `worldbookTrigger.test.ts`

- [ ] **Step 1: 追加失败测试**（到 worldbookTrigger.test.ts；`entry()` helper 已存在，给它传 extensions）

```ts
describe("advanced semantics", () => {
  it("injects a constant entry with no keyword match", () => {
    const e = entry({ id: "k", triggers: ["unrelated"], extensions: { constant: true } });
    const r = triggerWorldbookEntries([e], "nothing here", [], null, null, new Set(["k"]));
    expect(r.triggered[0].injected).toBe(true);
  });
  it("requires both primary and secondary keys when selective", () => {
    const base = { id: "k", triggers: ["dragon"], extensions: { selective: true, secondary_keys: ["fire"] } };
    const miss = triggerWorldbookEntries([entry(base)], "a dragon appears", [], null, null, new Set(["k"]));
    expect(miss.triggered).toHaveLength(0); // secondary "fire" not present
    const hit = triggerWorldbookEntries([entry(base)], "a fire dragon", [], null, null, new Set(["k"]));
    expect(hit.triggered[0].injected).toBe(true);
  });
  it("respects case_sensitive", () => {
    const e = entry({ id: "k", triggers: ["Dragon"], extensions: { case_sensitive: true } });
    const lower = triggerWorldbookEntries([entry({ id: "k", triggers: ["Dragon"], extensions: { case_sensitive: true } })], "a dragon", [], null, null, new Set(["k"]));
    expect(lower.triggered).toHaveLength(0); // "dragon" != "Dragon"
    const exact = triggerWorldbookEntries([e], "a Dragon", [], null, null, new Set(["k"]));
    expect(exact.triggered[0].injected).toBe(true);
  });
});
```

- [ ] **Step 2: 运行确认失败** — `npm run test -- worldbookTrigger` — Expected: 新用例 FAIL。

- [ ] **Step 3: 改 `worldbookTrigger.ts`** — `normalizeForMatch` 与 `matchKeywords` 支持 caseSensitive；`triggerWorldbookEntries` 加 constant/selective 分支。

`normalizeForMatch` 改为：
```ts
function normalizeForMatch(value: string, caseSensitive = false): string {
  const base = value.trim().replace(/[\s　]+/g, "").replace(/[.,!?;:'"()[\]{}<>/\\|`~@#$%^&*_+=，。！？；：“”‘’（）【】《》、…—-]/g, "");
  return caseSensitive ? base : base.toLowerCase();
}
```

`matchKeywords` 改为接受 caseSensitive：
```ts
export function matchKeywords(input: string, keywordsRaw: unknown, caseSensitive = false): string[] {
  const normalizedInput = normalizeForMatch(input, caseSensitive);
  if (!normalizedInput) return [];
  return parseKeywords(keywordsRaw).filter((keyword) => {
    const nk = normalizeForMatch(keyword, caseSensitive);
    return nk.length > 0 && normalizedInput.includes(nk);
  });
}
```

`triggerWorldbookEntries` 的循环体（替换关键词匹配段）：
```ts
    const ext = (entry.extensions ?? {}) as Record<string, unknown>;
    const caseSensitive = ext.case_sensitive === true;
    let matchedKeywords: string[];
    if (ext.constant === true) {
      matchedKeywords = []; // constant: always triggered (still budget-limited)
    } else {
      const primary = matchKeywords(triggerText, getEntryKeywords(entry), caseSensitive);
      if (primary.length === 0) {
        skipped.push({ entry, reason: "无关键词命中" });
        continue;
      }
      if (ext.selective === true) {
        const secondary = matchKeywords(triggerText, ext.secondary_keys, caseSensitive);
        if (secondary.length === 0) {
          skipped.push({ entry, reason: "selective：次关键词未命中" });
          continue;
        }
        matchedKeywords = [...primary, ...secondary];
      } else {
        matchedKeywords = primary;
      }
    }

    const injected = budgetAllocatedIds.has(entry.id);
    if (!injected) {
      skipped.push({ entry, reason: `Token 预算超限（优先级 ${entry.priority}）` });
    }
    triggered.push({ entry, matchedKeywords, injected, skipReason: injected ? undefined : "Token 预算超限" });
```

（保留前面的 `!entry.enabled` 与 `scope === "character"` 检查不变。）

- [ ] **Step 4: 运行确认通过** — `npm run test -- worldbookTrigger` — Expected: 全绿（原 7 + 新 3）。
- [ ] **Step 5: 提交** — `git commit -m "feat(context): worldbook constant/selective/case_sensitive semantics"`

---

### Task 6: contextBuilder 常驻区纳入 constant

**Files:** Modify `src/features/roleplay/context/contextBuilder.ts:204-210`

- [ ] **Step 1: 改 alwaysOnEntries 判定** — 加 `extensions.constant === true`：

```ts
  const alwaysOnEntries = sortEntriesForContext(
    enabledEntries.filter((e) => {
      const flags = e as unknown as Record<string, unknown>;
      const ext = (e.extensions ?? {}) as Record<string, unknown>;
      return (e.priority ?? 0) >= 8 || flags.always_on === true || flags.pinned === true || ext.constant === true;
    }),
  );
```

- [ ] **Step 2: 验证** — Run: `npm run typecheck && npm run test -- contextBuilder worldbookTrigger` — Expected: 0 / 全绿。
- [ ] **Step 3: 提交** — `git commit -m "feat(context): route constant worldbook entries into the persistent section"`

---

# 阶段 6 — 导入 UI

### Task 7: WorldbookList 导入按钮 + StudioPage 接线

**Files:** Modify `src/features/roleplay/components/studio/WorldbookList.tsx`, `src/pages/StudioPage.tsx`

- [ ] **Step 1: WorldbookList 加 onImportWb + 按钮** — `WorldbookListProps` 加 `onImportWb: () => void;`，解构加 `onImportWb`，`lucide-react` import 加 `Upload`，在「创建」按钮前加：
```tsx
        <button onClick={onImportWb} className="neo-button flex items-center gap-1.5 rounded-[20px] px-4 py-2.5 text-xs text-ink-500">
          <Upload className="h-3.5 w-3.5" />
          导入
        </button>
```

- [ ] **Step 2: StudioPage 接线** — 复用已有的隐藏 input 模式，但世界书用独立的状态/handler，避免与角色导入冲突。在 StudioPage 加：

```ts
import { parseLorebookFile } from "../features/roleplay/import/parseLorebookFile";
import type { ImportedLorebook } from "../features/roleplay/import/types";
// ...组件内：
  const wbFileInputRef = useRef<HTMLInputElement>(null);
  const [importedLb, setImportedLb] = useState<ImportedLorebook | null>(null);

  async function handleLorebookFile(file: File) {
    try {
      const text = await file.text();
      setImportedLb(parseLorebookFile(text));
    } catch (e) {
      alert(e instanceof Error ? e.message : "导入失败：无法识别该世界书文件。");
      logger.warn("[lorebook import] failed", e);
    }
  }

  async function confirmLorebookImport() {
    if (!importedLb) return;
    await wbs.importLorebook(importedLb.name, importedLb.entries);
    setImportedLb(null);
  }
```

给 `WorldbookList` 传 `onImportWb={() => wbFileInputRef.current?.click()}`；在页面 JSX（角色导入 input 旁）加世界书 input + 预览弹窗：
```tsx
        <input
          ref={wbFileInputRef}
          type="file"
          accept=".json"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleLorebookFile(f); e.target.value = ""; }}
        />
        {importedLb ? (
          <AppModal open title="导入世界书" description="确认后将创建世界书及其条目。" onClose={() => setImportedLb(null)} size="sm">
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-ink-800">{importedLb.name}</h3>
                <p className="text-xs text-ink-400">
                  共 {importedLb.entries.length} 条 · 常驻 {importedLb.entries.filter((e) => (e.extensions as Record<string, unknown>).constant === true).length} 条
                  · selective {importedLb.entries.filter((e) => (e.extensions as Record<string, unknown>).selective === true).length} 条
                </p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => void confirmLorebookImport()} className="neo-button-primary flex-1 rounded-[18px] px-4 py-2.5 text-sm">导入</button>
                <button onClick={() => setImportedLb(null)} className="neo-button rounded-[18px] px-4 py-2.5 text-sm text-ink-600">取消</button>
              </div>
            </div>
          </AppModal>
        ) : null}
```

- [ ] **Step 3: 内嵌书改走 importLorebook（DRY）** — 把子项目 1 的 `confirmImport` 里手动建 wb+循环的那段，替换为：
```ts
    let worldbookId: string | null = null;
    if (prepared.worldbook) {
      const wb = await wbs.importLorebook(prepared.worldbook.name, prepared.worldbook.entries);
      worldbookId = wb?.id ?? null;
    }
```
（其余 confirmImport 不变。）

- [ ] **Step 4: 验证** — Run: `npm run typecheck && npm run lint && npm run build` — Expected: 全绿。
- [ ] **Step 5: 提交** — `git add -A && git commit -m "feat(import): worldbook import UI + route embedded book through importLorebook"`

---

# 阶段 7 — E2E + 收口

### Task 8: E2E 世界书导入冒烟

**Files:** Create `e2e/lorebook-import.spec.ts`

- [ ] **Step 1: 写 spec**（访客模式：切到世界书页，setInputFiles 一个 lorebook，确认出现）

```ts
import { test, expect } from "@playwright/test";

test("guest can import a standalone lorebook", async ({ page }) => {
  await page.goto("/studio");
  await expect(page.getByRole("heading", { name: "创作工坊" })).toBeVisible();
  await page.getByRole("button", { name: "世界书" }).click(); // tab

  const lore = JSON.stringify({
    name: "ImportedLore",
    entries: { "0": { key: ["dragon"], content: "a big dragon", order: 1, constant: true } },
  });
  await page.setInputFiles('input[accept=".json"]', {
    name: "lore.json", mimeType: "application/json", buffer: Buffer.from(lore, "utf-8"),
  });
  await expect(page.getByText("ImportedLore")).toBeVisible();
  await page.getByRole("button", { name: "导入" }).last().click();
  await expect(page.getByText("ImportedLore")).toBeVisible();
});
```

> 选择器若与运行态不符（世界书 tab 文案、input 选择器），先 `npm run dev` 手动确认再调（与前两个子项目 E2E 同法）。注意：StudioPage 现在有两个隐藏 file input（角色 `accept=".json,.png,.charx"`、世界书 `accept=".json"`），用 `input[accept=".json"]` 精确选世界书的那个。

- [ ] **Step 2: 运行** — `npm run test:e2e -- lorebook-import` — Expected: 1 passed。
- [ ] **Step 3: 提交** — `git commit -m "test(e2e): import a standalone lorebook smoke"`

---

### Task 9: 全量验证 + 收口

- [ ] **Step 1: 跑全部门禁** — Run: `npm run typecheck && npm run lint && npm run test && npm run build` — Expected: 全绿（lint 0 error）。
- [ ] **Step 2: 收口** — 按 `superpowers:finishing-a-development-branch`。**交付时单独告知用户：在 Supabase 跑迁移 0009。**

---

## 自查（Self-Review）

**Spec 覆盖：**
- 三形状解析 → Task 3 ✓；全字段落库（extensions 列）→ Task 1,4 ✓
- constant/selective/case_sensitive 运行 → Task 5,6 ✓
- 复杂语义存档（position/scan_depth/use_regex/raw 进 extensions）→ Task 2 mapLorebookEntry ✓
- 导入 UI（世界书页）→ Task 7 ✓；不绑角色（importLorebook 只建 WB，无 binding）✓
- 迁移交付清单 → Task 1,9 ✓；E2E → Task 8 ✓

**类型/命名一致性：** `PreparedEntry`（含 enabled/extensions，Task 2）贯穿 mapLorebookEntry/parseLorebookFile/importLorebook/mapCharacterBook；`importLorebook(name, PreparedEntry[])`（Task 4）被 StudioPage 角色与世界书两路共用（Task 7）；`mapLorebookEntry`（Task 2）被 lorebookMapper 与 parseLorebookFile 共用——一致。

**无占位符：** 各 step 含可运行代码/命令；E2E 选择器需运行态确认（已注明）。

**执行顺序：** Task 1→9 顺序；Task 2 会更新子项目 1 的 lorebookMapper.test.ts 断言（已注明），Task 7 Step 3 改子项目 1 的 confirmImport 走 importLorebook（DRY）。
