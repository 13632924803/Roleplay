# 工程地基加固 实现计划（子项目 0）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不重构业务逻辑的前提下，为项目补齐测试体系、质量门禁、错误兜底与安全加固，建立后续大改动的安全网。

**Architecture:** 先落地工具链（Vitest/RTL/Playwright/ESLint/Prettier），再用"特征化测试"锁住现有纯函数行为，然后在测试保护下做错误边界、统一 logger、三个小修复、密钥加固、CSP，最后补组件/E2E 测试并接入 CI。新代码走严格 TDD（先红后绿），对既有行为的测试为特征化测试（应直接通过）。

**Tech Stack:** Vite 5 + React 18 + TypeScript 5 + Vitest + React Testing Library + Playwright + ESLint(flat) + Prettier + GitHub Actions。

**关联 spec:** `docs/superpowers/specs/2026-06-07-engineering-foundation-design.md`
**分支:** `chore/engineering-foundation`

---

## 文件结构（将创建/修改）

**新建：**
- `vitest.config.ts` — Vitest 配置（jsdom 环境、setup、coverage）
- `src/test/setup.ts` — 测试全局 setup（jest-dom、cleanup）
- `eslint.config.js` — ESLint flat 配置
- `.prettierrc.json` / `.prettierignore` — Prettier 配置
- `.nvmrc` — Node 版本固定
- `playwright.config.ts` — Playwright 配置
- `src/shared/lib/logger.ts` — 统一日志模块
- `src/shared/components/ErrorBoundary.tsx` — React 错误边界
- `src/features/roleplay/providers/streamQueue.ts` — 回调→异步可迭代工具
- 各 `*.test.ts(x)` 测试文件（见各任务）
- `e2e/smoke.spec.ts` — 端到端冒烟
- `.github/workflows/ci.yml` — CI

**修改：**
- `package.json` — devDeps、scripts、engines
- `src/main.tsx` — 挂载顶层 ErrorBoundary
- `src/app/router.tsx` — 路由懒加载层 ErrorBoundary
- `src/features/roleplay/providers/providerGateway.ts:154-260` — hosted 流式改用 streamQueue
- `supabase/functions/_shared/crypto.ts:18-30` — 密钥派生加固
- `vite.config.ts:15-23,65` — 删 dexie 死配置、workbox 改 production
- `vercel.json` — 增加 CSP
- 含 `console.*` 的 10 个文件 — 替换为 logger

---

# 阶段 1 — 工具链落地（不改业务逻辑）

### Task 1: 安装并配置 Vitest + RTL

**Files:**
- Create: `vitest.config.ts`, `src/test/setup.ts`, `src/test/sanity.test.ts`
- Modify: `package.json`

- [ ] **Step 1: 安装依赖**

Run:
```bash
npm install -D vitest@^2 @vitest/coverage-v8@^2 jsdom@^25 @testing-library/react@^16 @testing-library/jest-dom@^6 @testing-library/user-event@^14
```
Expected: `added N packages`，无 peer 冲突报错。

- [ ] **Step 2: 创建 `vitest.config.ts`**

> 单独配置文件（不复用 vite.config.ts，避开 PWA 插件在测试期运行）。

```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}", "supabase/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.{ts,tsx}", "supabase/functions/_shared/**/*.ts"],
      exclude: ["src/**/*.test.{ts,tsx}", "src/test/**", "src/**/*.types.ts"],
    },
  },
});
```

- [ ] **Step 3: 创建 `src/test/setup.ts`**

```ts
import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(() => {
  cleanup();
  localStorage.clear();
});
```

- [ ] **Step 4: 加 npm scripts（修改 `package.json` 的 `scripts`）**

```json
"test": "vitest run",
"test:watch": "vitest",
"test:coverage": "vitest run --coverage",
"typecheck": "tsc -b"
```

- [ ] **Step 5: 写一个 sanity 测试 `src/test/sanity.test.ts`**

```ts
import { describe, it, expect } from "vitest";

describe("test harness", () => {
  it("runs", () => {
    expect(1 + 1).toBe(2);
  });
  it("has jsdom + jest-dom", () => {
    const el = document.createElement("div");
    el.textContent = "ok";
    document.body.appendChild(el);
    expect(el).toBeInTheDocument();
  });
});
```

- [ ] **Step 6: 运行**

Run: `npm run test`
Expected: 2 passed。

- [ ] **Step 7: 提交**

```bash
git add package.json package-lock.json vitest.config.ts src/test/
git commit -m "chore(test): set up Vitest + React Testing Library harness"
```

---

### Task 2: 安装并配置 ESLint(flat) + Prettier

**Files:**
- Create: `eslint.config.js`, `.prettierrc.json`, `.prettierignore`
- Modify: `package.json`

- [ ] **Step 1: 安装依赖**

Run:
```bash
npm install -D eslint@^9 @eslint/js@^9 typescript-eslint@^8 eslint-plugin-react-hooks@^5 eslint-plugin-react-refresh@^0.4 globals@^15 prettier@^3 eslint-config-prettier@^9
```
Expected: `added N packages`。

- [ ] **Step 2: 创建 `eslint.config.js`**

```js
import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import prettier from "eslint-config-prettier";

export default tseslint.config(
  { ignores: ["dist", "dev-dist", "coverage", "supabase/functions/**", "playwright-report", "test-results"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.browser, ...globals.serviceworker },
    },
    plugins: { "react-hooks": reactHooks, "react-refresh": reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
  prettier,
);
```

- [ ] **Step 3: 创建 `.prettierrc.json`**

```json
{
  "semi": true,
  "singleQuote": false,
  "printWidth": 100,
  "trailingComma": "all"
}
```

- [ ] **Step 4: 创建 `.prettierignore`**

```
dist
dev-dist
coverage
playwright-report
test-results
package-lock.json
*.md
supabase/.temp
```

