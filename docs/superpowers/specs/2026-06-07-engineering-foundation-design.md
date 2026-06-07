# 工程地基加固 — 设计方案（子项目 0）

- 状态：已通过设计评审，待实现
- 日期：2026-06-07
- 分支：`chore/engineering-foundation`
- 关联：这是「12 项工程问题修复 + SillyTavern 兼容 + 角色卡生成器」整体路线图中的第 0 个子项目。其余子项目（角色卡导入、世界书导入、正则引擎、重型卡渲染、预设兼容、角色卡生成器）各自单独出方案。

---

## 1. 背景与目标

项目当前约 2.3 万行 TS/TSX、版本 4.3.0，产品架构成熟，但工程基建停留在原型阶段：**零自动化测试、无 React 错误边界、无 ESLint/Prettier/CI**。本子项目的目标是先把「安全网」织好——在不重构业务逻辑的前提下，补齐测试、质量门禁、错误兜底，并顺带修掉几个低风险技术债。完成后，后续所有大改动（尤其酒馆兼容、重型卡）都能在测试和错误边界的保护下进行。

---

## 2. 范围

### 2.1 纳入范围（12 项中的低风险项）
1. 测试体系：Vitest 单元测试 + React Testing Library 组件/Hook 测试 + Playwright 端到端冒烟。
2. 代码质量门禁：ESLint（flat config）+ Prettier + GitHub Actions CI + 固定 Node 版本。
3. 运行时健壮性：React ErrorBoundary（顶层 + 聊天面 + 路由懒加载）+ 统一 logger。
4. 安全加固：vercel.json 增加 CSP；Edge Function 密钥派生加固（向后兼容）。
5. 三个小修复：托管伪流式 → async 队列；删除 dexie 死配置；workbox 切回 production。

### 2.2 排除范围（明确不在本子项目做）
- **Repository 统一接口抽象**（消除 `isLocalMode ? LocalRepo : Repo` 散弹分支）——留到做角色卡导入等碰相关 Repo 的子项目时顺带重构。
- **useChatSession（2008 行）拆分 + useReducer 迁移**——同上，风险高，应在有测试网之后、碰相关功能时再动。
- 其余上帝文件（ProviderPresetSelector、ContextPreview、ChatRoomPage、dataManagementService）的拆分——同上。

> 排除理由：这三类是高风险大重构，强行塞进「地基」会放大风险且与地基目标（先建安全网）矛盾。正确顺序是先有测试，再在触碰相关代码时重构。

---

## 3. 详细设计

### 3.1 测试体系

| 层级 | 工具链 | 覆盖目标 |
|---|---|---|
| 单元（纯逻辑） | Vitest | `supabase/functions/_shared/crypto.ts`（加解密往返、指纹）、`context/tokenBudget.ts`、`context/contextBuilder.ts`、`context/worldbookTrigger.ts`、`utils/characterPrompt.ts`、`providers/providerGateway.ts`、`providers/usage.ts` 与定价、`services/syncMetadata.ts` 决策、useChatSession 内的 JSON 解析器（记忆建议解析等可抽出测试） |
| 组件 / Hook | Vitest + React Testing Library + jsdom | `useChatSession` 关键行为（发消息 / 重生成 / 编辑重发 / 索引集合位移函数）、`MessageBubble`、`ContextPreview`、1–2 个 studio 编辑器 |
| 端到端 | Playwright（`@playwright/test`） | 1 条冒烟链路 |

**关键决策（已确认）— E2E 跑本地/访客模式**：冒烟链路为「打开应用 → 创作工坊建角色 → 建会话 → mock provider 发消息 → 见到回复」，全程不依赖 Supabase 登录与真实 API Key，保证 CI 完全离线、确定性高。带登录态的鉴权 E2E 留到以后单独补。

测试运行环境：jsdom（happy-dom 备选）。Edge Function 的 crypto 测试在 Node 环境下用 Web Crypto（`globalThis.crypto`，Node 已原生支持）运行。

### 3.2 代码质量门禁

- **ESLint（flat config，`eslint.config.js`）**：`typescript-eslint` 推荐集 + `eslint-plugin-react-hooks` + `eslint-plugin-react-refresh`。先 `--fix` 自动修复，再手动修掉剩余报错（预计量小：`any` 仅 6 处、未用变量已由 tsc 管控）。CI 中 lint 为硬门禁。
- **Prettier**：统一格式；提供 `format` 脚本。
- **固定 Node 版本**：新增 `package.json` 的 `engines` 字段与 `.nvmrc`，建议 **Node 22 LTS**，使 CI 与 Vercel 构建可复现，并为 workbox 改动兜底。
- **CI**：新增 `.github/workflows/ci.yml`，在 push 与 PR 触发：
  - `quality` job：`npm ci` → `tsc -b` → `eslint` → `vitest run --coverage` → `vite build`
  - `e2e` job：构建 → 起 `vite preview` → 运行 Playwright 冒烟（约 +1~2 分钟；如需省时可后续改为 PR-only）
- **新增 npm scripts**：`test` / `test:watch` / `test:coverage` / `lint` / `lint:fix` / `format` / `typecheck` / `test:e2e`。

### 3.3 运行时健壮性

- **ErrorBoundary**：
  - 顶层包住 `AppRouter`：任意未捕获渲染错误时展示「出错了 + 重新加载」降级页，而非整页白屏。
  - 聊天面与路由懒加载（`Suspense` 旁）各加一层，做到局部崩溃不拖垮全局。
  - 降级 UI 文案沿用项目中文风格。
