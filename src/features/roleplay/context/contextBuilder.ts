import type { CharacterRow, MemoryRow, PromptTemplateRow, WorldbookEntryRow } from "../types/database";
import type { ChatMessage } from "../providers/provider.types";
import { buildCharacterSystemPrompt } from "../utils/characterPrompt";
import { buildBudget, estimateTokens, type BudgetAllocation } from "./tokenBudget";
import { triggerWorldbookEntries, type TriggerResult } from "./worldbookTrigger";

export interface ContextBuildInput {
  character: CharacterRow | null;
  template: PromptTemplateRow | null;
  worldbookEntries: WorldbookEntryRow[];
  memories: MemoryRow[];
  sessionSummary: string | null;
  userMessage: string;
  recentMessages: ChatMessage[];
  activeSessionId: string | null;
  /** Previous round's cache diagnostics for change detection */
  previousCacheDiag?: CacheDiagnostics | null;
}

export interface ContextBuildOutput {
  systemPrompt: string;
  providerMessages: ChatMessage[];
  budget: BudgetAllocation;
  triggerResult: TriggerResult;
  debugInfo: DebugInfo;
  estimatedTokens: number;
  sessionSummaryInjected: boolean;
  /** Cache diagnostics — short fingerprint hashes only, never full prompt text */
  cacheDiag: CacheDiagnostics;
}

export interface DebugInfo {
  characterName: string | null;
  templateTitle: string | null;
  worldbookHits: number;
  worldbookSkipped: number;
  memoryHits: number;
  memorySkipped: number;
  summaryInjected: boolean;
  buildTimeMs: number;
}

export type PrefixChangeReason =
  | "system_rules_changed"
  | "character_changed"
  | "templates_changed"
  | "persistent_worldbooks_changed"
  | "core_memories_changed"
  | "summary_changed"
  | "no_previous_snapshot"
  | "unchanged";

export interface StablePrefixSnapshot {
  text: string;
  hash: string;
  tokenEstimate: number;
  moduleHashes: {
    systemRules?: string;
    character?: string;
    templates?: string;
    persistentWorldbooks?: string;
    coreMemories?: string;
    summary?: string;
  };
  moduleTokens: {
    systemRules?: number;
    character?: number;
    templates?: number;
    persistentWorldbooks?: number;
    coreMemories?: number;
    summary?: number;
  };
}

export interface CacheDiagnostics {
  /** Stable prefix snapshot with per-module breakdown */
  snapshot: StablePrefixSnapshot | null;
  /** First 8 hex chars of the dynamic context hash */
  dynamicContextHash: string | null;
  /** Estimated % of input tokens that are cacheable */
  estimatedCacheableRatio: number | null;
  /** Token count of the stable prefix */
  stablePrefixTokens: number;
  /** Token count of the dynamic context (WB, memories, messages) */
  dynamicContextTokens: number;
  /** Token count of recent messages */
  recentMessagesTokens: number;
  /** Token count of world book entries injected */
  worldbookTokens: number;
  /** Token count of memories injected */
  memoryTokens: number;
  /** Token count of summary */
  summaryTokens: number;
  /** Whether the stable prefix changed compared to previous round */
  prefixChanged: boolean;
  /** Reasons for prefix change (empty if unchanged) */
  prefixChangeReasons: PrefixChangeReason[];
  /** Previous round's stable prefix hash (if available) */
  previousStablePrefixHash?: string;
}

/* ── Deterministic helpers ── */

const SECTION_HEADERS = {
  systemRules: "## 固定系统规则",
  character: "## 角色设定",
  template: "## 固定提示词模板",
  coreWorldbook: "## 常驻世界书",
  coreMemories: "## 核心记忆",
  summary: "## 会话摘要",
  dynamicWorldbook: "## 本轮相关设定",
  dynamicMemories: "## 本轮相关记忆",
  recentMessages: "## 最近对话",
} as const;

/**
 * Simple non-cryptographic hash (djb2) for fingerprinting.
 * Returns hex string — only first 8 chars shown to users.
 */