- [ ] **Step 5: 加 npm scripts**

```json
"lint": "eslint .",
"lint:fix": "eslint . --fix",
"format": "prettier --write \"src/**/*.{ts,tsx,css}\""
```

- [ ] **Step 6: 自动修复 + 查看剩余问题**

Run: `npm run lint:fix; npm run lint`
Expected: 可能有少量 `warn`（未用变量等）。**逐个手动修正**真实报错，直到 `npm run lint` 退出码为 0（warning 可保留，error 必须清零）。

- [ ] **Step 7: 运行测试确认未破坏**

Run: `npm run test`
Expected: 全部通过。

- [ ] **Step 8: 提交**

```bash
git add eslint.config.js .prettierrc.json .prettierignore package.json package-lock.json src/
git commit -m "chore(lint): add ESLint flat config + Prettier"
```

---

### Task 3: 固定 Node 版本

**Files:** Create `.nvmrc`; Modify `package.json`

- [ ] **Step 1: 创建 `.nvmrc`**

```
22
```

- [ ] **Step 2: 在 `package.json` 顶层加 `engines`**

```json
"engines": { "node": ">=20 <23" }
```

- [ ] **Step 3: 提交**

```bash
git add .nvmrc package.json
git commit -m "chore: pin Node version (22 LTS) for reproducible builds"
```

---

### Task 4: 安装并配置 Playwright

**Files:** Create `playwright.config.ts`, `e2e/.gitkeep`; Modify `package.json`, `.gitignore`

- [ ] **Step 1: 安装**

Run: `npm install -D @playwright/test@^1.50 && npx playwright install chromium`
Expected: chromium 下载完成。

- [ ] **Step 2: 创建 `playwright.config.ts`**

```ts
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  use: { baseURL: "http://localhost:4173", trace: "on-first-retry" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run build && npm run preview -- --port 4173",
    url: "http://localhost:4173",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
```

- [ ] **Step 3: 加 script + gitignore**

`package.json`: `"test:e2e": "playwright test"`
`.gitignore` 追加：`playwright-report/`、`test-results/`、`/dev-dist`

- [ ] **Step 4: 占位** `e2e/.gitkeep`（真实 spec 在 Task 22）

- [ ] **Step 5: 提交**

```bash
git add playwright.config.ts package.json package-lock.json .gitignore e2e/.gitkeep
git commit -m "chore(e2e): set up Playwright harness"
```

---

# 阶段 2 — 特征化测试（锁住现有纯函数行为，应直接通过）

> 这些测试描述**当前**行为，运行后应直接 PASS（非红-绿）。目的是后续改动若意外破坏行为会立刻报红。

### Task 5: tokenBudget 测试

**Files:** Create `src/features/roleplay/context/tokenBudget.test.ts`

- [ ] **Step 1: 写测试**

```ts
import { describe, it, expect } from "vitest";
import { estimateTokens, buildBudget, BUDGET_LIMITS } from "./tokenBudget";

describe("estimateTokens", () => {
  it("returns 0 for empty", () => expect(estimateTokens("")).toBe(0));
  it("uses ceil(len/1.5) with min 1", () => {
    expect(estimateTokens("a")).toBe(1);
    expect(estimateTokens("abc")).toBe(2);
  });
});

describe("buildBudget", () => {
  it("keeps high-priority worldbook entries and drops overflow", () => {
    const big = "x".repeat(3000); // ~2000 tokens, exceeds wb budget 2000 alone边界
    const entries = [
      { id: "a", title: "A", content: "short", priority: 10 },
      { id: "b", title: "B", content: big, priority: 1 },
    ];
    const out = buildBudget("char", "tpl", entries, [], "", []);
    const ids = out.worldbookEntries.map((e) => e.id);
    expect(ids).toContain("a"); // 高优先先入
    expect(out.budgetLimit).toBe(8000);
  });

  it("sorts memories by salience and respects memory budget", () => {
    const out = buildBudget("c", "t", [], [
      { id: "m1", title: "m1", content: "low", salience: 1 },
      { id: "m2", title: "m2", content: "high", salience: 9 },
    ], "", []);
    expect(out.memories[0].id).toBe("m2");
  });

  it("fills recent messages into remaining budget from newest", () => {
    const out = buildBudget("c", "t", [], [], "", ["m-old", "m-new"]);
    expect(out.recentMessages.length).toBeGreaterThan(0);
  });

  it("exposes BUDGET_LIMITS constants", () => {
    expect(BUDGET_LIMITS.worldbook).toBe(2000);
  });
});
```

- [ ] **Step 2: 运行** — Run: `npm run test -- tokenBudget` — Expected: 全部 PASS。若某断言与真实实现不符，**以实现为准修正断言**（特征化）。
- [ ] **Step 3: 提交** — `git add ...tokenBudget.test.ts && git commit -m "test: characterize tokenBudget"`

---

### Task 6: worldbookTrigger 测试

**Files:** Create `src/features/roleplay/context/worldbookTrigger.test.ts`

- [ ] **Step 1: 写测试**

