# 世界书导入 + 高级语义 — 设计方案（子项目 2）

- 状态：已通过设计评审，待写实现计划
- 日期：2026-06-08
- 分支：`feat/worldbook-import`
- 路线图位置：7 子项目中的第 2 个（0 工程地基、1 角色卡导入已完成并合并 main）。

---

## 1. 背景与目标

支持导入独立的 SillyTavern 世界书/Lorebook 文件，全字段无损落库，并**真正实现高 ROI 的运行语义**（`constant`、`selective`+`secondary_keys`、`case_sensitive`），让大多数导入的世界书直接正常工作。复杂语义（`position`/depth、`recursion`、`use_regex`、`decorators`）本轮**仅无损存档**，留作后续增量。

---

## 2. 范围

### 2.1 纳入
- 解析独立 lorebook 文件的三种常见形状：`{entries:{...}}`（对象按 uid 键）、`{entries:[...]}`（数组）、`{spec:"lorebook_v3",data:{entries:[...]}}`。
- 全字段落库：基础列 + 一个新的 `extensions` JSONB 列存所有高级字段。
- 运行语义（真正实现）：`constant`、`selective`+`secondary_keys`、`case_sensitive`。
- 导入 UI：世界书页「导入」按钮 + 预览确认 + 落库。
- 独立世界书**不自动绑角色**，用户手动挂到会话（沿用现有机制）。

### 2.2 排除（仅无损存档，留后续）
- `position`/depth（特定位置/消息深度注入）、`recursion`（条目触发条目）、`use_regex`（正则关键词）、`decorators`（V3 @@ 装饰器）。这些字段都存进 `extensions`，将来可直接读，不丢数据。
- 子项目 1 已完成的"卡内嵌 character_book 导入"不在此重复。

### 2.3 需要用户手动执行的运维步骤
- **一个 Supabase 迁移**：`supabase/migrations/0009_worldbook_entry_extensions.sql`。用户在自己的 Supabase 上跑一次（`supabase db push` 或 SQL 编辑器）。本地 IndexedDB 模式不需要任何操作。详见第 9 节，交付时单独列出。

---

## 3. 数据模型：单个 `extensions` JSONB 列

`worldbook_entries` 当前无放高级字段处。决策：加**一列** `extensions jsonb default '{}'`（与 `card_json` 灵活 blob 哲学一致，迁移最小、面向未来），而非为每个字段加 typed 列。

- 迁移 `0009_worldbook_entry_extensions.sql`：`alter table public.worldbook_entries add column if not exists extensions jsonb not null default '{}';`（现有行默认 `{}`，向后兼容；RLS 不受影响）。
- 类型：`WorldbookEntryRow` 加 `extensions?: Record<string, unknown>`；`CreateWorldbookEntry`/`UpdateWorldbookEntry` 加 `extensions?` 与 `enabled?`。
- 仓库：`Repo.createWorldbookEntry` / `LocalRepo.createWorldbookEntry` 在 insert 时透传 `extensions`（默认 `{}`）。本地 IndexedDB 无需迁移。

`extensions` 存：`secondary_keys / constant / selective / case_sensitive / position / scan_depth / use_regex / decorators / disable / raw`（原始条目对象，无损）。

---

## 4. 解析层

新增 `src/features/roleplay/import/parseLorebookFile.ts`：识别三种形状 → 统一成 `ImportedLorebook { name: string; entries: ImportedEntry[] }`。

```ts
interface ImportedEntry {
  title: string;
  content: string;
  triggers: string[];      // 主关键词 keys
  priority: number;        // 由 insertion_order 反转（与子项目 1 一致：-insertion_order）
  enabled: boolean;
  extensions: Record<string, unknown>; // secondary_keys/constant/selective/case_sensitive/position/.../raw
}
```

- 复用子项目 1 的字段抽取思路；条目映射逻辑抽成 `mapLorebookEntry(raw)`（供独立文件与卡内嵌共用，DRY）。
- `name`：取文件里的 lorebook 名，回退「导入的世界书 YYYY-MM-DD」。

## 5. 落库

`useWorldbooks` 加 `importLorebook(name, entries: ImportedEntry[]): Promise<WorldbookRow | null>`：建 Worldbook → 循环 `Repo/LocalRepo.createWorldbookEntry`（带 `extensions/enabled`，**不每条 reload**）→ 末尾 `refresh()` 一次（避免大世界书 N 次重载的性能问题）。导入 UI 调它。

## 6. 触发引擎扩展（接到已有的常驻/动态分层）

contextBuilder 已有 `alwaysOnEntries`（`priority>=8 || always_on || pinned` → 「常驻世界书」区）+ `triggerWorldbookEntries` 关键词触发。三处小扩展（worldbookTrigger.ts 纯函数 + contextBuilder 一处 filter）：

- **`constant`**：① contextBuilder 的 `alwaysOnEntries` 判定加 `extensions.constant === true`（进常驻区）；② `triggerWorldbookEntries` 中 constant 条目**无需关键词命中即视为触发**（仍受预算约束 `injected = budgetAllocatedIds.has(id)`）。
- **`selective` + `secondary_keys`**：`extensions.selective === true` 时，需**主关键词命中 AND 次关键词（`extensions.secondary_keys`）命中**才触发。
- **`case_sensitive`**：`matchKeywords` 增加可选 `caseSensitive` 入参，按条目 `extensions.case_sensitive` 决定是否 lowercase。

**向后兼容**：无 `extensions` 的旧条目走原路径，现有 worldbookTrigger/contextBuilder 测试保持绿。

## 7. UI

创作工坊**世界书页**（`WorldbookList`）「创建世界书」旁加「导入」按钮（`accept=".json"`）→ 解析 → 预览确认框（世界书名 + 条目数 + 高级字段统计，如"常驻 3 条 / selective 2 条"）→ 落库 → toast。失败给中文错误，不崩。复用子项目 1 的隐藏 input + 预览弹窗模式。

## 8. 错误处理 / 安全 / 测试

- 纯函数单测：三种文件形状解析、`mapLorebookEntry`（含 insertion_order 反转、高级字段抽取）、constant 无关键词触发、selective AND 逻辑、case_sensitive 大小写。
- 回归：现有 worldbookTrigger / contextBuilder / 子项目 1 测试保持全绿（无 extensions 行为不变）。
- E2E：导入一个含 constant 条目的 lorebook → 世界书出现在列表。
- 卡/文件内文本当数据，不渲染 HTML；纯本地解析，不上传。

## 9. 用户手动执行清单（交付时单独给）
1. 在 Supabase 跑迁移 `0009_worldbook_entry_extensions.sql`（`supabase db push`，或把该 SQL 贴进 Supabase SQL 编辑器执行）。**仅云端同步用户需要**；纯本地模式无需任何操作。

## 10. 已确认的关键决策
1. 数据模型用**单个 `extensions` JSONB 列** + 一个云端迁移（用户手动跑）。
2. 本轮真正实现 `constant` / `selective`+`secondary_keys` / `case_sensitive`；其余高级语义仅无损存档。
3. 独立导入的世界书**不自动绑角色**，由用户手动挂到会话。