function stableHash(text: string): string {
  let hash = 5381;
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) + hash + text.charCodeAt(i)) | 0;
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/** Deterministic serializer: title, then content, with fixed newlines */
function serializeSection(title: string, content: string): string {
  if (!content.trim()) return "";
  return `${title}\n${content.trim()}`;
}

/** Sort world book entries deterministically: priority desc, then title asc, then id asc */
function sortEntriesForContext(entries: WorldbookEntryRow[]): WorldbookEntryRow[] {
  return [...entries].sort((a, b) => {
    const prio = (b.priority ?? 0) - (a.priority ?? 0);
    if (prio !== 0) return prio;
    const titleCmp = (a.title ?? "").localeCompare(b.title ?? "", "zh-CN");
    if (titleCmp !== 0) return titleCmp;
    return (a.id ?? "").localeCompare(b.id ?? "");
  });
}

/** Sort memories deterministically: salience desc, then created_at asc, then id asc */
function sortMemoriesForContext(memories: { id: string; title: string; content: string; salience: number; created_at?: string }[]): typeof memories {
  return [...memories].sort((a, b) => {
    const sal = (b.salience ?? 0) - (a.salience ?? 0);
    if (sal !== 0) return sal;
    const dateCmp = (a.created_at ?? "").localeCompare(b.created_at ?? "");
    if (dateCmp !== 0) return dateCmp;
    return (a.id ?? "").localeCompare(b.id ?? "");
  });
}

/** Serialize world book entries list deterministically */
function serializeWorldbook(entries: { title: string; content: string }[]): string {
  if (entries.length === 0) return "";
  return entries
    .map((e) => `【${e.title}】\n${e.content}`)
    .join("\n\n");
}

/** Serialize memory entries list deterministically */
function serializeMemories(entries: { title: string; content: string }[]): string {
  if (entries.length === 0) return "";
  return entries
    .map((m) => `【${m.title}】\n${m.content}`)
    .join("\n\n");
}