```ts
import { describe, it, expect } from "vitest";
import { parseKeywords, matchKeywords, triggerWorldbookEntries } from "./worldbookTrigger";
import type { WorldbookEntryRow } from "../types/database";

function entry(over: Partial<WorldbookEntryRow>): WorldbookEntryRow {
  return {
    id: "e1", worldbook_id: "w", user_id: "u", title: "t", category: "general",
    content: "c", triggers: [], priority: 0, enabled: true, scope: "global",
    token_estimate: null, last_triggered_at: null, trigger_count: 0,
    deleted_at: null, deleted_reason: null, created_at: "", updated_at: "", ...over,
  };
}

describe("parseKeywords", () => {
  it("splits on CN/EN separators and dedupes", () => {
    expect(parseKeywords("a, b，c、a")).toEqual(["a", "b", "c"]);
  });
  it("handles array and null", () => {
    expect(parseKeywords(["x", "y"])).toEqual(["x", "y"]);
    expect(parseKeywords(null)).toEqual([]);
  });
});

describe("matchKeywords", () => {
  it("matches case-insensitively ignoring punctuation/space", () => {
    expect(matchKeywords("Hello, WORLD!", "world")).toEqual(["world"]);
  });
  it("returns empty when no input", () => {
    expect(matchKeywords("", "world")).toEqual([]);
  });
});

describe("triggerWorldbookEntries", () => {
  it("skips disabled entries", () => {
    const r = triggerWorldbookEntries([entry({ enabled: false, triggers: ["dragon"] })],
      "a dragon", [], null, null, new Set());
    expect(r.skipped[0].reason).toBe("条目已禁用");
  });
  it("marks injected when id in budget set", () => {
    const e = entry({ id: "k", triggers: ["dragon"] });
    const r = triggerWorldbookEntries([e], "dragon!", [], null, null, new Set(["k"]));
    expect(r.triggered[0].injected).toBe(true);
  });
  it("triggers but not injected when over budget", () => {
    const e = entry({ id: "k", triggers: ["dragon"] });
    const r = triggerWorldbookEntries([e], "dragon!", [], null, null, new Set());
    expect(r.triggered[0].injected).toBe(false);
  });
});
```

- [ ] **Step 2: 运行** — `npm run test -- worldbookTrigger` — Expected: PASS（不符则以实现为准修正）。
- [ ] **Step 3: 提交** — `git commit -m "test: characterize worldbookTrigger"`

---

### Task 7: characterPrompt 测试

**Files:** Create `src/features/roleplay/utils/characterPrompt.test.ts`

- [ ] **Step 1: 写测试**

```ts
import { describe, it, expect } from "vitest";
import {
  parseCharacterCard, packCharacterCard, buildCharacterSystemPrompt,
  parseSessionMeta, buildSessionMeta, SESSION_META_VERSION, EMPTY_CARD,
} from "./characterPrompt";
import type { CharacterRow } from "../types/database";

function char(card: Record<string, unknown>, name = "阿狸"): CharacterRow {
  return {
    id: "c", user_id: "u", name, slug: null, summary: null, card_json: card,
    avatar_path: null, avatar_emoji: null, tags: [], visibility: "private",
    is_favorite: false, archived_at: null, deleted_at: null, created_at: "", updated_at: "",
  };
}

describe("parse/pack card", () => {
  it("round-trips known fields", () => {
    const packed = packCharacterCard({ ...EMPTY_CARD, identity: "狐娘", personality: "傲娇" });
    expect(parseCharacterCard(char(packed)).identity).toBe("狐娘");
  });
  it("defaults missing fields to empty string", () => {
    expect(parseCharacterCard(char({})).personality).toBe("");
  });
});

describe("buildCharacterSystemPrompt", () => {
  it("includes name and non-empty fields", () => {
    const p = buildCharacterSystemPrompt(char({ identity: "狐娘", personality: "傲娇" }));
    expect(p).toContain("阿狸");
    expect(p).toContain("身份：狐娘");
    expect(p).toContain("性格：傲娇");
  });
  it("substitutes template vars and appends base setting", () => {
    const p = buildCharacterSystemPrompt(char({ user_nickname: "主人" }), "你好 {{user_name}}");
    expect(p).toContain("你好 主人");
    expect(p).toContain("角色基础设定");
  });
});

describe("session meta", () => {
  it("round-trips", () => {
    const meta = buildSessionMeta({ _meta_version: SESSION_META_VERSION, _template_id: "t1" });
    expect(parseSessionMeta(meta)._template_id).toBe("t1");
  });
  it("returns fresh meta for legacy/non-json prompt", () => {
    expect(parseSessionMeta("一段旧的纯文本提示词")._meta_version).toBe(SESSION_META_VERSION);
  });
});
```

- [ ] **Step 2: 运行** — `npm run test -- characterPrompt` — Expected: PASS。
- [ ] **Step 3: 提交** — `git commit -m "test: characterize characterPrompt"`

---

### Task 8: usage + deepseekPricing 测试

**Files:** Create `src/features/roleplay/providers/usage.test.ts`, `src/features/roleplay/providers/pricing/deepseekPricing.test.ts`

- [ ] **Step 1: 写 usage 测试**

```ts
import { describe, it, expect } from "vitest";
import { normalizeProviderUsage } from "./usage";

describe("normalizeProviderUsage", () => {
  it("flags unavailable for non-object", () => {
    expect(normalizeProviderUsage("deepseek", null).usageAvailable).toBe(false);
  });
  it("parses deepseek cache fields", () => {
    const u = normalizeProviderUsage("deepseek", {
      prompt_tokens: 100, completion_tokens: 20, total_tokens: 120,
      prompt_cache_hit_tokens: 80, prompt_cache_miss_tokens: 20,
    });
    expect(u.inputTokens).toBe(100);
    expect(u.cacheHitInputTokens).toBe(80);
    expect(u.cacheHitRate).toBeCloseTo(0.8);
    expect(u.usageAvailable).toBe(true);
  });
  it("omits cache fields for non-deepseek", () => {
    const u = normalizeProviderUsage("openai_compatible", {
      prompt_tokens: 10, completion_tokens: 5, prompt_cache_hit_tokens: 3,
    });
    expect(u.cacheHitInputTokens).toBeUndefined();
  });
});
```

- [ ] **Step 2: 写 pricing 测试**

