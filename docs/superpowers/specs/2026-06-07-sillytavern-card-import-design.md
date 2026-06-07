# SillyTavern 角色卡导入 — 设计方案（子项目 1）

- 状态：已通过设计评审，待写实现计划
- 日期：2026-06-07
- 分支：`feat/sillytavern-card-import`
- 路线图位置：7 子项目中的第 1 个（子项目 0 工程地基已完成并合并 main）。

---

## 1. 背景与目标

让用户能把 SillyTavern 角色卡**直接导入即用**。支持常见格式（V1/V2/V3，PNG/JSON/CHARX），高保真保留卡内容，并把卡内嵌的世界书一并导入、按角色绑定，在为该角色新建会话时自动挂载。本子项目是后续世界书导入（2）、正则（3）、预设（5）、角色卡生成器（6）的共同地基。

---

## 2. 范围

### 2.1 纳入
- 解析三种卡规范：V1（扁平 JSON）、V2（`chara_card_v2`）、V3（`chara_card_v3`）。
- 解析三种载体：`.json`、`.png`（tEXt chunk，优先 `ccv3` 回退 `chara`，base64）、`.charx`（zip，根目录 `card.json`）。
- **混合映射**：`card_json` 无损保留完整酒馆卡原文，同时 best-effort 填充现有结构字段供编辑/预览。
- **提示词管线扩展**：`buildCharacterSystemPrompt` 增加"酒馆分支"，检测到酒馆卡时按酒馆方式组装；否则完全沿用现有中文结构（现有行为不变）。
- **内嵌世界书导入**：`character_book` → 创建 Worldbook + 条目，并**按角色绑定**（绑定信息写入角色卡），新建会话选中该角色时自动挂载。
- **头像**：从 PNG/CHARX 提取立绘，canvas 缩放到 ≤512px，存为 data URL。
- **导入 UI**：创作工坊角色页"导入"按钮 + 文件选择 + 预览确认 + 结果摘要。

### 2.2 排除（留给后续子项目）
- 独立世界书/Lorebook 文件导入、酒馆世界书高级语义（`selective / secondary_keys / constant / position / use_regex / decorators` 的完整行为）→ **子项目 2**。（注：这些字段在导入时随整张卡 `raw` 无损保存，子项目 2 可直接补全，不丢数据。）
- 正则脚本导入与运行 → **子项目 3**。
- 预设导入 → **子项目 5**。
- 重型卡的 HTML/CSS 沙箱渲染 → **子项目 4**。本子项目预览/编辑**绝不** `dangerouslySetInnerHTML`，卡内文本一律当数据。
- WEBP/EXIF 载体的卡（较罕见）：本轮先不做，PNG 为图片载体的主路径。

---

## 3. 架构：四层管线，每层可独立单测

```
文件(.json/.png/.charx)
  → [提取层 extract] 得到 JSON 字符串
  → [解析层 parse]   识别 V1/V2/V3 → NormalizedCard（统一内部形状）
  → [映射层 map]     NormalizedCard → {name, card, tags, avatarDataUrl} + 内嵌书
  → [落库层 persist] 建世界书 → 建角色(带绑定) → 返回结果摘要
```

新增模块（`src/features/roleplay/import/`，纯函数 + 一个编排器）：

| 文件 | 职责 | 依赖 |
|---|---|---|
| `png.ts` | PNG ArrayBuffer → 读 tEXt chunk(`ccv3`>`chara`) → base64 解码 JSON | 零依赖手写 chunk 解析 |
| `charx.ts` | `.charx` zip → 取 `card.json` + 资源 | `fflate` |
| `parseCard.ts` | 识别 V1/V2/V3 → `NormalizedCard` | — |
| `cardMapper.ts` | `NormalizedCard` → `{name, card, tags, avatarDataUrl}` | `characterPrompt` |
| `lorebookMapper.ts` | `character_book` → `CreateWorldbook + CreateWorldbookEntry[]` | — |
| `avatar.ts` | 图片缩放到 ≤512px → data URL | canvas |
| `importCharacterCard.ts` | 编排：探测→解析→映射→落库→摘要 | 上述 + 仓库层 |
| `types.ts` | `NormalizedCard`、`STCharacterBook`、`ImportResult` 等类型 | — |

UI：`components/studio/ImportCardButton.tsx` + `ImportPreviewModal.tsx`（或在 `CharacterList` 加 `onImport`）。

---

## 4. 解析层：格式识别（基于权威规范）

- **JSON**：`spec === "chara_card_v3"` → V3；`spec === "chara_card_v2"` → V2；否则若有 `first_mes`/`description` 等扁平字段 → V1。
- **PNG**：解析 PNG chunk 序列，找 `tEXt`，keyword 优先 `ccv3`（V3）否则 `chara`（V2），value 为 base64 → UTF-8 JSON → 再走上面识别。
- **CHARX**：`fflate` 解 zip，读根目录 `card.json`（V3），资源以 `embeded://path`（规范即此拼写）引用，从 zip 内取出。
- 入口按扩展名 + magic bytes 双重判断：PNG 头 `89 50 4E 47`，zip 头 `50 4B`（`PK`）。