function nowMs(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

/* ── Main builder ── */

export function buildContext(input: ContextBuildInput): ContextBuildOutput {
  const start = nowMs();
  const {
    character,
    template,
    worldbookEntries,
    memories,
    sessionSummary,
    userMessage,
    recentMessages,
    activeSessionId,
  } = input;

  // ── A. Fixed system rules ──
  const systemRules = [
    "你是 Roleplay Tavern 中的 AI 角色扮演助手。",
    "你必须始终保持角色设定回复，不要自称 AI、模型或服务商，也不要跳出角色。",
    "回复应自然、符合角色性格和说话风格，不要添加额外说明或分析。",
  ].join("\n");

  // ── B. Character + Template prompt (deterministic) ──
  const characterPrompt = character ? buildCharacterSystemPrompt(character, template?.content) : "";
  const templateOnly = template?.content ?? "";

  // ── C-F: Split world book into always_on vs dynamic ──
  const enabledEntries = worldbookEntries.filter((entry) => entry.enabled);
  const alwaysOnEntries = sortEntriesForContext(
    // "always_on" entries: high priority, pinned/always_on flag, or ST constant.
    enabledEntries.filter((e) => {
      const flags = e as unknown as Record<string, unknown>;
      const ext = (e.extensions ?? {}) as Record<string, unknown>;
      return (e.priority ?? 0) >= 8 || flags.always_on === true || flags.pinned === true || ext.constant === true;
    }),
  );
  const dynamicEntries = sortEntriesForContext(
    enabledEntries.filter((e) => !alwaysOnEntries.includes(e)),
  );

  // ── Split memories into core vs dynamic ──
  const activeMemories = memories.filter((memory) => memory.status === "active");
  const coreMemories = sortMemoriesForContext(
    activeMemories
      .filter((m) => (m.salience ?? 0) >= 7)
      .map((m) => ({ id: m.id, title: m.title || "未命名记忆", content: m.content, salience: m.salience, created_at: m.created_at })),
  );
  const dynamicMemories = sortMemoriesForContext(
    activeMemories
      .filter((m) => !coreMemories.some((c) => c.id === m.id))
      .map((m) => ({ id: m.id, title: m.title || "未命名记忆", content: m.content, salience: m.salience, created_at: m.created_at })),
  );

  // ── Summary ──
  const summary = sessionSummary?.trim() ?? "";

  // ── Recent texts for world book triggering ──
  const recentTexts = recentMessages.map((message) => message.content);

  // ── Token budget (world book + memory allocation) ──
  const wbForBudget = [
    ...alwaysOnEntries.map((e) => ({ id: e.id, title: e.title, content: e.content, priority: e.priority, layer: "core" as const })),
    ...dynamicEntries.map((e) => ({ id: e.id, title: e.title, content: e.content, priority: e.priority, layer: "dynamic" as const })),
  ];
  const memForBudget = [
    ...coreMemories.map((m) => ({ id: m.id, title: m.title, content: m.content, salience: m.salience, layer: "core" as const })),
    ...dynamicMemories.map((m) => ({ id: m.id, title: m.title, content: m.content, salience: m.salience, layer: "dynamic" as const })),
  ];

  const budget = buildBudget(
    characterPrompt,
    templateOnly,
    wbForBudget,
    memForBudget,
    summary,
    recentTexts,
  );

  // ── World book trigger (keyword matching on user message + recent texts) ──
  const budgetedIds = new Set(budget.worldbookEntries.map((entry) => entry.id));
  const triggerResult = triggerWorldbookEntries(
    enabledEntries,
    userMessage,
    recentTexts,
    character?.name ?? null,
    activeSessionId,
    budgetedIds,
  );

  const injectedWorldbookEntries = triggerResult.triggered.filter((hit) => hit.injected);

  // Separate injected entries into core vs dynamic
  const injectedCoreWb = injectedWorldbookEntries.filter((hit) => alwaysOnEntries.some((e) => e.id === hit.entry.id));
  const injectedDynamicWb = injectedWorldbookEntries.filter((hit) => !injectedCoreWb.includes(hit));

  // Separate budget memories into core vs dynamic
  const budgetCoreMems = budget.memories.filter((m) => (m as { layer?: string }).layer === "core");
  const budgetDynamicMems = budget.memories.filter((m) => (m as { layer?: string }).layer !== "core");

  // ── Build system prompt in CACHE-FRIENDLY ORDER ──
  // A-F: Stable prefix (changes rarely)
  // G-J: Dynamic content (changes every round)

  // Build each stable module individually for per-module hashing
  const moduleTexts: { key: string; text: string }[] = [];

  // A. Fixed system rules
  const rulesText = serializeSection(SECTION_HEADERS.systemRules, systemRules);
  moduleTexts.push({ key: "systemRules", text: rulesText });

  // B. Character setting
  const charText = characterPrompt ? serializeSection(SECTION_HEADERS.character, characterPrompt) : "";
  if (charText) moduleTexts.push({ key: "character", text: charText });

  // C. Fixed template (only if not already included in character prompt)
  const tplText = (templateOnly && !characterPrompt.includes(templateOnly))
    ? serializeSection(SECTION_HEADERS.template, templateOnly) : "";
  if (tplText) moduleTexts.push({ key: "templates", text: tplText });

  // D. Core world book (always-on entries)
  const coreWbText = injectedCoreWb.length > 0
    ? serializeSection(SECTION_HEADERS.coreWorldbook, serializeWorldbook(injectedCoreWb.map((h) => ({ title: h.entry.title, content: h.entry.content }))))
    : "";
  if (coreWbText) moduleTexts.push({ key: "persistentWorldbooks", text: coreWbText });

  // E. Core memories
  const coreMemText = budgetCoreMems.length > 0
    ? serializeSection(SECTION_HEADERS.coreMemories, serializeMemories(budgetCoreMems.map((m) => ({ title: m.title, content: m.content }))))
    : "";
  if (coreMemText) moduleTexts.push({ key: "coreMemories", text: coreMemText });

  // F. Summary (medium stability — changes only on manual update)
  const summaryText = summary ? serializeSection(SECTION_HEADERS.summary, summary) : "";
  if (summaryText) moduleTexts.push({ key: "summary", text: summaryText });

  const stablePrefix = moduleTexts.map((m) => m.text).filter(Boolean).join("\n\n");

  // Build StablePrefixSnapshot
  const moduleHashes: StablePrefixSnapshot["moduleHashes"] = {};
  const moduleTokens: StablePrefixSnapshot["moduleTokens"] = {};
  for (const { key, text } of moduleTexts) {
    if (text) {
      (moduleHashes as Record<string, string>)[key] = stableHash(text).slice(0, 8);
      (moduleTokens as Record<string, number>)[key] = estimateTokens(text);
    }
  }

  const snapshot: StablePrefixSnapshot = {
    text: stablePrefix,
    hash: stablePrefix ? stableHash(stablePrefix) : "",
    tokenEstimate: stablePrefix ? estimateTokens(stablePrefix) : 0,
    moduleHashes,
    moduleTokens,
  };

  // G-J: Dynamic content
  const dynamicParts: string[] = [];

  // G. Dynamic world book
  if (injectedDynamicWb.length > 0) {
    dynamicParts.push(serializeSection(
      SECTION_HEADERS.dynamicWorldbook,
      serializeWorldbook(injectedDynamicWb.map((h) => ({ title: h.entry.title, content: h.entry.content }))),
    ));
  }

  // H. Dynamic memories
  if (budgetDynamicMems.length > 0) {
    dynamicParts.push(serializeSection(
      SECTION_HEADERS.dynamicMemories,
      serializeMemories(budgetDynamicMems.map((m) => ({ title: m.title, content: m.content }))),
    ));
  }

  const dynamicContext = dynamicParts.filter(Boolean).join("\n\n");

  // Combine into final system prompt
  const systemPrompt = [stablePrefix, dynamicContext].filter(Boolean).join("\n\n").trim();

  // ── Build provider messages ──
  const providerMessages: ChatMessage[] = [];
  if (systemPrompt) {
    providerMessages.push({ role: "system", content: systemPrompt });
  }

  const added = new Set<number>();
  for (const text of budget.recentMessages) {
    const index = recentMessages.findIndex((message, i) => !added.has(i) && message.content === text);
    if (index >= 0) {
      providerMessages.push(recentMessages[index]);
      added.add(index);
    }
  }
  if (userMessage) {
    providerMessages.push({ role: "user", content: userMessage });
  }

  // ── Diagnostics ──
  const stablePrefixTokens = estimateTokens(stablePrefix);
  const dynamicContextTokens = estimateTokens(dynamicContext);
  const recentMessagesTokens = estimateTokens(budget.recentMessages.join("\n"));
  const worldbookTokens = estimateTokens(
    [...injectedCoreWb, ...injectedDynamicWb].map((h) => h.entry.content).join("\n"),
  );
  const memoryTokens = estimateTokens(
    [...budgetCoreMems, ...budgetDynamicMems].map((m) => m.content).join("\n"),
  );
  const summaryTokens = estimateTokens(summary);

  const totalPromptTokens = stablePrefixTokens + dynamicContextTokens + recentMessagesTokens;
  const estimatedCacheableRatio = totalPromptTokens > 0
    ? stablePrefixTokens / totalPromptTokens
    : null;

  // ── Prefix change detection ──
  const prevDiag = input.previousCacheDiag ?? null;
  const prevSnapshot = prevDiag?.snapshot ?? null;
  let prefixChanged = false;
  const prefixChangeReasons: PrefixChangeReason[] = [];

  if (!prevSnapshot) {
    prefixChanged = true;
    prefixChangeReasons.push("no_previous_snapshot");
  } else if (snapshot.hash !== prevSnapshot.hash) {
    prefixChanged = true;
    // Detect which module changed
    const keys: (keyof StablePrefixSnapshot["moduleHashes"])[] = [
      "systemRules", "character", "templates", "persistentWorldbooks", "coreMemories", "summary",
    ];
    for (const key of keys) {
      const currHash = snapshot.moduleHashes[key];
      const prevHash = prevSnapshot.moduleHashes[key];
      if (currHash !== prevHash) {
        // Map module key to PrefixChangeReason
        const reasonMap: Record<string, PrefixChangeReason> = {
          systemRules: "system_rules_changed",
          character: "character_changed",
          templates: "templates_changed",
          persistentWorldbooks: "persistent_worldbooks_changed",
          coreMemories: "core_memories_changed",
          summary: "summary_changed",
        };
        prefixChangeReasons.push(reasonMap[key]);
      }
    }
    // If no specific module changed but hash differs, the prefix text itself changed
    if (prefixChangeReasons.length === 0) {
      prefixChangeReasons.push("unchanged");
      prefixChanged = false;
    }
  }

  const cacheDiag: CacheDiagnostics = {
    snapshot,
    dynamicContextHash: dynamicContext ? stableHash(dynamicContext).slice(0, 8) : null,
    estimatedCacheableRatio,
    stablePrefixTokens,
    dynamicContextTokens,
    recentMessagesTokens,
    worldbookTokens,
    memoryTokens,
    summaryTokens,
    prefixChanged,
    prefixChangeReasons,
    previousStablePrefixHash: prevSnapshot?.hash?.slice(0, 8) ?? undefined,
  };

  const debugInfo: DebugInfo = {
    characterName: character?.name ?? null,
    templateTitle: template?.title ?? null,
    worldbookHits: injectedWorldbookEntries.length,
    worldbookSkipped: triggerResult.skipped.length,
    memoryHits: budget.memories.length,
    memorySkipped: Math.max(0, activeMemories.length - budget.memories.length),
    summaryInjected: !!summary,
    buildTimeMs: Math.round(nowMs() - start),
  };

  return {
    systemPrompt,
    providerMessages,
    budget,
    triggerResult,
    debugInfo,
    estimatedTokens: budget.totalEstimated,
    sessionSummaryInjected: !!summary,
    cacheDiag,
  };
}

/** Real-time context window estimate (no API call, local token estimation only) */
export type ContextWindowEstimate = {
  estimatedTokens?: number;
  modelLimit?: number;
  usageRatio?: number;
  status: "normal" | "near_limit" | "should_compress" | "unknown";
  recentMessagesCount?: number;
  oldMessagesCount?: number;
  oldMessagesTokens?: number;
  summaryTokens?: number;
  canCompress: boolean;
  reason?: string;
};

/** Persisted cache diagnostics record from context_runs.components_json */
export type CacheDiagnosticsRecord = {
  usage?: Record<string, unknown>;
  costEstimate?: Record<string, unknown>;
  cacheDiag?: CacheDiagnostics | null;
};

export type CacheHealthLevel = "excellent" | "good" | "warning" | "poor" | "unknown";

export interface CacheHealthSummary {
  sampleSize: number;
  averageHitRate?: number;
  averageCacheMissTokens?: number;
  averageInputTokens?: number;
  averageEstimatedCost?: number;
  stablePrefixChangeCount: number;
  stablePrefixChangeRate?: number;
  mostCommonChangeReasons: Array<{ reason: string; count: number }>;
  healthLevel: CacheHealthLevel;
  suggestions: string[];
}

/**
 * Build cache health summary from the list of persisted diagnostics records.
 * Records should be ordered by time (oldest first for trend, newest last).
 */
export function buildCacheHealthSummary(history: CacheDiagnosticsRecord[]): CacheHealthSummary {
  const records = [...history].filter((r) => r.usage || r.cacheDiag);
  const sampleSize = records.length;

  if (sampleSize < 2) {
    return {
      sampleSize,
      stablePrefixChangeCount: 0,
      mostCommonChangeReasons: [],
      healthLevel: "unknown",
      suggestions: ["发送更多消息后即可查看缓存健康趋势。"],
    };
  }

  // Compute averages from usage data
  let hitRateSum = 0;
  let hitRateCount = 0;
  let cacheMissSum = 0;
  let cacheMissCount = 0;
  let inputSum = 0;
  let inputCount = 0;
  let costSum = 0;
  let costCount = 0;

  for (const r of records) {
    const u = r.usage;
    if (u) {
      const hr = typeof u.cacheHitRate === "number" ? u.cacheHitRate : undefined;
      if (hr !== undefined) { hitRateSum += hr; hitRateCount++; }

      const cm = typeof u.cacheMissInputTokens === "number" ? u.cacheMissInputTokens : undefined;
      if (cm !== undefined) { cacheMissSum += cm; cacheMissCount++; }

      const it = typeof u.inputTokens === "number" ? u.inputTokens : undefined;
      if (it !== undefined) { inputSum += it; inputCount++; }
    }
    const ce = r.costEstimate;
    if (ce && typeof (ce as Record<string, unknown>).totalCost === "number") {
      costSum += (ce as Record<string, unknown>).totalCost as number;
      costCount++;
    }
  }

  // Count prefix changes
  let changeCount = 0;
  const changeReasonFreq: Record<string, number> = {};
  for (let i = 1; i < records.length; i++) {
    const prev = records[i - 1].cacheDiag;
    const curr = records[i].cacheDiag;
    if (prev?.snapshot?.hash && curr?.snapshot?.hash && prev.snapshot.hash !== curr.snapshot.hash) {
      changeCount++;
      if (curr.prefixChangeReasons) {
        for (const reason of curr.prefixChangeReasons) {
          if (reason !== "no_previous_snapshot" && reason !== "unchanged") {
            changeReasonFreq[reason] = (changeReasonFreq[reason] ?? 0) + 1;
          }
        }
      }
    }
  }

  const mostCommonChangeReasons = Object.entries(changeReasonFreq)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3)
    .map(([reason, count]) => ({ reason, count }));

  const averageHitRate = hitRateCount > 0 ? hitRateSum / hitRateCount : undefined;
  const averageCacheMissTokens = cacheMissCount > 0 ? Math.round(cacheMissSum / cacheMissCount) : undefined;
  const averageInputTokens = inputCount > 0 ? Math.round(inputSum / inputCount) : undefined;
  const averageEstimatedCost = costCount > 0 ? costSum / costCount : undefined;
  const stablePrefixChangeRate = records.length > 1 ? changeCount / (records.length - 1) : undefined;

  // Determine health level
  let healthLevel: CacheHealthLevel = "unknown";
  if (averageHitRate !== undefined) {
    if (averageHitRate >= 0.8 && (stablePrefixChangeRate ?? 1) <= 0.1) healthLevel = "excellent";
    else if (averageHitRate >= 0.6 && (stablePrefixChangeRate ?? 1) <= 0.25) healthLevel = "good";
    else if (averageHitRate >= 0.35 || (stablePrefixChangeRate ?? 1) <= 0.5) healthLevel = "warning";
    else healthLevel = "poor";
  }

  // Generate suggestions
  const suggestions: string[] = [];
  if (changeCount > 0 && changeCount / records.length > 0.3) {
    suggestions.push("前缀频繁变化：检查是否在对话中修改了角色、模板、世界书或摘要。");
  }
  const dynTokens = records.reduce((sum, r) => sum + (r.cacheDiag?.dynamicContextTokens ?? 0), 0) / records.length;
  const stableTokens = records.reduce((sum, r) => sum + (r.cacheDiag?.stablePrefixTokens ?? 0), 0) / records.length;
  if (stableTokens > 0 && dynTokens / stableTokens > 0.5) {
    suggestions.push("动态上下文占比较高：可减少本轮世界书/记忆召回数量。");
  }
  if (averageHitRate !== undefined && averageHitRate < 0.5) {
    suggestions.push("缓存命中率偏低：建议保持同一会话连续对话，避免频繁修改角色设定。");
  }
  if (averageEstimatedCost !== undefined && averageEstimatedCost > 0.01) {
    suggestions.push("平均费用偏高：提高缓存命中率可显著降低 DeepSeek 输入成本。");
  }
  if (suggestions.length === 0) {
    suggestions.push("缓存健康度良好，继续保持当前使用习惯。");
  }

  return {
    sampleSize,
    averageHitRate,
    averageCacheMissTokens,
    averageInputTokens,
    averageEstimatedCost,
    stablePrefixChangeCount: changeCount,
    stablePrefixChangeRate,
    mostCommonChangeReasons,
    healthLevel,
    suggestions: suggestions.slice(0, 3),
  };
}

export function collectActiveEntries(entries: WorldbookEntryRow[]): WorldbookEntryRow[] {
  return entries.filter((entry) => entry.enabled);
}