```ts
import { describe, it, expect } from "vitest";
import { estimateDeepSeekCost } from "./deepseekPricing";
import type { ProviderUsage } from "../provider.types";

function usage(over: Partial<ProviderUsage>): ProviderUsage {
  return { usageAvailable: true, rawUsage: {}, sourceProvider: "deepseek", ...over };
}

describe("estimateDeepSeekCost", () => {
  it("returns null when usage unavailable", () => {
    expect(estimateDeepSeekCost(usage({ usageAvailable: false }), "deepseek-v4-flash")).toBeNull();
  });
  it("computes split cache hit/miss input cost", () => {
    const c = estimateDeepSeekCost(
      usage({ outputTokens: 1_000_000, cacheHitInputTokens: 1_000_000, cacheMissInputTokens: 0 }),
      "deepseek-v4-flash",
    );
    expect(c?.outputCost).toBeCloseTo(0.28, 5);
    expect(c?.cacheHitInputCost).toBeCloseTo(0.0028, 5);
  });
  it("warns and falls back for legacy model name", () => {
    const c = estimateDeepSeekCost(usage({ inputTokens: 100, outputTokens: 10 }), "deepseek-chat");
    expect(c?.estimateWarning).toContain("deepseek-v4-flash");
  });
});
```

- [ ] **Step 3: 运行** — `npm run test -- usage deepseekPricing` — Expected: PASS（数值不符则以实现为准修正）。
- [ ] **Step 4: 提交** — `git commit -m "test: characterize usage + deepseek pricing"`

---

### Task 9: syncMetadata 测试

**Files:** Create `src/features/roleplay/services/syncMetadata.test.ts`

- [ ] **Step 1: 写测试**（依赖 jsdom 的 localStorage，setup 已每次清空）

```ts
import { describe, it, expect } from "vitest";
import {
  getSyncDecision, setSyncDecision, clearSyncDecision,
  getSyncMetadata, setSyncMetadata,
} from "./syncMetadata";

describe("sync decision", () => {
  it("stores and reads valid decisions", () => {
    setSyncDecision("u1", "upload");
    expect(getSyncDecision("u1")).toBe("upload");
  });
  it("returns null after clear and for unknown", () => {
    setSyncDecision("u1", "download");
    clearSyncDecision("u1");
    expect(getSyncDecision("u1")).toBeNull();
    expect(getSyncDecision("nope")).toBeNull();
  });
});

describe("sync metadata", () => {
  it("round-trips JSON", () => {
    setSyncMetadata("u1", { lastSyncedAt: "2026-01-01T00:00:00Z" } as never);
    expect(getSyncMetadata("u1")).toEqual({ lastSyncedAt: "2026-01-01T00:00:00Z" });
  });
  it("returns null on corrupt json", () => {
    localStorage.setItem("rp_sync_meta_u1", "{not json");
    expect(getSyncMetadata("u1")).toBeNull();
  });
});
```

- [ ] **Step 2: 运行** — `npm run test -- syncMetadata` — Expected: PASS。若 `SyncMetadata` 类型字段名不同，按 `src/features/roleplay/types/sync.ts` 修正断言里的字段。
- [ ] **Step 3: 提交** — `git commit -m "test: characterize syncMetadata"`

---

### Task 10: crypto 测试（Deno 桩 + Node 环境）

**Files:** Create `supabase/functions/_shared/crypto.test.ts`

- [ ] **Step 1: 写测试**

> 首行注释让 Vitest 用 node 环境；测试前桩掉 `globalThis.Deno`。

```ts
// @vitest-environment node
import { describe, it, expect, beforeAll } from "vitest";

const SECRET = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))));

beforeAll(() => {
  (globalThis as Record<string, unknown>).Deno = {
    env: { get: (k: string) => (k === "API_KEY_ENCRYPTION_SECRET" ? SECRET : undefined) },
  };
});

describe("crypto round-trip", () => {
  it("decrypts what it encrypts", async () => {
    const { encryptApiKey, decryptApiKey } = await import("./crypto.ts");
    const { encrypted_api_key, encryption_iv } = await encryptApiKey("sk-secret-123");
    const back = await decryptApiKey(encrypted_api_key, encryption_iv);
    expect(back).toBe("sk-secret-123");
  });
  it("produces a stable fingerprint", async () => {
    const { createKeyFingerprint } = await import("./crypto.ts");
    const a = await createKeyFingerprint("sk-x");
    const b = await createKeyFingerprint("sk-x");
    expect(a).toBe(b);
    expect(a).not.toHaveLength(0);
  });
});
```

- [ ] **Step 2: 运行** — `npm run test -- crypto` — Expected: PASS（证明 Web Crypto + Deno 桩可测）。
- [ ] **Step 3: 提交** — `git commit -m "test: characterize edge crypto round-trip"`

---

# 阶段 3 — 错误兜底

### Task 11: ErrorBoundary 组件（TDD）

**Files:** Create `src/shared/components/ErrorBoundary.tsx`, `src/shared/components/ErrorBoundary.test.tsx`

- [ ] **Step 1: 写失败测试**

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ErrorBoundary } from "./ErrorBoundary";

function Boom(): JSX.Element { throw new Error("boom"); }