- **统一 logger**：新增零依赖小模块（`logger.debug/info/warn/error`），生产环境默认只放行 `warn/error`、其余静音（按 `import.meta.env.DEV` 或显式级别）。替换现有 35 处 `console.*`（集中在 useChatSession 15、roleplayRepository 9、localMirror 3 等）。

### 3.4 安全加固

- **CSP（已确认务实策略）**：在 [vercel.json](../../../vercel.json) 增加 `Content-Security-Policy`：
  - `default-src 'self'`
  - `connect-src 'self' https://*.supabase.co https://api.deepseek.com https://*.openai.com`（按实际域名收敛）
  - `img-src 'self' data: blob:`（头像）
  - `style-src 'self' 'unsafe-inline'`（Tailwind / PWA 注入需要；**起步保留，严格化推迟**）
  - `script-src 'self'`
  - 其余按需收敛。**关键**：将来重型卡（子项目 4）用 sandboxed iframe 渲染，主文档 CSP 可一直保持收紧，不被重型卡逼着放宽。上线前实测确保不破坏现有功能（PWA、Supabase、流式）。
- **密钥派生加固**：[supabase/functions/_shared/crypto.ts](../../../supabase/functions/_shared/crypto.ts) 的 `deriveKeyBytes` 强制 secret 为合法 base64（16/24/32 字节），**移除弱 SHA-256 回退**，冷启动时校验、配置错误明确抛错。由于 [.env.example](../../../.env.example) 本就要求 `API_KEY_ENCRYPTION_SECRET` 为强随机 base64，正确配置下**对已有密文零影响、向后兼容**。保留 `encryption_key_version: "v1"` 便于将来密钥轮换。

### 3.5 三个小修复

1. **托管伪流式 → async 队列**：[providerGateway.ts:206](../../../src/features/roleplay/providers/providerGateway.ts) 当前用 80ms `setTimeout` 轮询 chunks 数组把回调转成 async iterable。改为 promise-resolver 队列（生产者回调 `push` + 消费者 `await next`），让 hosted 流式真正逐字吐出，消除最多 80ms 延迟与空转。改动局限于 `providerGateway.ts` 的 hosted 分支；后端 SSE（[hostedCredentialsService.ts](../../../src/features/roleplay/services/hostedCredentialsService.ts) 的 `sendHostedProviderChatStream`）已是干净回调，无需改。
2. **删 dexie 死配置**：移除 [vite.config.ts:21](../../../vite.config.ts) `manualChunks` 中针对不存在的 dexie 的分包判断（项目用原生 IndexedDB，无 dexie 依赖）。
3. **workbox → production**：将 [vite.config.ts:65](../../../vite.config.ts) 的 `mode: "development"` 改回 production（SW 压缩、体积更小）。在 pin 的 Node 22 上验证 `npm run build` 通过；若仍因构建环境失败，则保留 development 并在配置注释记录原因。

---

## 4. 实施顺序（安全网先行）

1. **工具链落地**（不改业务逻辑）：安装 Vitest + RTL + jsdom + Playwright；ESLint(flat) + Prettier；新增 npm scripts；pin Node（`engines` + `.nvmrc`）。
2. **现状快照测试**：先给现有纯函数补单测，锁住当前行为，作为后续改动的回归网。
3. **ErrorBoundary**：顶层 + 聊天面 + 路由懒加载。
4. **统一 logger**：替换 35 处 `console.*`。
5. **三个小修复**（每个配回归测试）：① 伪流式 → async 队列；② 删 dexie；③ workbox → production。
6. **密钥派生加固**（Edge crypto，向后兼容）+ 单测。
7. **CSP**（vercel.json）+ 实测不破坏功能。
8. **关键 hook/组件测试** + **E2E 冒烟**（本地/访客模式）。
9. **CI 接线**（`.github/workflows/ci.yml`），全绿收口。

> 原则：任何一处改动都在已有测试监视下进行，避免悄悄改坏。

---

## 5. 验收标准

- `npm run typecheck / lint / test / build` 全绿，产出覆盖率报告。
- 高风险纯函数有单测；关键 hook/组件有测试；1 条 E2E 冒烟通过。
- 注入错误时显示降级 UI 而非白屏。
- hosted 流式逐字输出（无轮询延迟）。
- 响应头含 CSP 且不破坏现有功能（PWA / Supabase / 流式）。
- Edge 加密对已有密文向后兼容（正确配置下解密行为不变）。
- CI 在 push/PR 上运行并通过。

---

## 6. 风险与缓解

| 风险 | 缓解 |
|---|---|
| 给 2008 行的 useChatSession 写组件/Hook 测试需要大量 mock | 优先抽出其中的纯函数单测；Hook 测试聚焦少数关键行为路径，不追求全覆盖 |
| CSP 过严破坏 PWA/流式 | 起步用务实策略并实测；严格化推迟到重型卡子项目（届时主文档可保持收紧） |
| workbox 切 production 在某 Node 下构建失败 | 先 pin Node 22 验证；失败则回退 development 并记录 |
| 密钥派生改动影响已有密文 | 仅移除弱回退、强制 base64；正确配置（本就要求 base64）下零影响；保留 key_version 便于轮换 |
| lint 在存量代码上报错过多 | 量预计很小（any 6 处、未用变量已由 tsc 管）；`--fix` + 手动修一次性清掉 |

---

## 7. 已确认的三个关键决策

1. **E2E 用本地/访客模式冒烟**，不依赖登录与真实 API Key。
2. **CSP 起步保留 `style-src 'unsafe-inline'`**，严格化推迟到重型卡子项目。
3. **两个大重构（Repository 接口、useChatSession 拆分）留到碰相关功能时再做**，不在本子项目。