### NormalizedCard（V1/V2/V3 归一）
```ts
interface NormalizedCard {
  sourceSpec: "v1" | "v2" | "v3";
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
  nickname?: string;                 // v3
  character_book?: STCharacterBook;
  assets?: STAsset[];                // v3
  extensions?: Record<string, unknown>;
  raw: unknown;                      // 原始解析对象，100% 无损
}
```

---

## 5. 映射层：混合策略（已确认）

落进 `card_json`：
```jsonc
{
  "identity":    "<description>",   // 主设定块
  "personality": "<personality>",
  "background":  "<scenario>",
  "greeting":    "<first_mes>",
  // 其余现有字段留空或合理映射
  "extra_settings": {
    "sillytavern": {
      "sourceSpec": "v2|v3",
      "raw": { /* 原始卡，无损 */ },
      "system_prompt": "...",
      "post_history_instructions": "...",
      "mes_example": "...",
      "alternate_greetings": ["..."],
      "creator": "...", "character_version": "...", "nickname": "..."
    },
    "bindings": { "worldbook_id": "<生成的世界书id 或 null>" }
    // 子项目 3/5 在此追加 regex_ids / preset_id，复用同一套绑定机制
  }
}
```
- 头像：`avatar_path` 存缩放后的 data URL（CSP 已放行 `data:`）。`avatar_emoji` 保底。
- `tags` 直接进 `CharacterRow.tags`。

---

## 6. 提示词管线扩展

`buildCharacterSystemPrompt`：
- **若** `card_json.extra_settings.sillytavern` 存在 → 按酒馆方式组装：`description` + `personality` + `scenario` + `system_prompt`，`post_history_instructions` 置于末尾，`mes_example` 作为示例对话区块；模板变量（`{{char}}`/`{{user}}`）做基本替换。
- **否则** → 完全沿用现有中文结构（既有特征化测试继续通过）。
- 走 TDD：先加酒馆分支的失败测试，再实现；现有 6 个 characterPrompt 测试保持绿。

---

## 7. 内嵌世界书 → 世界书 + 按角色绑定（已确认）

- `character_book.entries[]` → `CreateWorldbookEntry`：`keys`→`triggers`、`content`→`content`、`enabled`→`enabled`、`name`/`comment`→`title`、`insertion_order`→`priority`（**反转**：酒馆"小值靠前" → 你的"大值优先"，统一用 `priority = -insertion_order`，保持相对顺序、无需上限假设）。
- 世界书命名：`character_book.name` 或回退 `「<角色名> 的世界书」`。
- **绑定（按角色）**：编排器先建世界书拿到 `worldbook_id`，再建角色并写入 `extra_settings.bindings.worldbook_id`。**不**全局自动挂载。
- **自动挂载（仅限该角色）**：`useChatSession.createSession(characterId)` 读取该角色的 `bindings.worldbook_id`，存在则放入会话 `_worldbook_ids`（session meta）。选其他角色不挂。改动局限在会话创建路径，不动数据库 schema。
- 高级语义（selective/constant/position/use_regex/decorators）本轮不实现，数据在 `raw` 中无损保留，留待子项目 2。

---

## 8. UI 流程

创作工坊角色页"创建"旁加**「导入」**按钮：
1. 文件选择 `accept=".json,.png,.charx"`。
2. 本地解析 → 弹**预览确认框**：显示名字、立绘缩略图、识别到的规范版本、将创建的世界书条目数。
3. 确认 → 落库 → toast：「已导入角色 X（+N 条世界书条目）」。
4. 失败 → 明确中文错误（无法识别格式 / 文件损坏 / 不是角色卡），不崩（ErrorBoundary 兜底）。

---

## 9. 错误处理与安全

- 每层对坏输入返回结构化错误，不抛裸异常到 UI。
- 卡内文本**当数据不当代码**：预览/编辑不渲染 HTML（重型卡渲染是子项目 4）。
- 纯本地解析，不上传文件；不执行卡内任何脚本。

---

## 10. 测试

- 单元（纯函数）：PNG chunk 提取（含 `ccv3` 优先）、CHARX zip 取 `card.json`、V1/V2/V3 识别、字段映射、`insertion_order` 反转、lorebook 映射、头像缩放（jsdom 下 mock canvas/Image）。
- 集成：用内置样例卡做"文件→落库"端到端（V1 JSON、V2 JSON、含 character_book 的 V2、一张构造的带 `ccv3` chunk 的 PNG）。
- 回归：现有 characterPrompt / 其它测试保持全绿；新增酒馆分支测试。
- E2E（可选，复用 Playwright）：导入一张样例 JSON 卡 → 角色出现在列表。

---

## 11. 依赖

- 新增 `fflate`（轻量 zip，仅用于 CHARX 解析）。其余零新增运行时依赖（PNG chunk 手写解析、头像用浏览器 canvas）。

---

## 12. 已确认的关键决策
1. 映射采用**混合**：无损保留 + 结构填充；提示词管线加酒馆分支（现有行为不变）。
2. 内嵌世界书**现在就导入**成 Worldbook，**按角色绑定**，仅在新建会话选中该角色时自动挂载（绑定块设计为可扩展，供子项目 3/5 挂正则/预设）。
3. 头像存 **data URL**（导入时缩放）。
4. CHARX 走方案 A：**加 `fflate`，所有格式一次到位**。