describe("ErrorBoundary", () => {
  it("renders children when no error", () => {
    render(<ErrorBoundary><span>正常</span></ErrorBoundary>);
    expect(screen.getByText("正常")).toBeInTheDocument();
  });
  it("renders fallback on child error", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(<ErrorBoundary><Boom /></ErrorBoundary>);
    expect(screen.getByText(/出错了/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 运行确认失败** — `npm run test -- ErrorBoundary` — Expected: FAIL（模块不存在）。

- [ ] **Step 3: 实现 `ErrorBoundary.tsx`**

```tsx
import { Component, type ErrorInfo, type ReactNode } from "react";
import { logger } from "../lib/logger";

interface Props { children: ReactNode; fallback?: ReactNode; label?: string }
interface State { hasError: boolean }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };
  static getDerivedStateFromError(): State { return { hasError: true }; }
  componentDidCatch(error: Error, info: ErrorInfo): void {
    logger.error(`[ErrorBoundary${this.props.label ? `:${this.props.label}` : ""}]`, error, info.componentStack);
  }
  render(): ReactNode {
    if (!this.state.hasError) return this.props.children;
    if (this.props.fallback) return this.props.fallback;
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
        <p className="text-sm text-ink-300">出错了，这个区域暂时无法显示。</p>
        <button
          className="rounded-full border border-ink-200 px-4 py-2 text-sm"
          onClick={() => window.location.reload()}
        >
          重新加载
        </button>
      </div>
    );
  }
}
```

> 依赖 `logger`（Task 13 创建）。若 13 尚未完成，临时用 `console.error`，13 完成后改回。建议先做 Task 13 再做本任务——见阶段顺序说明。

- [ ] **Step 4: 运行确认通过** — `npm run test -- ErrorBoundary` — Expected: 2 passed。
- [ ] **Step 5: 提交** — `git commit -m "feat(resilience): add ErrorBoundary component"`

---

### Task 12: 挂载 ErrorBoundary

**Files:** Modify `src/main.tsx`, `src/app/router.tsx`

- [ ] **Step 1: `main.tsx` 顶层包裹**

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import { ErrorBoundary } from "./shared/components/ErrorBoundary";
import "./shared/styles/globals.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary label="root">
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
```

- [ ] **Step 2: `router.tsx` 在 `Suspense` 内包裹 `Routes`**

将 `<Suspense fallback={<PageLoader />}>` 的子内容用 `<ErrorBoundary label="route">...</ErrorBoundary>` 包住（import 之）。

- [ ] **Step 3: 验证** — Run: `npm run build && npm run test` — Expected: 构建成功、测试通过。手动：临时在某页 throw 验证降级 UI（验证后还原）。
- [ ] **Step 4: 提交** — `git commit -m "feat(resilience): mount ErrorBoundary at root and route level"`

---

# 阶段 4 — 统一 logger

### Task 13: logger 工具（TDD）

**Files:** Create `src/shared/lib/logger.ts`, `src/shared/lib/logger.test.ts`

> **顺序提示：** 本任务应在 Task 11 之前做（ErrorBoundary 依赖 logger）。执行时把 Task 13 提到 Task 11 前。

- [ ] **Step 1: 写失败测试**

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { logger, setLogLevel } from "./logger";

describe("logger", () => {
  beforeEach(() => setLogLevel("debug"));
  it("forwards error to console.error", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    logger.error("x");
    expect(spy).toHaveBeenCalledWith("x");
  });
  it("suppresses debug when level is warn", () => {
    setLogLevel("warn");
    const spy = vi.spyOn(console, "debug").mockImplementation(() => {});
    logger.debug("hidden");
    expect(spy).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 运行确认失败** — `npm run test -- logger` — Expected: FAIL。

- [ ] **Step 3: 实现 `logger.ts`**

```ts
type Level = "debug" | "info" | "warn" | "error";
const ORDER: Record<Level, number> = { debug: 0, info: 1, warn: 2, error: 3 };

let current: Level = import.meta.env.DEV ? "debug" : "warn";
export function setLogLevel(level: Level): void { current = level; }

function enabled(level: Level): boolean { return ORDER[level] >= ORDER[current]; }

export const logger = {
  debug: (...a: unknown[]) => { if (enabled("debug")) console.debug(...a); },
  info: (...a: unknown[]) => { if (enabled("info")) console.info(...a); },
  warn: (...a: unknown[]) => { if (enabled("warn")) console.warn(...a); },
  error: (...a: unknown[]) => { if (enabled("error")) console.error(...a); },
};
```

- [ ] **Step 4: 运行确认通过** — `npm run test -- logger` — Expected: 2 passed。
- [ ] **Step 5: 提交** — `git commit -m "feat(obs): add level-gated logger"`

---

### Task 14: 替换散落的 console.*

**Files:** Modify 含 `console.*` 的文件（useChatSession 15、roleplayRepository 9、localMirror 3、AuthProvider 2、supabaseClient 1、apiKeyStorage 1、dataManagementService 1、MessageBubble 1、ChatRoomPage 1、DataManagementPage 1）

- [ ] **Step 1: 逐文件替换** — 用 `git grep -n "console\." -- 'src/*'` 列出；将 `console.warn/error/log/debug/info` 改为 `logger.*`（`console.log` → `logger.debug`），并在文件头 `import { logger } from "<相对路径>/shared/lib/logger";`。
- [ ] **Step 2: 验证** — Run: `npm run lint && npm run test && npm run build` — Expected: 全绿。`git grep -c "console\." -- 'src/*'` 仅剩 logger.ts 内部实现。
- [ ] **Step 3: 提交** — `git commit -m "refactor(obs): route console.* through logger"`

---

# 阶段 5 — 三个小修复

### Task 15: streamQueue 工具（TDD）

**Files:** Create `src/features/roleplay/providers/streamQueue.ts`, `src/features/roleplay/providers/streamQueue.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
import { describe, it, expect } from "vitest";
import { createStreamQueue } from "./streamQueue";

describe("createStreamQueue", () => {
  it("yields pushed values in order then completes", async () => {
    const q = createStreamQueue<number>();
    q.push(1); q.push(2); q.close();
    const out: number[] = [];
    for await (const v of q.iterable) out.push(v);
    expect(out).toEqual([1, 2]);
  });
  it("delivers values pushed after consumer starts waiting", async () => {
    const q = createStreamQueue<string>();
    const collected: string[] = [];
    const done = (async () => { for await (const v of q.iterable) collected.push(v); })();
    await Promise.resolve();
    q.push("a"); q.push("b"); q.close();
    await done;
    expect(collected).toEqual(["a", "b"]);
  });
  it("propagates errors", async () => {
    const q = createStreamQueue<number>();
    q.fail(new Error("boom"));
    await expect((async () => { for await (const _ of q.iterable) void _; })())
      .rejects.toThrow("boom");
  });
});
```

- [ ] **Step 2: 运行确认失败** — `npm run test -- streamQueue` — Expected: FAIL。

- [ ] **Step 3: 实现 `streamQueue.ts`**

```ts
export interface StreamQueue<T> {
  push: (value: T) => void;
  close: () => void;
  fail: (error: Error) => void;
  iterable: AsyncIterable<T>;
}

/** Convert a push-based callback stream into a pull-based async iterable (no polling). */
export function createStreamQueue<T>(): StreamQueue<T> {
  const buffer: T[] = [];
  let done = false;
  let error: Error | null = null;
  let wake: (() => void) | null = null;

  const signal = () => { if (wake) { const w = wake; wake = null; w(); } };

  async function* gen(): AsyncIterable<T> {
    while (true) {
      while (buffer.length) yield buffer.shift() as T;
      if (error) throw error;
      if (done) return;
      await new Promise<void>((resolve) => { wake = resolve; });
    }
  }

  return {
    push: (value) => { buffer.push(value); signal(); },
    close: () => { done = true; signal(); },
    fail: (e) => { error = e; signal(); },
    iterable: gen(),
  };
}
```

- [ ] **Step 4: 运行确认通过** — `npm run test -- streamQueue` — Expected: 3 passed。
- [ ] **Step 5: 提交** — `git commit -m "feat(provider): add streamQueue (callbacks→async iterable)"`

---

### Task 16: providerGateway 用 streamQueue 替换轮询

**Files:** Modify `src/features/roleplay/providers/providerGateway.ts:168-257`
**Test:** Create `src/features/roleplay/providers/providerGateway.stream.test.ts`

- [ ] **Step 1: 写测试（mock 托管流式服务）**

```ts
import { describe, it, expect, vi } from "vitest";

vi.mock("../services/hostedCredentialsService", () => ({
  sendHostedProviderChatStream: async (_i: unknown, cb: {
    onDelta: (t: string) => void; onUsage: (u: unknown) => void; onDone: () => void;
  }) => { cb.onDelta("Hello"); cb.onDelta(" world"); cb.onDone(); },
  testHostedCredential: vi.fn(),
  sendHostedProviderChat: vi.fn(),
}));

describe("sendProviderStreamRequest (hosted)", () => {
  it("yields deltas in order without polling", async () => {
    const { sendProviderStreamRequest } = await import("./providerGateway");
    const cfg = {
      provider: "deepseek", model: "deepseek-v4-flash", baseURL: "", apiKey: "",
      apiKeyStorageMode: "hosted_encrypted", credentialId: "cred-1",
      temperature: 1, maxTokens: 100, streamEnabled: true,
    } as never;
    const chunks: string[] = [];
    for await (const c of sendProviderStreamRequest(false, cfg, [{ role: "user", content: "hi" }])) {
      if (c.content) chunks.push(c.content);
    }
    expect(chunks.join("")).toBe("Hello world");
  });
});
```

- [ ] **Step 2: 运行确认失败/现状** — `npm run test -- providerGateway.stream` — 记录当前结果。

- [ ] **Step 3: 重构 hosted 分支** — 在 `providerGateway.ts` 的 hosted 流式分支（约 168–257 行）删除 `pollInterval`/`setTimeout` 轮询，改用 `createStreamQueue`：

```ts
import { createStreamQueue } from "./streamQueue";
// ...
if (config.apiKeyStorageMode === "hosted_encrypted" && config.credentialId) {
  return (async function* () {
    const queue = createStreamQueue<ChatStreamChunk>();
    let hostedUsage: ProviderUsage | null = null;
    sendHostedProviderChatStream(
      {
        credential_id: config.credentialId as string,
        provider_type: config.provider as Exclude<ProviderType, "mock">,
        model: config.model, messages,
        temperature: config.temperature, max_tokens: config.maxTokens, userId: config.userId,
      },
      {
        onDelta: (text) => queue.push({ content: text, done: false }),
        onUsage: (usage) => { hostedUsage = usage; },
        onDone: () => queue.close(),
        onError: (error) => queue.fail(error),
      },
      signal,
    );
    for await (const chunk of queue.iterable) yield chunk;
    const usage = hostedUsage ?? {
      usageAvailable: false,
      usageUnavailableReason: "托管聊天服务未返回本次用量，请确认 hosted-provider-chat 已部署到最新版本。",
      rawUsage: null, sourceProvider: config.provider,
    };
    yield { content: "", done: false, usage };
    yield { content: "", done: true, usage };
  })();
}
```

- [ ] **Step 4: 运行** — `npm run test -- providerGateway.stream` 与 `npm run typecheck` — Expected: PASS、类型通过。
- [ ] **Step 5: 提交** — `git commit -m "perf(provider): replace hosted pseudo-stream polling with streamQueue"`

---

### Task 17: 删 dexie 死配置 + workbox 切 production

**Files:** Modify `vite.config.ts`

- [ ] **Step 1: 删除 dexie 分包行** — 移除 `manualChunks` 中 `if (id.includes("dexie")) return "storage-vendor";` 一行。
- [ ] **Step 2: workbox 改 production** — 将 `workbox` 配置里的 `mode: "development"` 改为 `mode: "production"`（并更新上方注释）。
- [ ] **Step 3: 验证构建** — Run: `npm run build` — Expected: 构建成功、生成 SW。若因构建环境报错，则把 `mode` 还原为 `"development"` 并在注释记录原因（此步可独立回退，不阻塞其余）。
- [ ] **Step 4: 提交** — `git commit -m "chore(build): drop dead dexie chunk + workbox production mode"`

---

# 阶段 6 — 密钥派生加固（Edge，向后兼容）

### Task 18: 强制 base64 密钥、移除弱回退（TDD 改动）

**Files:** Modify `supabase/functions/_shared/crypto.ts:18-30`; Modify `supabase/functions/_shared/crypto.test.ts`

- [ ] **Step 1: 先加失败测试**（断言新行为：非法 secret 抛错；合法 secret 仍可往返）— 在 `crypto.test.ts` 追加：

```ts
describe("crypto secret hardening", () => {
  it("throws on invalid (non-base64 / wrong-length) secret", async () => {
    (globalThis as Record<string, unknown>).Deno = {
      env: { get: (k: string) => (k === "API_KEY_ENCRYPTION_SECRET" ? "too-short" : undefined) },
    };
    const mod = await import("./crypto.ts?bad"); // 绕过模块缓存
    await expect(mod.encryptApiKey("x")).rejects.toThrow();
  });
});
```

> 若 `?bad` 查询无法绕过缓存，改用 `vi.resetModules()` + 重新 `import`。

- [ ] **Step 2: 运行确认失败** — `npm run test -- crypto` — Expected: 新用例 FAIL（当前会回退 SHA-256，不抛错）。

- [ ] **Step 3: 加固 `deriveKeyBytes`** — 替换为：

```ts
function deriveKeyBytes(secret: string): Uint8Array {
  let decoded: Uint8Array;
  try {
    decoded = base64ToBytes(secret);
  } catch {
    throw new Error("API_KEY_ENCRYPTION_SECRET must be valid base64.");
  }
  if (decoded.byteLength !== 16 && decoded.byteLength !== 24 && decoded.byteLength !== 32) {
    throw new Error("API_KEY_ENCRYPTION_SECRET must decode to 16/24/32 bytes (recommend 32).");
  }
  return decoded;
}
```

> 该函数从 `async` 变同步（去掉了 SHA-256 摘要分支）。同步更新两处 `await deriveKeyBytes(...)` 调用：`importAesKey`/`importHmacKey` 内改为 `const keyBytes = deriveKeyBytes(secret);`（去掉 `await`）。**正确配置（base64 的 32 字节）下行为不变，已有密文照常解密。**

- [ ] **Step 4: 运行确认通过** — `npm run test -- crypto` — Expected: 全部 PASS（往返用例仍绿、加固用例转绿）。
- [ ] **Step 5: 提交** — `git commit -m "fix(security): enforce base64 key, remove weak SHA-256 fallback (backward-compatible)"`

---

# 阶段 7 — CSP

### Task 19: 增加 Content-Security-Policy

**Files:** Modify `vercel.json`; Create `vercel.test.ts`（根目录守卫测试）

- [ ] **Step 1: 写守卫测试**（确保 CSP 存在且含关键指令）

```ts
import { describe, it, expect } from "vitest";
import vercel from "./vercel.json";

describe("vercel CSP", () => {
  it("declares a Content-Security-Policy header", () => {
    const headers = vercel.headers[0].headers as { key: string; value: string }[];
    const csp = headers.find((h) => h.key === "Content-Security-Policy");
    expect(csp).toBeTruthy();
    expect(csp!.value).toContain("default-src 'self'");
    expect(csp!.value).toContain("https://api.deepseek.com");
  });
});
```

> 需要 `vitest.config.ts` 的 `test` 默认允许 import json（Vite 原生支持）。若 TS 报 json import，给该测试加 `// @ts-expect-error json import` 或在 tsconfig 开 `resolveJsonModule`（仅影响测试，不影响应用构建）。本测试 include 在 `src/**` 之外，需把根级 `*.test.ts` 加入 `vitest.config.ts` 的 `include`：`"*.test.ts"`。

- [ ] **Step 2: 运行确认失败** — `npm run test -- vercel` — Expected: FAIL。

- [ ] **Step 3: 在 `vercel.json` 的 headers 数组追加 CSP**（与现有安全头并列）

```json
{ "key": "Content-Security-Policy", "value": "default-src 'self'; connect-src 'self' https://*.supabase.co https://api.deepseek.com https://*.openai.com; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; font-src 'self' data:; base-uri 'self'; frame-ancestors 'none'; object-src 'none'" }
```

- [ ] **Step 4: 运行确认通过 + 本地实测** — `npm run test -- vercel`（PASS）；`npm run build && npm run preview`，手动确认应用加载、流式、Supabase 调用不被 CSP 拦截（浏览器 console 无 CSP 违规）。若有违规，按违规域名微调 `connect-src`/`style-src`。
- [ ] **Step 5: 提交** — `git commit -m "feat(security): add Content-Security-Policy header"`

---

# 阶段 8 — 组件/Hook 测试 + E2E

### Task 20: MessageBubble 组件测试

**Files:** Create `src/features/roleplay/components/chat/MessageBubble.test.tsx`

- [ ] **Step 1: 先读组件确定 props 与渲染文本** — 阅读 `MessageBubble.tsx`，确认其 props（role/content 等）与可断言的可见文本/role。
- [ ] **Step 2: 写测试**（按真实 props 调整；示例骨架）

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MessageBubble } from "./MessageBubble";

describe("MessageBubble", () => {
  it("renders assistant message content", () => {
    // 按 MessageBubble 真实 props 填充必填字段
    render(<MessageBubble {...({ message: { role: "assistant", content: "你好呀" } } as never)} />);
    expect(screen.getByText("你好呀")).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: 运行调整至通过** — `npm run test -- MessageBubble` — Expected: PASS（按真实 props/DOM 修正断言）。
- [ ] **Step 4: 提交** — `git commit -m "test: add MessageBubble component test"`

---

### Task 21: useChatSession 纯助手导出 + 单测

**Files:** Modify `src/features/roleplay/hooks/useChatSession.ts`（导出纯助手）; Create `src/features/roleplay/hooks/useChatSession.helpers.test.ts`

- [ ] **Step 1: 导出已存在的纯函数** — 将 `shiftIndexedSet`、`removeIndexedSet`、`truncateIndexedSet`、`parseMemorySuggestionDrafts`、`stripJsonCodeFence` 由模块私有改为 `export`（不改逻辑）。
- [ ] **Step 2: 写测试**

```ts
import { describe, it, expect } from "vitest";
import {
  shiftIndexedSet, removeIndexedSet, truncateIndexedSet, parseMemorySuggestionDrafts,
} from "./useChatSession";

describe("indexed set helpers", () => {
  it("shifts indices by inserted count", () => {
    expect([...shiftIndexedSet(new Set([0, 2]), 2)]).toEqual([2, 4]);
  });
  it("removes an index and renumbers higher ones", () => {
    expect([...removeIndexedSet(new Set([0, 1, 3]), 1)]).toEqual([0, 2]);
  });
  it("truncates to max exclusive", () => {
    expect([...truncateIndexedSet(new Set([0, 1, 5]), 2)]).toEqual([0, 1]);
  });
});

describe("parseMemorySuggestionDrafts", () => {
  it("parses a JSON array, stripping code fences", () => {
    const raw = "```json\n[{\"title\":\"A\",\"content\":\"内容\",\"salience\":0.5}]\n```";
    const drafts = parseMemorySuggestionDrafts(raw, "msg-1");
    expect(drafts[0].title).toBe("A");
    expect(drafts[0].sourceMessageId).toBe("msg-1");
  });
  it("throws on content without usable memories", () => {
    expect(() => parseMemorySuggestionDrafts("不是json", null)).toThrow();
  });
});
```

- [ ] **Step 3: 运行 + 类型检查** — `npm run test -- useChatSession.helpers && npm run typecheck` — Expected: PASS。
- [ ] **Step 4: 提交** — `git commit -m "test: cover useChatSession pure helpers"`

---

### Task 22: E2E 冒烟（本地/访客模式）

**Files:** Create `e2e/smoke.spec.ts`

- [ ] **Step 1: 先跑应用确认访客流程选择器** — `npm run dev`，手动走一遍「首页 → 创作工坊建角色 → 聊天房间建会话 → mock 发消息」，用浏览器/Playwright Inspector 记录稳定选择器（优先 `getByRole`/`getByText` 配合页面真实中文文案，如导航「创作工坊」「聊天房间」、发送按钮文案）。
- [ ] **Step 2: 写 spec**（用确认到的选择器替换占位文案）

```ts
import { test, expect } from "@playwright/test";

test("guest can create a character and get a mock reply", async ({ page }) => {
  await page.goto("/");
  // 进入创作工坊（按真实导航文案/路由）
  await page.goto("/studio");
  await expect(page).toHaveURL(/\/studio/);
  // …按 Step 1 记录的选择器：新建角色 → 填名称 → 保存
  // 进入聊天房间，创建会话，选择角色
  await page.goto("/roleplay");
  // …发送一条消息（mock provider 无需真实 Key）
  // 断言出现助手回复气泡
  // await expect(page.getByText(/.+/)).toBeVisible();
});
```

> 这是计划中唯一需要在运行态确认选择器的任务。Step 1 必须先做；Step 2 的注释处替换为真实交互。验收以「访客模式发出消息并看到 mock 回复气泡」为准。

- [ ] **Step 3: 运行** — `npm run test:e2e` — Expected: 1 passed。
- [ ] **Step 4: 提交** — `git commit -m "test(e2e): guest create-character + mock reply smoke"`

---

# 阶段 9 — CI 接线

### Task 23: GitHub Actions CI

**Files:** Create `.github/workflows/ci.yml`

- [ ] **Step 1: 写工作流**

```yaml
name: CI
on:
  push:
    branches: [main, "chore/**", "feat/**", "fix/**"]
  pull_request:
jobs:
  quality:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - run: npm run typecheck
      - run: npm run lint
      - run: npm run test:coverage
      - run: npm run build
  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - run: npx playwright install --with-deps chromium
      - run: npm run test:e2e
```

- [ ] **Step 2: 本地预演各命令** — 依次跑 `npm run typecheck && npm run lint && npm run test:coverage && npm run build`，全绿。
- [ ] **Step 3: 提交并推送分支** — `git add .github/workflows/ci.yml && git commit -m "ci: add typecheck/lint/test/build + e2e workflow"`，然后 `git push -u origin chore/engineering-foundation`，在 GitHub 上确认 CI 通过。
- [ ] **Step 4: 收口** — CI 全绿后，按 `superpowers:finishing-a-development-branch` 决定合并/PR 方式。

---

## 自查（Self-Review）

**Spec 覆盖核对：**
- 测试体系（单元/组件/E2E）→ Task 1,4,5–10,20,21,22 ✓
- 质量门禁（ESLint/Prettier/CI/Node pin）→ Task 2,3,23 ✓
- ErrorBoundary → Task 11,12 ✓；logger → Task 13,14 ✓
- 安全（CSP / 密钥派生）→ Task 19,18 ✓
- 三个小修复（伪流式 / dexie / workbox）→ Task 15,16,17 ✓

**类型/命名一致性：** `logger`（13）被 ErrorBoundary（11）/Task14 复用；`createStreamQueue`（15）被 providerGateway（16）复用；crypto 往返测试（10）与加固（18）同文件演进——一致。

**执行顺序注意：** Task 13（logger）须在 Task 11（ErrorBoundary）之前执行（已在 13 标注）。其余按编号顺序。

**无占位符：** 除 Task 22（E2E 选择器须运行态确认，已显式说明）外，各步均含可执行代码/命令。
