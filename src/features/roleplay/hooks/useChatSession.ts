import { logger } from "../../../shared/lib/logger";
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../../auth/supabaseClient";
import type {
  ApiKeyStorageMode,
  ChatMessage,
  ModelProviderConfig,
  ProviderBalanceSnapshot,
  ProviderCostEstimate,
  ProviderType,
  ProviderUsage,
} from "../providers/provider.types";
import { DEFAULT_PROVIDER_CONFIG } from "../providers/provider.types";
import { buildConfigFromStorage, sendProviderStreamRequest } from "../providers/providerGateway";
import { loadApiKey } from "../storage/apiKeyStorage";
import * as Repo from "../repositories/roleplayRepository";
import * as LocalRepo from "../repositories/localRoleplayRepository";
import * as LocalMirror from "../repositories/localMirror";
import type { CharacterRow, ContextRunRow, MemoryRow, MessageRevisionRow, PromptTemplateRow, SessionRow } from "../types/database";
import { buildCharacterSystemPrompt, buildSessionMeta, parseSessionMeta, SESSION_META_VERSION, getBoundWorldbookId, type SessionMeta } from "../utils/characterPrompt";
import { buildContext, type CacheDiagnostics, type CacheDiagnosticsRecord, type ContextBuildOutput } from "../context/contextBuilder";
import { getPresetName } from "../providers/providerPresets";
import { estimateDeepSeekCost } from "../providers/pricing/deepseekPricing";
import { fetchHostedProviderBalance } from "../services/hostedCredentialsService";

export interface SessionLike {
  id: string;
  title: string;
  mode: string;
  lastMessageAt: string | null;
  characterId: string | null;
  characterName: string | null;
  characterEmoji: string | null;
}

export interface ChatState {
  sessions: SessionLike[];
  activeSessionId: string | null;
  activeCharacter: CharacterRow | null;
  activeTemplate: PromptTemplateRow | null;
  messages: ChatMessage[];
  isStreaming: boolean;
  isSending: boolean;
  isContextLoading: boolean;
  error: string | null;
  saveStatus: "idle" | "saving" | "saved" | "error";
  provider: ProviderType;
  model: string;
  lastContextOutput: ContextBuildOutput | null;
  contextPreviewError: string | null;
  worldbookIds: string[];
  memoryIds: string[];
  disabledWbIds: string[];
  disabledMemIds: string[];
  summaryEnabled: boolean;
  summaryText: string;
  activeBranchId: string | null;
  activeBranchName: string | null;
  contextRunSaveStatus: "idle" | "saved" | "failed" | null;
  messageDbIds: Map<number, string>;
  messageCreatedAts: Map<number, string>;
  messageRevisions: Map<string, MessageRevisionRow[]>;
  messageRevisionCounts: Map<string, number>;
  editedIndices: Set<number>;
  hasMoreMessages: boolean;
  isLoadingOlderMessages: boolean;
  suggestedMemories: MemoryRow[];
  isGeneratingMemorySuggestions: boolean;
  compressBusy: boolean;
  compressPreview: string | null;
  contextWindowEstimate: import("../context/contextBuilder").ContextWindowEstimate | null;
  latestProviderUsage: ProviderUsage | null;
  latestCostEstimate: ProviderCostEstimate | null;
  cacheDiag: CacheDiagnostics | null;
  cacheDiagHistory: CacheDiagnosticsRecord[];
  providerBalance: ProviderBalanceSnapshot | null;
  isBalanceLoading: boolean;
  balanceError: string | null;
}

export interface ChatActions {
  createSession: (characterId?: string) => Promise<void>;
  selectSession: (id: string) => Promise<void>;
  deleteSession: (id: string) => Promise<void>;
  sendMessage: (text: string) => Promise<void>;
  stopGeneration: () => void;
  regenerateLast: () => Promise<void>;
  editAndResend: (mi: number, nt: string) => Promise<void>;
  deleteMessage: (mi: number) => Promise<void>;
  copyMessage: (mi: number) => void;
  retry: () => Promise<void>;
  addTemplate: (id: string) => Promise<void>;
  removeTemplate: () => Promise<void>;
  addWorldbooks: (ids: string[]) => Promise<void>;
  removeWorldbook: (id: string) => Promise<void>;
  toggleWorldbook: (id: string) => Promise<void>;
  addMemories: (ids: string[]) => Promise<void>;
  removeMemory: (id: string) => Promise<void>;
  toggleMemory: (id: string) => Promise<void>;
  saveSummary: (text: string) => Promise<void>;
  clearSummary: () => Promise<void>;
  generateSummary: () => Promise<string | null>;
  compressContext: () => Promise<string | null>;
  computeContextWindowEstimate: () => void;
  loadMessageRevisions: (messageIndex: number) => Promise<MessageRevisionRow[]>;
  loadOlderMessages: () => Promise<void>;
  generateMemorySuggestions: (source?: { messageIndex?: number }) => Promise<MemorySuggestionDraft[] | null>;
  saveMemorySuggestions: (drafts: MemorySuggestionDraft[], status: "active" | "suggested") => Promise<void>;
  updateSuggestedMemoryStatus: (memoryId: string, status: "active" | "disabled" | "deleted") => Promise<void>;
  refreshProviderBalance: () => Promise<void>;
  isDemo: boolean;
  apiConfigured: boolean;
  providerLabel: string;
  modelLabel: string;
  runtimeMode: string;
  messageCount: number;
  systemPrompt: string | null;
}

export interface MemorySuggestionDraft {
  memory_type: MemoryRow["memory_type"];
  title: string;
  content: string;
  salience: number;
  reason: string;
  sourceMessageId: string | null;
}



function isDeepSeekProvider(provider: ProviderType): boolean {
  return provider === "deepseek";
}

function buildUsageUnavailable(reason: string, provider: ProviderType): ProviderUsage {
  return {
    usageAvailable: false,
    usageUnavailableReason: reason,
    rawUsage: null,
    sourceProvider: provider,
  };
}

function toFriendlyBalanceError(
  error: unknown,
  storageMode: ApiKeyStorageMode,
): string {
  if (error instanceof Error) {
    if (/failed to fetch/i.test(error.message)) {
      return storageMode === "hosted_encrypted"
        ? "无法连接托管余额服务，请确认 hosted-provider-balance 已部署且可访问。"
        : "浏览器无法直接获取 DeepSeek 余额，请检查网络或稍后重试。";
    }
    return error.message;
  }
  return "余额查询失败，请稍后重试。";
}

function toErrorMessage(error: unknown, fallback = "操作失败，请稍后重试。"): string {
  if (error instanceof Error) return error.message || fallback;
  if (typeof error === "string") return error || fallback;
  if (error && typeof error === "object") {
    try {
      const message = JSON.stringify(error);
      return message === "{}" ? fallback : message;
    } catch {
      return fallback;
    }
  }
  return fallback;
}

function readDiagnosticsFromContextRun(contextRun: ContextRunRow | null | undefined): {
  usage: ProviderUsage | null;
  costEstimate: ProviderCostEstimate | null;
  cacheDiag: CacheDiagnostics | null;
} {
  if (!contextRun) return { usage: null, costEstimate: null, cacheDiag: null };

  const componentsArray = Array.isArray(contextRun.components_json) ? contextRun.components_json : [];
  const merged = componentsArray.find((item) => item && typeof item === "object") as Record<string, unknown> | undefined;
  return {
    usage: (merged?.usage ?? null) as ProviderUsage | null,
    costEstimate: (merged?.costEstimate ?? null) as ProviderCostEstimate | null,
    cacheDiag: (merged?.cacheDiag ?? null) as CacheDiagnostics | null,
  };
}

function extractHistory(runs: ContextRunRow[]): CacheDiagnosticsRecord[] {
  return runs.map((run) => {
    const componentsArray = Array.isArray(run.components_json) ? run.components_json : [];
    const merged = componentsArray.find((item) => item && typeof item === "object") as Record<string, unknown> | undefined;
    return {
      usage: (merged?.usage ?? null) as Record<string, unknown> | undefined,
      costEstimate: (merged?.costEstimate ?? null) as Record<string, unknown> | undefined,
      cacheDiag: (merged?.cacheDiag ?? null) as CacheDiagnostics | null,
    };
  });
}

interface BuiltContext {
  output: ContextBuildOutput | null;
  session: SessionRow | null;
  character: CharacterRow | null;
  template: PromptTemplateRow | null;
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timeoutId) clearTimeout(timeoutId);
  });
}

function toChatMessages(rows: Awaited<ReturnType<typeof Repo.listMessages>>): ChatMessage[] {
  return rows.map((row) => ({ role: row.role as ChatMessage["role"], content: row.content_text }));
}

const UI_MESSAGE_PAGE_SIZE = 50;
const CONTEXT_MESSAGE_LIMIT = 40;
const MEMORY_SUGGESTION_MESSAGE_LIMIT = 20;

function truncateIndexedMap<T>(map: Map<number, T>, maxExclusive: number): Map<number, T> {
  const next = new Map<number, T>();
  map.forEach((value, key) => {
    if (key < maxExclusive) next.set(key, value);
  });
  return next;
}

function removeIndexedMapEntry<T>(map: Map<number, T>, removedIndex: number): Map<number, T> {
  const next = new Map<number, T>();
  map.forEach((value, key) => {
    if (key < removedIndex) next.set(key, value);
    else if (key > removedIndex) next.set(key - 1, value);
  });
  return next;
}

function prependIndexedMapEntries<T>(map: Map<number, T>, insertedCount: number): Map<number, T> {
  const next = new Map<number, T>();
  map.forEach((value, key) => {
    next.set(key + insertedCount, value);
  });
  return next;
}

function buildIndexedMessageMetadata(
  rows: Awaited<ReturnType<typeof Repo.listMessages>>,
  revisionCounts?: Map<string, number>,
): {
  messageDbIds: Map<number, string>;
  messageCreatedAts: Map<number, string>;
  editedIndices: Set<number>;
} {
  const messageDbIds = new Map<number, string>();
  const messageCreatedAts = new Map<number, string>();
  const editedIndices = new Set<number>();
  rows.forEach((row, index) => {
    messageDbIds.set(index, row.id);
    messageCreatedAts.set(index, row.created_at);
    if ((row.revision_no ?? 1) > 1 || (revisionCounts?.get(row.id) ?? 0) > 0) {
      editedIndices.add(index);
    }
  });
  return {
    messageDbIds,
    messageCreatedAts,
    editedIndices,
  };
}

const MEMORY_TYPE_OPTIONS: MemoryRow["memory_type"][] = [
  "short_term",
  "long_term",
  "summary",
  "event",
  "relationship",
  "user_preference",
  "character_preference",
];

function normalizeMemoryType(value: unknown): MemoryRow["memory_type"] {
  if (typeof value !== "string") return "event";
  return MEMORY_TYPE_OPTIONS.includes(value as MemoryRow["memory_type"])
    ? (value as MemoryRow["memory_type"])
    : "event";
}

function clampSalience(value: unknown): number {
  const numeric = typeof value === "number" ? value : Number.parseInt(String(value ?? "50"), 10);
  if (Number.isNaN(numeric)) return 50;
  return Math.min(100, Math.max(0, numeric));
}

function stripJsonCodeFence(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed.startsWith("```")) return trimmed;
  return trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
}

export function parseMemorySuggestionDrafts(raw: string, sourceMessageId?: string | null): MemorySuggestionDraft[] {
  const normalized = stripJsonCodeFence(raw);
  let parsed: unknown;
  try {
    parsed = JSON.parse(normalized);
  } catch {
    const match = normalized.match(/\[[\s\S]*\]|\{[\s\S]*\}/);
    if (!match) {
      throw new Error("模型返回的内容不是有效 JSON。");
    }
    parsed = JSON.parse(match[0]);
  }

  const list = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === "object" && Array.isArray((parsed as { memories?: unknown[] }).memories)
      ? (parsed as { memories: unknown[] }).memories
      : [parsed];

  const drafts: MemorySuggestionDraft[] = [];
  list.forEach((item) => {
    if (!item || typeof item !== "object") return;
    const record = item as Record<string, unknown>;
    const title = String(record.title ?? "").trim() || "未命名记忆";
    const content = String(record.content ?? "").trim();
    if (!content) return;
    drafts.push({
      memory_type: normalizeMemoryType(record.memory_type),
      title,
      content,
      salience: clampSalience(record.salience),
      reason: String(record.reason ?? "").trim(),
      sourceMessageId: sourceMessageId ?? null,
    });
  });

  if (drafts.length === 0) {
    throw new Error("模型没有返回可用的记忆建议。");
  }
  return drafts;
}

export function shiftIndexedSet(set: Set<number>, insertedCount: number): Set<number> {
  const next = new Set<number>();
  set.forEach((value) => next.add(value + insertedCount));
  return next;
}

export function removeIndexedSet(set: Set<number>, removedIndex: number): Set<number> {
  const next = new Set<number>();
  set.forEach((value) => {
    if (value < removedIndex) next.add(value);
    else if (value > removedIndex) next.add(value - 1);
  });
  return next;
}

export function truncateIndexedSet(set: Set<number>, maxExclusive: number): Set<number> {
  const next = new Set<number>();
  set.forEach((value) => {
    if (value < maxExclusive) next.add(value);
  });
  return next;
}

export function useChatSession(
  isGuestOrDemo: boolean,
  userId: string | undefined,
  storedProvider: ProviderType,
  storedModel: string,
  storageMode: ApiKeyStorageMode,
  hostedCredentialId?: string | null,
  hostedBaseURL?: string | null,
): ChatState & ChatActions {
  const [state, setState] = useState<ChatState>({
    sessions: [],
    activeSessionId: null,
    activeCharacter: null,
    activeTemplate: null,
    messages: [],
    isStreaming: false,
    isSending: false,
    isContextLoading: false,
    error: null,
    saveStatus: "idle",
    provider: storedProvider,
    model: storedModel || DEFAULT_PROVIDER_CONFIG.model,
    lastContextOutput: null,
    contextPreviewError: null,
    worldbookIds: [],
    memoryIds: [],
    disabledWbIds: [],
    disabledMemIds: [],
    summaryEnabled: false,
    summaryText: "",
    activeBranchId: null,
    activeBranchName: null,
    contextRunSaveStatus: null,
    messageDbIds: new Map(),
    messageCreatedAts: new Map(),
    messageRevisions: new Map(),
    messageRevisionCounts: new Map(),
    editedIndices: new Set(),
    hasMoreMessages: false,
    isLoadingOlderMessages: false,
    suggestedMemories: [],
    isGeneratingMemorySuggestions: false,
    compressBusy: false,
    compressPreview: null,
    contextWindowEstimate: null,
    latestProviderUsage: null,
    latestCostEstimate: null,
    cacheDiag: null,
    cacheDiagHistory: [],
    providerBalance: null,
    isBalanceLoading: false,
    balanceError: null,
  });

  const abortRef = useRef<AbortController | null>(null);
  const previewSeqRef = useRef(0);
  const loadedSessionRef = useRef<string | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  // Lightweight in-memory cache for cacheDiagHistory per session
  const historyCacheRef = useRef(new Map<string, { history: CacheDiagnosticsRecord[]; loadedAt: number }>());
  const HISTORY_CACHE_TTL = 60_000; // 60 seconds
  const HISTORY_CACHE_MAX = 10;

  const isLocalMode = isGuestOrDemo || !supabase || !userId;

  const getApiKey = useCallback((): string | null => {
    if (storageMode === "hosted_encrypted") return null;
    return loadApiKey(storedProvider, storageMode)?.apiKey ?? null;
  }, [storedProvider, storageMode]);

  const apiConfigured = storageMode === "hosted_encrypted"
    ? !isLocalMode && !!hostedCredentialId
    : getApiKey() !== null;
  const isDemo = isLocalMode && !apiConfigured;

  const buildConfig = useCallback((): ModelProviderConfig => {
    return buildConfigFromStorage(
      isDemo ? "mock" : storedProvider,
      getApiKey() || "",
      storageMode,
      stateRef.current.model,
      hostedBaseURL || undefined,
      hostedCredentialId ?? null,
    );
  }, [getApiKey, hostedBaseURL, hostedCredentialId, isDemo, storageMode, storedProvider]);

  const refreshProviderBalance = useCallback(async () => {
    if (!isDeepSeekProvider(storedProvider)) {
      setState((s) => ({
        ...s,
        providerBalance: null,
        isBalanceLoading: false,
        balanceError: "当前阶段仅支持 DeepSeek 余额查询。",
      }));
      return;
    }

    setState((s) => ({ ...s, isBalanceLoading: true, balanceError: null }));
    try {
      let snapshot: ProviderBalanceSnapshot;
      if (storageMode === "hosted_encrypted") {
        if (!hostedCredentialId) throw new Error("请先在设置中心选择托管 API 凭据。");
        snapshot = await fetchHostedProviderBalance(hostedCredentialId);
      } else {
        const apiKey = getApiKey();
        if (!apiKey) throw new Error("请先配置 DeepSeek API Key。");
        const response = await fetch("https://api.deepseek.com/user/balance", {
          method: "GET",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            Accept: "application/json",
          },
        });
        if (!response.ok) {
          const detail = response.status === 401
            ? "DeepSeek API Key 无效或已失效。"
            : response.status === 429
              ? "DeepSeek 余额查询过于频繁，请稍后再试。"
              : response.status >= 500
                ? "DeepSeek 服务暂时不可用，请稍后重试。"
                : "DeepSeek 余额查询失败，请检查当前配置。";
          throw new Error(detail);
        }
        const payload = await response.json().catch(() => ({}));
        snapshot = {
          provider: "deepseek",
          isAvailable: Boolean((payload as { is_available?: unknown }).is_available),
          balances: Array.isArray((payload as { balance_infos?: unknown[] }).balance_infos)
            ? ((payload as { balance_infos: Array<Record<string, unknown>> }).balance_infos).map((item) => ({
                currency: String(item.currency ?? "USD"),
                totalBalance: String(item.total_balance ?? "0"),
                grantedBalance: String(item.granted_balance ?? "0"),
                toppedUpBalance: String(item.topped_up_balance ?? "0"),
              }))
            : [],
          fetchedAt: new Date().toISOString(),
        };
      }

      setState((s) => ({
        ...s,
        providerBalance: snapshot,
        isBalanceLoading: false,
        balanceError: null,
      }));
    } catch (error) {
      setState((s) => ({
        ...s,
        isBalanceLoading: false,
        balanceError: toFriendlyBalanceError(error, storageMode),
      }));
    }
  }, [getApiKey, hostedCredentialId, storageMode, storedProvider]);

  useEffect(() => {
    setState((current) => {
      const nextModel = storedModel || DEFAULT_PROVIDER_CONFIG.model;
      if (current.provider === storedProvider && current.model === nextModel) return current;
      return {
        ...current,
        provider: storedProvider,
        model: nextModel,
      };
    });
  }, [storedModel, storedProvider]);

  const syncMeta = useCallback(async (updates: Partial<SessionMeta>) => {
    if (!stateRef.current.activeSessionId) return;
    const s = stateRef.current;
    const activeSessionId = s.activeSessionId;
    if (!activeSessionId) return;
    const merged: SessionMeta = {
      _meta_version: SESSION_META_VERSION,
      _template_id: s.activeTemplate?.id,
      _worldbook_ids: s.worldbookIds,
      _memory_ids: s.memoryIds,
      _disabled_worldbook_ids: s.disabledWbIds,
      _disabled_memory_ids: s.disabledMemIds,
      _summary_enabled: s.summaryEnabled,
      ...updates,
    };
    if (isLocalMode) {
      await LocalRepo.updateSession(activeSessionId, { system_prompt: JSON.stringify(merged) }).catch(() => {});
      return;
    }
    const updated = await Repo.updateSession(supabase!, activeSessionId, userId!, { system_prompt: JSON.stringify(merged) }).catch(() => null);
    if (updated) LocalMirror.mirrorSession(updated);
  }, [isLocalMode, userId]);

  const refreshSuggestedMemories = useCallback(async (sessionId?: string | null) => {
    try {
      const rows = isLocalMode
        ? await LocalRepo.listMemoriesByStatus(["suggested"], sessionId ?? undefined)
        : await Repo.listMemoriesByStatus(supabase!, userId!, ["suggested"], sessionId ?? undefined);
      setState((s) => ({ ...s, suggestedMemories: rows }));
    } catch (error) {
      logger.warn("[Chat] suggested memories load failed:", error);
    }
  }, [isLocalMode, userId]);

  const loadSessions = useCallback(async () => {
    const rows = isLocalMode ? await LocalRepo.listSessions() : await Repo.listSessions(supabase!, userId!);
    const sessionIds = rows.map((row) => row.id);
    const participants = isLocalMode
      ? await LocalRepo.listSessionParticipantsForSessions(sessionIds)
      : await Repo.listSessionParticipantsForSessions(supabase!, sessionIds);
    const characterIds = unique(participants.filter((p) => p.participant_type === "character" && p.character_id).map((p) => p.character_id as string));
    const characters = isLocalMode
      ? await LocalRepo.listCharactersByIds(characterIds)
      : await Repo.listCharactersByIds(supabase!, characterIds);
    const characterById = new Map(characters.map((character) => [character.id, character]));

    const sessions: SessionLike[] = rows.map((row) => {
      const participant = participants.find((p) => p.session_id === row.id && p.participant_type === "character" && p.character_id);
      const character = participant?.character_id ? characterById.get(participant.character_id) : null;
      return {
        id: row.id,
        title: row.title,
        mode: row.mode,
        lastMessageAt: row.last_message_at,
        characterId: participant?.character_id ?? null,
        characterName: character?.name ?? (participant?.character_id ? "Deleted character" : null),
        characterEmoji: character?.avatar_emoji ?? null,
      };
    });

    setState((s) => {
      const activeStillExists = !!s.activeSessionId && sessions.some((session) => session.id === s.activeSessionId);
      const activeSessionId = activeStillExists ? s.activeSessionId : (sessions[0]?.id ?? null);
      if (!activeSessionId) loadedSessionRef.current = null;
      return {
        ...s,
        sessions,
        activeSessionId,
        activeCharacter: activeSessionId ? s.activeCharacter : null,
        activeTemplate: activeSessionId ? s.activeTemplate : null,
        messages: activeSessionId ? s.messages : [],
        worldbookIds: activeSessionId ? s.worldbookIds : [],
        memoryIds: activeSessionId ? s.memoryIds : [],
        disabledWbIds: activeSessionId ? s.disabledWbIds : [],
        disabledMemIds: activeSessionId ? s.disabledMemIds : [],
        summaryEnabled: activeSessionId ? s.summaryEnabled : false,
        summaryText: activeSessionId ? s.summaryText : "",
        lastContextOutput: activeSessionId ? s.lastContextOutput : null,
        activeBranchId: activeSessionId ? s.activeBranchId : null,
        activeBranchName: activeSessionId ? s.activeBranchName : null,
        contextRunSaveStatus: activeSessionId ? s.contextRunSaveStatus : null,
        messageDbIds: activeSessionId ? s.messageDbIds : new Map(),
        messageCreatedAts: activeSessionId ? s.messageCreatedAts : new Map(),
        messageRevisions: activeSessionId ? s.messageRevisions : new Map(),
        messageRevisionCounts: activeSessionId ? s.messageRevisionCounts : new Map(),
        editedIndices: activeSessionId ? s.editedIndices : new Set(),
        hasMoreMessages: activeSessionId ? s.hasMoreMessages : false,
        suggestedMemories: activeSessionId ? s.suggestedMemories : [],
        latestProviderUsage: activeSessionId ? s.latestProviderUsage : null,
        latestCostEstimate: activeSessionId ? s.latestCostEstimate : null,
        providerBalance: activeSessionId ? s.providerBalance : null,
        isBalanceLoading: false,
        balanceError: activeSessionId ? s.balanceError : null,
      };
    });
  }, [isLocalMode, userId]);

  const buildCurrentContext = useCallback(async (userMessage: string, messagesOverride?: ChatMessage[]): Promise<BuiltContext> => {
    const s = stateRef.current;
    if (!s.activeSessionId) {
      return { output: null, session: null, character: s.activeCharacter, template: s.activeTemplate };
    }

    const sessionId = s.activeSessionId;
    const [session, participants, allEntries, allMems] = await withTimeout(
      isLocalMode
        ? Promise.all([
            LocalRepo.getSession(sessionId),
            LocalRepo.listSessionParticipants(sessionId),
            LocalRepo.listAllWorldbookEntries(),
            LocalRepo.listAllActiveMemories(),
          ])
        : Promise.all([
            Repo.getSession(supabase!, sessionId),
            Repo.listSessionParticipants(supabase!, sessionId),
            Repo.listAllWorldbookEntries(supabase!, userId!),
            Repo.listAllActiveMemories(supabase!, userId!),
          ]),
      5000,
      "context data load timed out",
    );

    const meta = parseSessionMeta(session?.system_prompt ?? null);
    const participant = participants.find((p) => p.participant_type === "character" && p.character_id);
    const characterId = participant?.character_id ?? session?.primary_character_id ?? null;
    const [character, template] = await withTimeout(
      isLocalMode
        ? Promise.all([
            characterId ? LocalRepo.getCharacter(characterId).catch(() => null) : Promise.resolve(null),
            meta._template_id ? LocalRepo.getPromptTemplate(meta._template_id).catch(() => null) : Promise.resolve(s.activeTemplate),
          ])
        : Promise.all([
            characterId ? Repo.getCharacter(supabase!, characterId).catch(() => null) : Promise.resolve(null),
            meta._template_id ? Repo.getPromptTemplate(supabase!, meta._template_id).catch(() => null) : Promise.resolve(s.activeTemplate),
          ]),
      5000,
      "context character load timed out",
    );

    const activeWbIds = s.worldbookIds.filter((id) => !s.disabledWbIds.includes(id));
    const boundEntries = allEntries.filter((entry) => activeWbIds.includes(entry.worldbook_id));
    const globalEntries = allEntries.filter((entry) => entry.scope === "global" && !activeWbIds.includes(entry.worldbook_id));
    const activeMemIds = s.memoryIds.filter((id) => !s.disabledMemIds.includes(id));
    const relevantMems = allMems.filter((memory) => activeMemIds.includes(memory.id));
    const recentMessageRows = messagesOverride
      ? null
      : await withTimeout(
          isLocalMode
            ? LocalRepo.listRecentMessagesForContext(sessionId, s.activeBranchId, CONTEXT_MESSAGE_LIMIT)
            : Repo.listRecentMessagesForContext(supabase!, sessionId, s.activeBranchId, CONTEXT_MESSAGE_LIMIT),
          5000,
          "context message load timed out",
        );
    const recentMessages = (messagesOverride ?? (recentMessageRows ? toChatMessages(recentMessageRows) : s.messages))
      .filter((message) => message.role !== "system");

    const output = buildContext({
      character,
      template,
      worldbookEntries: [...boundEntries, ...globalEntries],
      memories: relevantMems,
      sessionSummary: s.summaryEnabled ? (session?.story_summary || s.summaryText) : null,
      userMessage,
      recentMessages,
      activeSessionId: sessionId,
    });

    return { output, session, character, template };
  }, [isLocalMode, userId]);

  const createSession = useCallback(async (characterId?: string) => {
    setState((s) => ({ ...s, isContextLoading: true, error: null }));
    try {
      const character = characterId
        ? (isLocalMode ? await LocalRepo.getCharacter(characterId) : await Repo.getCharacter(supabase!, characterId))
        : null;
      const boundWbId = character ? getBoundWorldbookId(character) : null;
      const initialWbIds = boundWbId ? [boundWbId] : [];
      const title = character ? `${character.name} - new chat` : `New chat ${new Date().toLocaleTimeString("zh-CN")}`;
      const sessionMeta = buildSessionMeta({ _meta_version: SESSION_META_VERSION, _worldbook_ids: initialWbIds });
      const row = isLocalMode
        ? await LocalRepo.createSession({ title, primary_character_id: characterId ?? undefined, system_prompt: sessionMeta })
        : await Repo.createSession(supabase!, userId!, { title, primary_character_id: characterId ?? undefined, system_prompt: sessionMeta });
      if (!row) throw new Error("create session failed");
      if (!isLocalMode && row) LocalMirror.mirrorSession(row);
      if (characterId) {
        await (isLocalMode
          ? LocalRepo.ensureSessionParticipant(row.id, characterId)
          : Repo.ensureSessionParticipant(supabase!, userId!, row.id, characterId)).catch(() => {});
      }

      const branch = isLocalMode
        ? await LocalRepo.ensureDefaultBranch(row.id)
        : await Repo.ensureDefaultBranch(supabase!, row.id, userId!);
      if (!isLocalMode && branch) LocalMirror.mirrorBranch(branch);
      const branchId = branch?.id;
      const branchName = branch?.title || branch?.name || "主线";

      const messages: ChatMessage[] = [];
      const greeting = character ? String((character.card_json as Record<string, unknown>)?.greeting ?? "") : "";
      const dbIdMap = new Map<number, string>();
      const createdAtMap = new Map<number, string>();
      if (character && greeting) {
        messages.push({ role: "assistant", content: greeting });
        if (branchId) {
          const saved = isLocalMode
            ? await LocalRepo.createMessage({ session_id: row.id, branch_id: branchId, role: "assistant", content_text: greeting, character_id: characterId })
            : await Repo.createMessage(supabase!, userId!, { session_id: row.id, branch_id: branchId, role: "assistant", content_text: greeting, character_id: characterId });
          if (!isLocalMode && saved) LocalMirror.mirrorMessage(saved);
          if (saved) {
            dbIdMap.set(0, saved.id);
            createdAtMap.set(0, saved.created_at);
          }
        }
      }

      const preview = buildContext({ character, template: null, worldbookEntries: [], memories: [], sessionSummary: null, userMessage: "", recentMessages: messages, activeSessionId: row.id, previousCacheDiag: null });
      loadedSessionRef.current = row.id;
      setState((s) => ({
        ...s,
        sessions: [{ id: row.id, title: row.title, mode: row.mode, lastMessageAt: null, characterId: characterId ?? null, characterName: character?.name ?? null, characterEmoji: character?.avatar_emoji ?? null }, ...s.sessions],
        activeSessionId: row.id,
        activeCharacter: character,
        activeTemplate: null,
        messages,
        worldbookIds: initialWbIds,
        memoryIds: [],
        disabledWbIds: [],
        disabledMemIds: [],
        summaryEnabled: false,
        summaryText: "",
        lastContextOutput: preview,
        contextPreviewError: null,
        isContextLoading: false,
        activeBranchId: branchId ?? null,
        activeBranchName: branchName,
        contextRunSaveStatus: null,
        messageDbIds: dbIdMap,
        messageCreatedAts: createdAtMap,
        messageRevisions: new Map(),
        messageRevisionCounts: new Map(),
        editedIndices: new Set(),
        hasMoreMessages: false,
        isLoadingOlderMessages: false,
        suggestedMemories: [],
        latestProviderUsage: null,
        latestCostEstimate: null,
        providerBalance: null,
        isBalanceLoading: false,
        balanceError: null,
      }));
      void setTimeout(() => computeContextWindowEstimate(), 0);
    } catch (error) {
      setState((s) => ({ ...s, error: toErrorMessage(error, "会话列表加载失败，请稍后重试。"), isContextLoading: false }));
    }
  }, [isLocalMode, userId]);

  const selectSession = useCallback(async (id: string) => {
    setState((s) => ({ ...s, activeSessionId: id, error: null, isContextLoading: true, lastContextOutput: null, contextPreviewError: null }));
    try {
      const [session, participants, branch] = await withTimeout(
        isLocalMode
          ? Promise.all([
              LocalRepo.getSession(id),
              LocalRepo.listSessionParticipants(id),
              LocalRepo.ensureDefaultBranch(id),
            ])
          : Promise.all([
              Repo.getSession(supabase!, id),
              Repo.listSessionParticipants(supabase!, id),
              Repo.ensureDefaultBranch(supabase!, id, userId!),
            ]),
        5000,
        "session load timed out",
      );
      const participant = participants.find((p) => p.participant_type === "character" && p.character_id);
      const characterId = participant?.character_id ?? session?.primary_character_id ?? null;
      const meta = parseSessionMeta(session?.system_prompt ?? null);
      const [character, template] = await withTimeout(
        isLocalMode
          ? Promise.all([
              characterId ? LocalRepo.getCharacter(characterId).catch(() => null) : Promise.resolve(null),
              meta._template_id ? LocalRepo.getPromptTemplate(meta._template_id).catch(() => null) : Promise.resolve(null),
            ])
          : Promise.all([
              characterId ? Repo.getCharacter(supabase!, characterId).catch(() => null) : Promise.resolve(null),
              meta._template_id ? Repo.getPromptTemplate(supabase!, meta._template_id).catch(() => null) : Promise.resolve(null),
            ]),
        5000,
        "session character load timed out",
      );

      const page = await withTimeout(
        isLocalMode
          ? LocalRepo.listMessagesPage(id, branch?.id ?? null, UI_MESSAGE_PAGE_SIZE)
          : Repo.listMessagesPage(supabase!, id, branch?.id ?? null, UI_MESSAGE_PAGE_SIZE),
        5000,
        "message page load timed out",
      );
      const revisionCounts = await withTimeout(
        (isLocalMode
          ? LocalRepo.getMessageRevisionCounts(page.rows.map((row) => row.id))
          : Repo.getMessageRevisionCounts(supabase!, page.rows.map((row) => row.id))).catch((error) => {
          logger.warn("[Chat] message revision count load failed:", error);
          return new Map<string, number>();
        }),
        5000,
        "message revision count load timed out",
      ).catch((error) => {
        logger.warn("[Chat] message revision count load failed:", error);
        return new Map<string, number>();
      });
      const metadata = buildIndexedMessageMetadata(page.rows, revisionCounts);
      const latestContextRun = await withTimeout(
        (isLocalMode
          ? LocalRepo.listContextRuns(id)
          : Repo.listContextRuns(supabase!, userId!, id)).then((runs) => runs[0] ?? null),
        5000,
        "context run load timed out",
      ).catch((error) => {
        logger.warn("[Chat] context run load failed:", error);
        return null;
      });
      const latestDiag = readDiagnosticsFromContextRun(latestContextRun);
      // Use cache if available and not expired
      const cached = historyCacheRef.current.get(id);
      let cacheDiagHistory: CacheDiagnosticsRecord[];
      if (cached && (Date.now() - cached.loadedAt) < HISTORY_CACHE_TTL) {
        cacheDiagHistory = cached.history;
      } else {
        const recentRuns = await withTimeout(
          (isLocalMode
            ? LocalRepo.listRecentContextRuns(id, 20)
            : Repo.listRecentContextRuns(supabase!, userId!, id, 20)),
          5000,
          "context run history load timed out",
        ).catch(() => [] as ContextRunRow[]);
        cacheDiagHistory = extractHistory(recentRuns);
        if (cacheDiagHistory.length > 0) {
          historyCacheRef.current.set(id, { history: cacheDiagHistory, loadedAt: Date.now() });
          if (historyCacheRef.current.size > HISTORY_CACHE_MAX) {
            const firstKey = historyCacheRef.current.keys().next().value;
            if (firstKey) historyCacheRef.current.delete(firstKey);
          }
        }
      }

      loadedSessionRef.current = id;
      setState((s) => ({
        ...s,
        activeCharacter: character,
        activeTemplate: template,
        messages: toChatMessages(page.rows),
        worldbookIds: meta._worldbook_ids ?? [],
        memoryIds: meta._memory_ids ?? [],
        disabledWbIds: meta._disabled_worldbook_ids ?? [],
        disabledMemIds: meta._disabled_memory_ids ?? [],
        summaryEnabled: meta._summary_enabled ?? false,
        summaryText: session?.story_summary || "",
        isContextLoading: false,
        contextPreviewError: null,
        activeBranchId: branch?.id ?? null,
        activeBranchName: branch?.title || branch?.name || "主线",
        contextRunSaveStatus: null,
        messageDbIds: metadata.messageDbIds,
        messageCreatedAts: metadata.messageCreatedAts,
        messageRevisions: new Map(),
        messageRevisionCounts: revisionCounts,
        editedIndices: metadata.editedIndices,
        hasMoreMessages: page.hasMore,
        isLoadingOlderMessages: false,
        latestProviderUsage: latestDiag.usage,
        latestCostEstimate: latestDiag.costEstimate,
        cacheDiag: latestDiag.cacheDiag ?? null,
        cacheDiagHistory,
        providerBalance: null,
        isBalanceLoading: false,
        balanceError: null,
      }));
      void refreshSuggestedMemories(id);
      void setTimeout(() => computeContextWindowEstimate(), 0);
    } catch (error) {
      loadedSessionRef.current = id;
      setState((s) => ({ ...s, error: toErrorMessage(error, "会话加载失败，请稍后重试。"), isContextLoading: false, contextPreviewError: "Context preview failed, chat is still available" }));
    }
  }, [isLocalMode, refreshSuggestedMemories, userId]);

  const deleteSession = useCallback(async (id: string) => {
    try {
      if (isLocalMode) await LocalRepo.deleteSession(id);
      else {
        await Repo.deleteSession(supabase!, id, userId!);
        // Re-fetch from cloud to get the full row with deleted_at, mirror it
        Repo.getSession(supabase!, id).then((deleted) => {
          if (deleted) LocalMirror.mirrorSession(deleted);
        }).catch(() => {});
      }
      setState((s) => {
        const sessions = s.sessions.filter((session) => session.id !== id);
        const deletingActive = s.activeSessionId === id;
        const nextSessionId = deletingActive ? (sessions[0]?.id ?? null) : s.activeSessionId;
        if (deletingActive) loadedSessionRef.current = null;
        return {
          ...s,
          sessions,
          activeSessionId: nextSessionId,
          activeCharacter: deletingActive ? null : s.activeCharacter,
          activeTemplate: deletingActive ? null : s.activeTemplate,
          messages: deletingActive ? [] : s.messages,
          worldbookIds: deletingActive ? [] : s.worldbookIds,
          memoryIds: deletingActive ? [] : s.memoryIds,
          disabledWbIds: deletingActive ? [] : s.disabledWbIds,
          disabledMemIds: deletingActive ? [] : s.disabledMemIds,
          summaryEnabled: deletingActive ? false : s.summaryEnabled,
          summaryText: deletingActive ? "" : s.summaryText,
          lastContextOutput: deletingActive ? null : s.lastContextOutput,
          contextPreviewError: deletingActive ? null : s.contextPreviewError,
          isContextLoading: false,
          activeBranchId: deletingActive ? null : s.activeBranchId,
          activeBranchName: deletingActive ? null : s.activeBranchName,
          contextRunSaveStatus: deletingActive ? null : s.contextRunSaveStatus,
          messageDbIds: deletingActive ? new Map() : s.messageDbIds,
          messageCreatedAts: deletingActive ? new Map() : s.messageCreatedAts,
          messageRevisions: deletingActive ? new Map() : s.messageRevisions,
          messageRevisionCounts: deletingActive ? new Map() : s.messageRevisionCounts,
          editedIndices: deletingActive ? new Set() : s.editedIndices,
          hasMoreMessages: deletingActive ? false : s.hasMoreMessages,
          isLoadingOlderMessages: false,
          suggestedMemories: deletingActive ? [] : s.suggestedMemories,
          latestProviderUsage: deletingActive ? null : s.latestProviderUsage,
          latestCostEstimate: deletingActive ? null : s.latestCostEstimate,
          providerBalance: deletingActive ? null : s.providerBalance,
          isBalanceLoading: false,
          balanceError: deletingActive ? null : s.balanceError,
        };
      });
    } catch (error) {
      setState((s) => ({ ...s, error: toErrorMessage(error, "删除会话失败，请稍后重试。") }));
    }
  }, [isLocalMode, userId]);

  const addTemplate = useCallback(async (templateId: string) => {
    const template = isLocalMode
      ? await LocalRepo.getPromptTemplate(templateId)
      : await Repo.getPromptTemplate(supabase!, templateId);
    if (!template) return;
    setState((s) => ({ ...s, activeTemplate: template }));
    await syncMeta({ _template_id: templateId });
  }, [isLocalMode, syncMeta]);

  const removeTemplate = useCallback(async () => {
    setState((s) => ({ ...s, activeTemplate: null }));
    await syncMeta({ _template_id: undefined });
  }, [syncMeta]);

  const addWorldbooks = useCallback(async (ids: string[]) => {
    const worldbookIds = unique([...stateRef.current.worldbookIds, ...ids]);
    setState((s) => ({ ...s, worldbookIds, disabledWbIds: s.disabledWbIds.filter((id) => worldbookIds.includes(id)) }));
    await syncMeta({ _worldbook_ids: worldbookIds });
  }, [syncMeta]);

  const removeWorldbook = useCallback(async (id: string) => {
    const worldbookIds = stateRef.current.worldbookIds.filter((worldbookId) => worldbookId !== id);
    const disabledWbIds = stateRef.current.disabledWbIds.filter((worldbookId) => worldbookId !== id);
    setState((s) => ({ ...s, worldbookIds, disabledWbIds }));
    await syncMeta({ _worldbook_ids: worldbookIds, _disabled_worldbook_ids: disabledWbIds });
  }, [syncMeta]);

  const toggleWorldbook = useCallback(async (id: string) => {
    const disabled = stateRef.current.disabledWbIds.includes(id);
    const disabledWbIds = disabled ? stateRef.current.disabledWbIds.filter((worldbookId) => worldbookId !== id) : [...stateRef.current.disabledWbIds, id];
    setState((s) => ({ ...s, disabledWbIds }));
    await syncMeta({ _disabled_worldbook_ids: disabledWbIds });
  }, [syncMeta]);

  const addMemories = useCallback(async (ids: string[]) => {
    const memoryIds = unique([...stateRef.current.memoryIds, ...ids]);
    setState((s) => ({ ...s, memoryIds, disabledMemIds: s.disabledMemIds.filter((id) => memoryIds.includes(id)) }));
    await syncMeta({ _memory_ids: memoryIds });
  }, [syncMeta]);

  const removeMemory = useCallback(async (id: string) => {
    const memoryIds = stateRef.current.memoryIds.filter((memoryId) => memoryId !== id);
    const disabledMemIds = stateRef.current.disabledMemIds.filter((memoryId) => memoryId !== id);
    setState((s) => ({ ...s, memoryIds, disabledMemIds }));
    await syncMeta({ _memory_ids: memoryIds, _disabled_memory_ids: disabledMemIds });
  }, [syncMeta]);

  const toggleMemory = useCallback(async (id: string) => {
    const disabled = stateRef.current.disabledMemIds.includes(id);
    const disabledMemIds = disabled ? stateRef.current.disabledMemIds.filter((memoryId) => memoryId !== id) : [...stateRef.current.disabledMemIds, id];
    setState((s) => ({ ...s, disabledMemIds }));
    await syncMeta({ _disabled_memory_ids: disabledMemIds });
  }, [syncMeta]);

  const saveSummary = useCallback(async (text: string) => {
    setState((s) => ({ ...s, summaryText: text, summaryEnabled: !!text }));
    if (stateRef.current.activeSessionId) {
      if (isLocalMode) {
        await LocalRepo.updateSession(stateRef.current.activeSessionId, { story_summary: text || null }).catch(() => {});
      } else {
        const updated = await Repo.updateSession(supabase!, stateRef.current.activeSessionId, userId!, { story_summary: text || null }).catch(() => null);
        if (updated) LocalMirror.mirrorSession(updated);
      }
    }
    await syncMeta({ _summary_enabled: !!text });
    void setTimeout(() => computeContextWindowEstimate(), 0);
  }, [isLocalMode, syncMeta, userId]);

  const clearSummary = useCallback(async () => {
    setState((s) => ({ ...s, summaryText: "", summaryEnabled: false }));
    if (stateRef.current.activeSessionId) {
      if (isLocalMode) {
        await LocalRepo.updateSession(stateRef.current.activeSessionId, { story_summary: null }).catch(() => {});
      } else {
        const updated = await Repo.updateSession(supabase!, stateRef.current.activeSessionId, userId!, { story_summary: null }).catch(() => null);
        if (updated) LocalMirror.mirrorSession(updated);
      }
    }
    await syncMeta({ _summary_enabled: false });
    void setTimeout(() => computeContextWindowEstimate(), 0);
  }, [isLocalMode, syncMeta, userId]);

  const generateSummary = useCallback(async (): Promise<string | null> => {
    if (!apiConfigured) return null;
    const messages = stateRef.current.messages.filter((message) => message.role !== "system").slice(-20);
    if (messages.length < 2) return null;
    try {
      const prompt: ChatMessage[] = [
        { role: "system", content: "Summarize the roleplay conversation in 100-200 Chinese characters. Output only the summary." },
        ...messages,
      ];
      let text = "";
      for await (const chunk of sendProviderStreamRequest(false, buildConfig(), prompt, undefined)) {
        text += chunk.content;
      }
      return text.trim();
    } catch {
      return null;
    }
  }, [apiConfigured, buildConfig]);

  const compressContext = useCallback(async (): Promise<string | null> => {
    const current = stateRef.current;
    if (!apiConfigured || !current.activeSessionId) return null;
    const allMessages = current.messages.filter((m) => m.role !== "system");
    if (allMessages.length < 10) return null;

    // Keep last 20 messages (recent window), compress everything before
    const RECENT_WINDOW = 20;
    const oldMessages = allMessages.slice(0, Math.max(0, allMessages.length - RECENT_WINDOW));
    if (oldMessages.length < 3) return null; // not enough to compress

    setState((s) => ({ ...s, compressBusy: true, compressPreview: null }));

    try {
      const character = current.activeCharacter;
      const charName = character?.name ?? "角色";
      const existingSummary = current.summaryText?.trim() ?? "";
      const oldText = oldMessages
        .map((m) => `${m.role === "user" ? "用户" : charName}：${m.content}`)
        .join("\n");

      const compressPrompt: ChatMessage[] = [
        {
          role: "system",
          content: [
            "你是角色扮演会话的上下文压缩助手。请将以下较早的对话压缩为结构化摘要 Checkpoint，供后续角色扮演继续使用。",
            "",
            "压缩目标：使后续对话能连贯继续，保留剧情、关系、约定、伏笔、情绪走向。",
            "不要编造未发生的新剧情。不要替用户或角色做未来决定。只基于已有对话。",
            "",
            "请按以下固定格式输出中文摘要（不要输出任何其他内容）：",
            "",
            "## 会话摘要 Checkpoint",
            "",
            "### 已发生剧情",
            "- ...",
            "",
            "### 当前场景",
            "- ...",
            "",
            "### 角色关系状态",
            "- ...",
            "",
            "### 用户与角色的重要约定",
            "- ...",
            "",
            "### 长期设定与事实",
            "- ...",
            "",
            "### 未解决伏笔",
            "- ...",
            "",
            "### 情绪与语气走向",
            "- ...",
            "",
            "### 下一轮对话注意事项",
            "- ...",
          ].join("\n"),
        },
      ];

      if (existingSummary) {
        compressPrompt.push({
          role: "user",
          content: `当前已有摘要：\n${existingSummary}\n\n请基于以上摘要和以下较早对话，生成更新后的完整摘要 Checkpoint。\n\n较早对话：\n${oldText}`,
        });
      } else {
        compressPrompt.push({
          role: "user",
          content: `请将以下较早对话压缩为摘要 Checkpoint：\n\n${oldText}`,
        });
      }

      let text = "";
      for await (const chunk of sendProviderStreamRequest(false, buildConfig(), compressPrompt, undefined)) {
        text += chunk.content;
      }

      const trimmed = text.trim();
      if (trimmed) {
        setState((s) => ({ ...s, compressPreview: trimmed, compressBusy: false }));
        return trimmed;
      }
      setState((s) => ({ ...s, compressBusy: false }));
      return null;
    } catch {
      setState((s) => ({ ...s, compressBusy: false }));
      return null;
    }
  }, [apiConfigured, buildConfig]);

  const computeContextWindowEstimate = useCallback(() => {
    const current = stateRef.current;
    if (!current.activeSessionId || current.messages.length === 0) {
      setState((s) => ({ ...s, contextWindowEstimate: null }));
      return;
    }
    const msgs = current.messages.filter((m) => m.role !== "system");
    if (msgs.length === 0) return;
    const oldMsgs = msgs.slice(0, Math.max(0, msgs.length - 20));
    const sumText = current.summaryText?.trim() ?? "";
    const cp = current.activeCharacter
      ? buildCharacterSystemPrompt(current.activeCharacter, current.activeTemplate?.content)
      : "";
    const est = (t: string) => t.length > 0 ? Math.max(1, Math.ceil(t.length / 1.5)) : 0;
    const charToks = est(cp);
    const sumToks = est(sumText);
    const oldToks = est(oldMsgs.map((m) => m.content).join("\n"));
    const recentToks = est(msgs.slice(-20).map((m) => m.content).join("\n"));
    const total = charToks + sumToks + recentToks;
    const limit = current.lastContextOutput?.budget?.budgetLimit ?? 8000;
    const ratio = limit > 0 ? total / limit : 0;
    const canCompress = oldMsgs.length >= 3;
    let status: import("../context/contextBuilder").ContextWindowEstimate["status"] = "unknown";
    let reason: string | undefined;
    if (!canCompress && oldMsgs.length > 0) reason = "较早消息不足 3 条，暂无需压缩。";
    else if (msgs.length <= 20) reason = "会话消息较少，暂无需压缩。";
    else if (ratio >= 0.7) { status = "should_compress"; reason = "上下文接近上限，建议压缩较早消息。"; }
    else if (ratio >= 0.5) { status = "near_limit"; }
    else { status = "normal"; }
    setState((s) => ({
      ...s,
      contextWindowEstimate: {
        estimatedTokens: total, modelLimit: limit, usageRatio: ratio, status,
        recentMessagesCount: Math.min(msgs.length, 20), oldMessagesCount: oldMsgs.length,
        oldMessagesTokens: oldToks, summaryTokens: sumToks, canCompress, reason,
      },
    }));
  }, []);

  const generateMemorySuggestions = useCallback(async (source?: { messageIndex?: number }): Promise<MemorySuggestionDraft[] | null> => {
    const current = stateRef.current;
    if (isDemo || !apiConfigured || !current.activeSessionId) return null;

    setState((s) => ({ ...s, isGeneratingMemorySuggestions: true, error: null }));
    try {
      let sourceMessageId: string | null = null;
      let sourceLines: string[] = [];

      if (source?.messageIndex !== undefined) {
        const message = current.messages[source.messageIndex];
        if (!message || message.role === "system") {
          throw new Error("当前消息不能用于提炼记忆。");
        }
        sourceMessageId = current.messageDbIds.get(source.messageIndex) ?? null;
        sourceLines = [`${message.role === "user" ? "用户" : "角色"}：${message.content}`];
      } else if (supabase) {
        const rows = await withTimeout(
          Repo.listRecentMessagesForContext(
            supabase,
            current.activeSessionId,
            current.activeBranchId,
            MEMORY_SUGGESTION_MESSAGE_LIMIT,
          ),
          5000,
          "memory suggestion message load timed out",
        );
        sourceLines = rows
          .map((row) => `${row.role === "user" ? "用户" : row.role === "assistant" ? "角色" : "系统"}：${row.content_text}`)
          .filter((line) => !line.startsWith("系统："));
      } else {
        sourceLines = current.messages
          .slice(-MEMORY_SUGGESTION_MESSAGE_LIMIT)
          .map((message) => `${message.role === "user" ? "用户" : "角色"}：${message.content}`);
      }

      if (sourceLines.length === 0) {
        throw new Error("没有可用于提炼的聊天内容。");
      }

      const summarySection = current.summaryText.trim()
        ? `当前会话摘要：\n${current.summaryText.trim()}\n\n`
        : "";
      const prompt: ChatMessage[] = [
        {
          role: "system",
          content:
            "你是角色扮演聊天的记忆提炼助手。请从给定聊天中提炼 1 到 3 条值得长期保存的候选记忆。" +
            "只返回 JSON，不要输出解释，不要使用 Markdown 代码块。" +
            ' JSON 格式必须是数组，每项包含 memory_type、title、content、salience、reason。' +
            " memory_type 只能是 short_term、long_term、summary、event、relationship、user_preference、character_preference 之一。" +
            " salience 为 0-100 的整数。",
        },
        {
          role: "user",
          content:
            `${summarySection}聊天内容：\n${sourceLines.join("\n")}\n\n` +
            "请只保留稳定、有价值、对后续角色扮演有帮助的事实；不要提炼 API Key、账号、纯一次性寒暄或无关技术信息。" +
            " 直接返回 JSON 数组。",
        },
      ];

      let raw = "";
      for await (const chunk of sendProviderStreamRequest(false, buildConfig(), prompt, undefined)) {
        raw += chunk.content;
      }
      return parseMemorySuggestionDrafts(raw, sourceMessageId);
    } catch (error) {
      setState((s) => ({ ...s, error: error instanceof Error ? error.message : "AI 提炼记忆失败，请稍后重试。" }));
      return null;
    } finally {
      setState((s) => ({ ...s, isGeneratingMemorySuggestions: false }));
    }
  }, [apiConfigured, buildConfig, isDemo]);

  const saveMemorySuggestions = useCallback(async (drafts: MemorySuggestionDraft[], status: "active" | "suggested") => {
    const current = stateRef.current;
    if (isDemo || !supabase || !userId || !current.activeSessionId || drafts.length === 0) return;

    try {
      const createdIds: string[] = [];
      for (const draft of drafts) {
        const saved = await Repo.createMemory(supabase, userId, {
          session_id: current.activeSessionId,
          character_id: current.activeCharacter?.id ?? undefined,
          memory_type: draft.memory_type,
          title: draft.title,
          content: draft.content,
          source_message_id: draft.sourceMessageId ?? undefined,
          salience: draft.salience,
          status,
        });
        if (saved) {
          createdIds.push(saved.id);
          LocalMirror.mirrorMemory(saved);
        }
      }

      if (status === "active" && createdIds.length > 0) {
        const memoryIds = unique([...stateRef.current.memoryIds, ...createdIds]);
        const disabledMemIds = stateRef.current.disabledMemIds.filter((id) => memoryIds.includes(id));
        setState((s) => ({ ...s, memoryIds, disabledMemIds }));
        await syncMeta({ _memory_ids: memoryIds, _disabled_memory_ids: disabledMemIds });
      }

      await refreshSuggestedMemories(current.activeSessionId);
    } catch (error) {
      setState((s) => ({ ...s, error: error instanceof Error ? error.message : "保存记忆失败，请稍后重试。" }));
    }
  }, [isDemo, refreshSuggestedMemories, syncMeta, userId]);

  const updateSuggestedMemoryStatus = useCallback(async (memoryId: string, status: "active" | "disabled" | "deleted") => {
    const current = stateRef.current;
    if (isDemo || !supabase || !userId) return;
    try {
      if (status === "deleted") {
        await Repo.deleteMemory(supabase, memoryId, userId);
        const mem = current.suggestedMemories.find((m) => m.id === memoryId);
        if (mem) LocalMirror.mirrorMemory({ ...mem, status: "deleted", deleted_at: new Date().toISOString(), deleted_reason: "user_deleted", updated_at: new Date().toISOString() });
      } else {
        const updated = await Repo.updateMemory(supabase, memoryId, userId, { status });
        if (updated) LocalMirror.mirrorMemory(updated);
      }

      let memoryIds = current.memoryIds;
      let disabledMemIds = current.disabledMemIds;
      if (status === "active") {
        memoryIds = unique([...current.memoryIds, memoryId]);
        disabledMemIds = current.disabledMemIds.filter((id) => id !== memoryId);
      } else {
        memoryIds = current.memoryIds.filter((id) => id !== memoryId);
        disabledMemIds = current.disabledMemIds.filter((id) => id !== memoryId);
      }

      setState((s) => ({
        ...s,
        memoryIds,
        disabledMemIds,
        suggestedMemories: s.suggestedMemories.filter((memory) => memory.id !== memoryId || status === "active"),
      }));
      await syncMeta({ _memory_ids: memoryIds, _disabled_memory_ids: disabledMemIds });
      await refreshSuggestedMemories(current.activeSessionId);
    } catch (error) {
      setState((s) => ({ ...s, error: error instanceof Error ? error.message : "更新记忆状态失败，请稍后重试。" }));
    }
  }, [isDemo, refreshSuggestedMemories, syncMeta, userId]);

  const stopGeneration = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setState((s) => ({ ...s, isStreaming: false, isSending: false }));
  }, []);

  const sendMessage = useCallback(async (text: string, opts?: { editMessageIndex?: number; oldAssistantContentForRevision?: string | null }) => {
    const current = stateRef.current;
    const editIndex = opts?.editMessageIndex;
    if (current.isStreaming || !current.activeSessionId) return;
    if (editIndex !== undefined && (editIndex >= current.messages.length || current.messages[editIndex].role !== "user")) return;

    const userMsg: ChatMessage = { role: "user", content: text };
    // For edit mode, context is built from messages BEFORE the edit point
    const prevMessages = editIndex !== undefined ? current.messages.slice(0, editIndex) : current.messages;
    const isEdit = editIndex !== undefined;
    let contextOutput: ContextBuildOutput | null = null;
    let contextCharacter: CharacterRow | null = current.activeCharacter;
    let providerMessages: ChatMessage[] = [];

    try {
      const built = await buildCurrentContext(text, prevMessages);
      contextOutput = built.output;
      contextCharacter = built.character ?? current.activeCharacter;
      if (built.character !== current.activeCharacter || built.template !== current.activeTemplate) {
        setState((s) => ({ ...s, activeCharacter: built.character, activeTemplate: built.template }));
      }
    } catch (error) {
      setState((s) => ({ ...s, error: toErrorMessage(error, "上下文构建失败，请稍后重试。") }));
      return;
    }

    if (contextOutput) {
      providerMessages = contextOutput.providerMessages;
    } else {
      const systemPrompt = current.activeCharacter ? buildCharacterSystemPrompt(current.activeCharacter, current.activeTemplate?.content) : "";
      providerMessages = systemPrompt ? [{ role: "system", content: systemPrompt }] : [];
      providerMessages.push(...prevMessages.filter((message) => message.role !== "system"), userMsg);
    }

    const hasRoleSession = !!(contextCharacter ?? current.activeCharacter);
    if (hasRoleSession && (providerMessages[0]?.role !== "system" || !providerMessages[0].content.trim())) {
      setState((s) => ({ ...s, error: "Role context is not ready." }));
      return;
    }

    // Build the correct UI message list:
    // - Normal mode: append user message to current messages
    // - Edit mode: replace message at editIndex, remove all subsequent messages, append edited user message
    let messagesAfterUser: ChatMessage[];
    if (isEdit) {
      messagesAfterUser = [...current.messages.slice(0, editIndex), userMsg];
    } else {
      messagesAfterUser = [...current.messages, userMsg];
    }
    setState((s) => {
      if (!isEdit) {
        return { ...s, messages: messagesAfterUser, isSending: true, isStreaming: true, error: null, saveStatus: "idle", lastContextOutput: contextOutput };
      }
      return {
        ...s,
        messages: messagesAfterUser,
        isSending: true,
        isStreaming: true,
        error: null,
        saveStatus: "idle",
        lastContextOutput: contextOutput, cacheDiag: contextOutput?.cacheDiag ?? null,
        messageDbIds: truncateIndexedMap(s.messageDbIds, editIndex + 1),
        messageCreatedAts: truncateIndexedMap(s.messageCreatedAts, editIndex + 1),
        editedIndices: truncateIndexedSet(s.editedIndices, editIndex + 1),
      };
    });

    const controller = new AbortController();
    abortRef.current = controller;
    let aiContent = "";
    let latestUsage: ProviderUsage | null = null;
    try {
      for await (const chunk of sendProviderStreamRequest(isDemo, buildConfig(), providerMessages, controller.signal)) {
        if (controller.signal.aborted) break;
        if (chunk.usage) {
          latestUsage = chunk.usage;
        }
        if (!chunk.content) continue;
        aiContent += chunk.content;
        setState((s) => {
          const messages = [...s.messages];
          const last = messages[messages.length - 1];
          if (last?.role === "assistant") messages[messages.length - 1] = { ...last, content: aiContent };
          else messages.push({ role: "assistant", content: aiContent });
          return { ...s, messages };
        });
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        const message = toErrorMessage(error, "模型请求失败，请稍后重试。");
        aiContent = aiContent || `[Error: ${message}]`;
        setState((s) => ({ ...s, error: message, messages: [...s.messages, { role: "assistant", content: aiContent }] }));
      }
    } finally {
      abortRef.current = null;
    }

    const usageForDisplay =
      latestUsage ??
      (isDemo
        ? buildUsageUnavailable("本地预览不会返回真实 Provider 用量。", "mock")
        : buildUsageUnavailable(
            storageMode === "hosted_encrypted"
              ? "托管聊天服务未返回本次用量。如果已部署最新版 hosted-provider-chat，流式响应结束后会自动更新用量。"
              : "当前 Provider 未返回本次用量。",
            storedProvider,
          ));
    const costEstimate = isDeepSeekProvider(storedProvider)
      ? estimateDeepSeekCost(usageForDisplay, stateRef.current.model)
      : null;
    setState((s) => ({
      ...s,
      latestProviderUsage: usageForDisplay,
      latestCostEstimate: costEstimate,
    }));

    if (stateRef.current.activeSessionId) {
      setState((s) => ({ ...s, saveStatus: "saving" }));
      let userDbId: string | null = null;
      let assistantDbId: string | null = null;
      let userCreatedAt: string | null = null;
      let assistantCreatedAt: string | null = null;
      try {
        const sessionId = stateRef.current.activeSessionId;
        const characterId = contextCharacter?.id ?? stateRef.current.activeCharacter?.id ?? null;
        const branch = isLocalMode
          ? await LocalRepo.ensureDefaultBranch(sessionId)
          : await Repo.ensureDefaultBranch(supabase!, sessionId, userId!);
        if (!isLocalMode && branch) LocalMirror.mirrorBranch(branch);
        const branchId = branch?.id;
        if (branchId) {
          // Only create new user message in DB if NOT editing (edit already updated the existing row)
          if (!isEdit) {
            const savedUser = isLocalMode
              ? await LocalRepo.createMessage({ session_id: sessionId, branch_id: branchId, role: "user", content_text: text })
              : await Repo.createMessage(supabase!, userId!, { session_id: sessionId, branch_id: branchId, role: "user", content_text: text });
            if (!isLocalMode && savedUser) LocalMirror.mirrorMessage(savedUser);
            userDbId = savedUser?.id ?? null;
            userCreatedAt = savedUser?.created_at ?? null;
          } else {
            // For edit mode, reuse the existing DB id for dbIdMap
            userDbId = current.messageDbIds.get(editIndex) ?? null;
          }
          if (aiContent) {
            if (hasRoleSession && !characterId) {
              logger.warn("[Chat] refusing to save role assistant message without character_id", { sessionId });
            } else {
              const asstMsg = isLocalMode
                ? await LocalRepo.createMessage({ session_id: sessionId, branch_id: branchId, role: "assistant", content_text: aiContent, character_id: characterId ?? undefined })
                : await Repo.createMessage(supabase!, userId!, { session_id: sessionId, branch_id: branchId, role: "assistant", content_text: aiContent, character_id: characterId ?? undefined });
              if (!isLocalMode && asstMsg) LocalMirror.mirrorMessage(asstMsg);
              assistantDbId = asstMsg?.id ?? null;
              assistantCreatedAt = asstMsg?.created_at ?? null;
              // Persist old assistant content as a revision of the new assistant message
              if (assistantDbId && opts?.oldAssistantContentForRevision?.trim()) {
                const revResult = await (isLocalMode
                  ? LocalRepo.createMessageRevision({
                      message_id: assistantDbId,
                      revision_no: 1,
                      content_text: opts.oldAssistantContentForRevision,
                    })
                  : Repo.createMessageRevision(supabase!, userId!, {
                      message_id: assistantDbId,
                      revision_no: 1,
                      content_text: opts.oldAssistantContentForRevision,
                    })).catch((e) => {
                  logger.warn("[Chat] assistant revision save failed:", e);
                  return null;
                });
                if (!isLocalMode && revResult) LocalMirror.mirrorMessageRevision(revResult);
              }
            }
          }
          if (isLocalMode) await LocalRepo.updateSession(sessionId, { last_message_at: new Date().toISOString() });
          else {
            const updatedSession = await Repo.updateSession(supabase!, sessionId, userId!, { last_message_at: new Date().toISOString() });
            if (updatedSession) LocalMirror.mirrorSession(updatedSession);
          }
        }

        // Persist context_run (with message_id bound to assistant reply)
        if (contextOutput && branchId) {
          const crPromise = isLocalMode
            ? LocalRepo.saveContextRun({
                session_id: sessionId,
                branch_id: branchId,
                trigger_message_id: userDbId,
                message_id: assistantDbId,
                provider: storedProvider,
                model: stateRef.current.model,
                system_prompt: contextOutput.systemPrompt,
                provider_messages_json: providerMessages,
                worldbook_hits_json: contextOutput.triggerResult.triggered.filter((h) => h.injected).map((h) => ({ id: h.entry.id, title: h.entry.title, keywords: h.matchedKeywords })),
                skipped_entries_json: contextOutput.triggerResult.skipped.map((s) => ({ id: s.entry.id, title: s.entry.title, reason: s.reason })),
                injected_memories_json: contextOutput.budget.memories.map((m) => ({ id: m.id, title: m.title })),
                summary_text: contextOutput.sessionSummaryInjected ? (stateRef.current.summaryText || null) : null,
                token_budget: contextOutput.budget.budgetLimit,
                estimated_tokens: contextOutput.estimatedTokens,
                debug_enabled: false,
                input_tokens: usageForDisplay.inputTokens ?? null,
                output_tokens: usageForDisplay.outputTokens ?? null,
                cache_hit_tokens: usageForDisplay.cacheHitInputTokens ?? null,
                cost_usd: costEstimate?.totalCost ?? null,
                components_json: [{ usage: usageForDisplay, costEstimate, cacheDiag: stateRef.current.cacheDiag }],
              })
            : Repo.saveContextRun(supabase!, userId!, {
            session_id: sessionId,
            branch_id: branchId,
            trigger_message_id: userDbId,
            message_id: assistantDbId,
            provider: storedProvider,
            model: stateRef.current.model,
            system_prompt: contextOutput.systemPrompt,
            provider_messages_json: providerMessages,
            worldbook_hits_json: contextOutput.triggerResult.triggered.filter((h) => h.injected).map((h) => ({ id: h.entry.id, title: h.entry.title, keywords: h.matchedKeywords })),
            skipped_entries_json: contextOutput.triggerResult.skipped.map((s) => ({ id: s.entry.id, title: s.entry.title, reason: s.reason })),
            injected_memories_json: contextOutput.budget.memories.map((m) => ({ id: m.id, title: m.title })),
            summary_text: contextOutput.sessionSummaryInjected ? (stateRef.current.summaryText || null) : null,
            token_budget: contextOutput.budget.budgetLimit,
            estimated_tokens: contextOutput.estimatedTokens,
            debug_enabled: false,
            input_tokens: usageForDisplay.inputTokens ?? null,
            output_tokens: usageForDisplay.outputTokens ?? null,
            cache_hit_tokens: usageForDisplay.cacheHitInputTokens ?? null,
            cost_usd: costEstimate?.totalCost ?? null,
            components_json: [{ usage: usageForDisplay, costEstimate, cacheDiag: stateRef.current.cacheDiag }],
          });
          crPromise.then((cr) => {
            if (!isLocalMode && cr) LocalMirror.mirrorContextRun(cr);
            setState((s) => ({ ...s, contextRunSaveStatus: "saved" }));
          }).catch((e) => {
            logger.warn("[Chat] context_run save failed:", e);
            setState((s) => ({ ...s, contextRunSaveStatus: "failed" }));
          });
        }

        // Update dbIdMap
        if (userDbId || assistantDbId) {
          setState((s) => {
            const newMap = new Map(s.messageDbIds);
            const newCreatedAtMap = new Map(s.messageCreatedAts);
            const newCounts = new Map(s.messageRevisionCounts);
            const msgIdx = s.messages.length - (aiContent ? 2 : 1);
            if (userDbId) newMap.set(msgIdx, userDbId);
            if (!isEdit && userDbId && userCreatedAt) newCreatedAtMap.set(msgIdx, userCreatedAt);
            if (assistantDbId) {
              newMap.set(msgIdx + 1, assistantDbId);
              if (assistantCreatedAt) newCreatedAtMap.set(msgIdx + 1, assistantCreatedAt);
              if (opts?.oldAssistantContentForRevision?.trim()) newCounts.set(assistantDbId, 1);
            }
            return { ...s, messageDbIds: newMap, messageCreatedAts: newCreatedAtMap, messageRevisionCounts: newCounts };
          });
        }

        setState((s) => ({ ...s, saveStatus: "saved" }));
      } catch {
        setState((s) => ({ ...s, saveStatus: "error" }));
      }
    } else {
      setState((s) => ({ ...s, saveStatus: "saved" }));
    }

    setState((s) => ({ ...s, isStreaming: false, isSending: false }));
    void loadSessions();
    void setTimeout(() => computeContextWindowEstimate(), 0);
  }, [buildConfig, buildCurrentContext, isDemo, isLocalMode, loadSessions, userId]);

  const regenerateLast = useCallback(async () => {
    const messages = stateRef.current.messages.filter((message) => message.role !== "system");
    const lastUser = [...messages].reverse().find((message) => message.role === "user");
    if (!lastUser) return;
    const keepCount = messages.lastIndexOf(lastUser) + 1;
    setState((s) => ({
      ...s,
      messages: messages.slice(0, keepCount),
      messageDbIds: truncateIndexedMap(s.messageDbIds, keepCount),
      messageCreatedAts: truncateIndexedMap(s.messageCreatedAts, keepCount),
      editedIndices: truncateIndexedSet(s.editedIndices, keepCount),
    }));
    await sendMessage(lastUser.content);
  }, [sendMessage]);

  const editAndResend = useCallback(async (messageIndex: number, newText: string) => {
    const s = stateRef.current;
    const messages = s.messages;
    if (messageIndex >= messages.length || messages[messageIndex].role !== "user") return;
    const oldAssistantContent = messages
      .slice(messageIndex + 1)
      .find((message) => message.role === "assistant")?.content ?? null;
    if (import.meta.env.DEV) {
      logger.debug("[Chat] editAndResend: oldAssistantContent=%s",
        oldAssistantContent ? oldAssistantContent.slice(0, 30) : "(none)");
    }

    // Save old version as revision in DB (cloud or local)
    if (!isDemo && supabase && userId && s.activeSessionId) {
      const dbId = s.messageDbIds.get(messageIndex);
      if (dbId) {
        const oldContent = messages[messageIndex].content;
        try {
          // Fetch current revision_no from DB
          const { data: currentMsg } = await supabase.from("messages").select("revision_no").eq("id", dbId).single();
          const currentRev = (currentMsg as { revision_no?: number } | null)?.revision_no ?? 1;

          // Save revision of old content
          await Repo.createMessageRevision(supabase, userId, {
            message_id: dbId,
            revision_no: currentRev,
            content_text: oldContent,
          });
          setState((prev) => {
            const nextCounts = new Map(prev.messageRevisionCounts);
            nextCounts.set(dbId, (nextCounts.get(dbId) ?? 0) + 1);
            const nextRevisions = new Map(prev.messageRevisions);
            nextRevisions.delete(dbId);
            return { ...prev, messageRevisionCounts: nextCounts, messageRevisions: nextRevisions };
          });
          // Update message content and increment revision
          await Repo.updateMessage(supabase, dbId, userId, {
            content_text: newText,
            edited_at: new Date().toISOString(),
            revision_no: currentRev + 1,
          });

          // Soft-delete subsequent assistant messages (keep them in DB but hidden)
          const subsequentIds: string[] = [];
          for (let i = messageIndex + 1; i < messages.length; i++) {
            const mid = s.messageDbIds.get(i);
            if (mid) subsequentIds.push(mid);
          }
          for (const mid of subsequentIds) {
            await Repo.deleteMessage(supabase, mid, userId, "superseded_by_edit").catch(() => {});
          }
          if (subsequentIds.length > 0) {
            await Repo.supersedeMessages(supabase, subsequentIds, dbId, userId).catch(() => {});
          }

          // Create a new branch if editing historical (not last) message
          if (messageIndex < messages.length - 1) {
            const branch = await Repo.createBranch(supabase, userId, {
              session_id: s.activeSessionId,
              name: `branch-${Date.now()}`,
              title: `分支 ${(currentRev + 1)}`,
              parent_branch_id: s.activeBranchId ?? undefined,
              forked_from_message_id: dbId,
            });
            if (branch) {
              await Repo.setActiveBranch(supabase, s.activeSessionId, branch.id, userId);
              setState((prev) => ({ ...prev, activeBranchId: branch.id, activeBranchName: branch.title || branch.name }));
            }
          }
        } catch (e) {
          logger.warn("[Chat] editAndResend DB sync failed:", e);
        }
      }
    } else if (isLocalMode && s.activeSessionId) {
      const dbId = s.messageDbIds.get(messageIndex);
      if (dbId) {
        const oldContent = messages[messageIndex].content;
        try {
          // Fetch current revision_no from local DB
          const currentMsg = await LocalRepo.getMessage(dbId);
          const currentRev = currentMsg?.revision_no ?? 1;

          // Save revision of old content
          await LocalRepo.createMessageRevision({
            message_id: dbId,
            revision_no: currentRev,
            content_text: oldContent,
          });
          setState((prev) => {
            const nextCounts = new Map(prev.messageRevisionCounts);
            nextCounts.set(dbId, (nextCounts.get(dbId) ?? 0) + 1);
            const nextRevisions = new Map(prev.messageRevisions);
            nextRevisions.delete(dbId);
            return { ...prev, messageRevisionCounts: nextCounts, messageRevisions: nextRevisions };
          });
          // Update message content and increment revision
          await LocalRepo.updateMessage(dbId, {
            content_text: newText,
            edited_at: new Date().toISOString(),
            revision_no: currentRev + 1,
          });

          // Soft-delete subsequent assistant messages
          const subsequentIds: string[] = [];
          for (let i = messageIndex + 1; i < messages.length; i++) {
            const mid = s.messageDbIds.get(i);
            if (mid) subsequentIds.push(mid);
          }
          for (const mid of subsequentIds) {
            await LocalRepo.deleteMessage(mid, "superseded_by_edit").catch(() => {});
          }
          if (subsequentIds.length > 0) {
            await LocalRepo.supersedeMessages(subsequentIds, dbId).catch(() => {});
          }

          // Create a new branch if editing historical (not last) message
          if (messageIndex < messages.length - 1) {
            const branch = await LocalRepo.createBranch({
              session_id: s.activeSessionId,
              name: `branch-${Date.now()}`,
              title: `分支 ${(currentRev + 1)}`,
              parent_branch_id: s.activeBranchId ?? undefined,
              forked_from_message_id: dbId,
            });
            if (branch) {
              await LocalRepo.setActiveBranch(s.activeSessionId, branch.id);
              setState((prev) => ({ ...prev, activeBranchId: branch.id, activeBranchName: branch.title || branch.name }));
            }
          }
        } catch (e) {
          logger.warn("[Chat] editAndResend local DB sync failed:", e);
        }
      }
    }

    // Mark this index as edited so version arrows show up
    setState((prev) => {
      const next = new Set(prev.editedIndices);
      next.add(messageIndex);
      return { ...prev, editedIndices: next };
    });

    // Delegate to sendMessage in edit mode — it handles UI truncation, streaming, and saving the new AI reply
    await sendMessage(newText, { editMessageIndex: messageIndex, oldAssistantContentForRevision: oldAssistantContent });
  }, [sendMessage, isDemo, userId]);

  const deleteMessage = useCallback(async (messageIndex: number) => {
    const s = stateRef.current;
    // Sync delete to DB first — don't remove from UI until DB confirms
    if (s.activeSessionId) {
      const dbId = s.messageDbIds.get(messageIndex);
      if (dbId) {
        try {
          if (isLocalMode) await LocalRepo.deleteMessage(dbId, "user_deleted");
          else {
            await Repo.deleteMessage(supabase!, dbId, userId!, "user_deleted");
            LocalMirror.mirrorMessageDeletion(dbId, new Date().toISOString(), "user_deleted");
          }
        } catch (e) {
          logger.warn("[Chat] deleteMessage DB sync failed:", e);
          setState((prev) => ({ ...prev, error: "删除消息失败，请重试" }));
          return; // Block UI removal on DB failure
        }
      } else {
        logger.warn("[Chat] deleteMessage: no dbId for message index", messageIndex);
        // Still remove from UI for consistency (e.g. demo messages, or transient state)
      }
    }
    setState((prev) => {
      const messages = [...prev.messages];
      messages.splice(messageIndex, 1);
      return {
        ...prev,
        messages,
        messageDbIds: removeIndexedMapEntry(prev.messageDbIds, messageIndex),
        messageCreatedAts: removeIndexedMapEntry(prev.messageCreatedAts, messageIndex),
        editedIndices: removeIndexedSet(prev.editedIndices, messageIndex),
      };
    });
  }, [isLocalMode, userId]);

  const copyMessage = useCallback((messageIndex: number) => {
    const text = stateRef.current.messages[messageIndex]?.content;
    if (text) navigator.clipboard.writeText(text).catch(() => {});
  }, []);

  const loadMessageRevisions = useCallback(async (messageIndex: number): Promise<MessageRevisionRow[]> => {
    const dbId = stateRef.current.messageDbIds.get(messageIndex);
    if (!dbId) return [];
    try {
      const revisions = isLocalMode
        ? await LocalRepo.loadMessageRevisions(dbId)
        : await Repo.loadMessageRevisions(supabase!, dbId);
      setState((s) => {
        const newRevisions = new Map(s.messageRevisions);
        const newCounts = new Map(s.messageRevisionCounts);
        newRevisions.set(dbId, revisions);
        newCounts.set(dbId, revisions.length);
        return { ...s, messageRevisions: newRevisions, messageRevisionCounts: newCounts };
      });
      return revisions;
    } catch (error) {
      logger.warn("[Chat] message revisions load failed:", error);
      return [];
    }
  }, [isLocalMode]);

  const loadOlderMessages = useCallback(async () => {
    const current = stateRef.current;
    if (!current.activeSessionId || current.isLoadingOlderMessages || !current.hasMoreMessages) {
      return;
    }

    const beforeId = current.messageDbIds.get(0);
    const beforeCreatedAt = current.messageCreatedAts.get(0);
    if (!beforeId || !beforeCreatedAt) {
      setState((s) => ({ ...s, hasMoreMessages: false }));
      return;
    }

    setState((s) => ({ ...s, isLoadingOlderMessages: true }));
    try {
      const page = await withTimeout(
        isLocalMode
          ? LocalRepo.listMessagesPage(current.activeSessionId, current.activeBranchId, UI_MESSAGE_PAGE_SIZE, {
              id: beforeId,
              createdAt: beforeCreatedAt,
            })
          : Repo.listMessagesPage(supabase!, current.activeSessionId, current.activeBranchId, UI_MESSAGE_PAGE_SIZE, {
              id: beforeId,
              createdAt: beforeCreatedAt,
            }),
        5000,
        "older message load timed out",
      );
      const revisionCounts = await (isLocalMode
        ? LocalRepo.getMessageRevisionCounts(page.rows.map((row) => row.id))
        : Repo.getMessageRevisionCounts(supabase!, page.rows.map((row) => row.id))).catch((error) => {
        logger.warn("[Chat] older message revision count load failed:", error);
        return new Map<string, number>();
      });
      const metadata = buildIndexedMessageMetadata(page.rows, revisionCounts);

      setState((s) => {
        const insertedCount = page.rows.length;
        const messageDbIds = prependIndexedMapEntries(s.messageDbIds, insertedCount);
        const messageCreatedAts = prependIndexedMapEntries(s.messageCreatedAts, insertedCount);
        metadata.messageDbIds.forEach((value, key) => messageDbIds.set(key, value));
        metadata.messageCreatedAts.forEach((value, key) => messageCreatedAts.set(key, value));

        const messageRevisionCounts = new Map(s.messageRevisionCounts);
        revisionCounts.forEach((value, key) => messageRevisionCounts.set(key, value));

        return {
          ...s,
          messages: [...toChatMessages(page.rows), ...s.messages],
          messageDbIds,
          messageCreatedAts,
          messageRevisionCounts,
          editedIndices: new Set([...shiftIndexedSet(s.editedIndices, insertedCount), ...metadata.editedIndices]),
          hasMoreMessages: page.hasMore,
          isLoadingOlderMessages: false,
        };
      });
    } catch (error) {
      logger.warn("[Chat] older message load failed:", error);
      setState((s) => ({ ...s, isLoadingOlderMessages: false, error: "加载更早消息失败，请稍后重试。" }));
    }
  }, [isLocalMode]);

  const retry = useCallback(async () => {
    const lastUser = [...stateRef.current.messages].reverse().find((message) => message.role === "user");
    if (lastUser) await sendMessage(lastUser.content);
  }, [sendMessage]);

  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  useEffect(() => {
    if (!state.activeSessionId || state.isContextLoading) return;
    if (loadedSessionRef.current === state.activeSessionId) return;
    void selectSession(state.activeSessionId);
  }, [selectSession, state.activeSessionId, state.isContextLoading]);

  useEffect(() => {
    if (!state.activeSessionId || state.isStreaming) return;
    if (loadedSessionRef.current !== state.activeSessionId) return;
    const seq = ++previewSeqRef.current;
    setState((s) => ({ ...s, contextPreviewError: null }));
    withTimeout(buildCurrentContext(""), 5000, "context preview timed out")
      .then((built) => {
        if (previewSeqRef.current !== seq) return;
        setState((s) => ({ ...s, activeCharacter: built.character ?? s.activeCharacter, activeTemplate: built.template ?? s.activeTemplate, lastContextOutput: built.output, summaryText: built.session?.story_summary ?? s.summaryText, contextPreviewError: null }));
      })
      .catch(() => {
        if (previewSeqRef.current !== seq) return;
        setState((s) => ({ ...s, contextPreviewError: "Context preview failed, chat is still available" }));
      });
  }, [
    buildCurrentContext,
    state.activeCharacter?.id,
    state.activeSessionId,
    state.activeTemplate?.id,
    state.disabledMemIds.join("|"),
    state.disabledWbIds.join("|"),
    state.isStreaming,
    state.memoryIds.join("|"),
    state.summaryEnabled,
    state.summaryText,
    state.worldbookIds.join("|"),
  ]);

  const providerLabel = isDemo ? "本地预览" : storedProvider === "deepseek" ? "DeepSeek" : getPresetName(storedProvider);
  const modelLabel = isDemo ? "本地预览回复" : state.model;
  const runtimeMode = isDemo
    ? "local_preview"
    : storageMode === "hosted_encrypted"
      ? "hosted_encrypted"
      : storageMode === "local_device"
        ? "byok_local_device"
        : "byok_session_only";
  const systemPrompt = state.lastContextOutput?.systemPrompt || (state.activeCharacter ? buildCharacterSystemPrompt(state.activeCharacter, state.activeTemplate?.content) : null);

  return {
    ...state,
    createSession,
    selectSession,
    deleteSession,
    sendMessage,
    stopGeneration,
    regenerateLast,
    editAndResend,
    deleteMessage,
    copyMessage,
    retry,
    addTemplate,
    removeTemplate,
    addWorldbooks,
    removeWorldbook,
    toggleWorldbook,
    addMemories,
    removeMemory,
    toggleMemory,
    saveSummary,
    clearSummary,
    generateSummary,
    compressContext,
    computeContextWindowEstimate,
    loadMessageRevisions,
    loadOlderMessages,
    generateMemorySuggestions,
    saveMemorySuggestions,
    updateSuggestedMemoryStatus,
    refreshProviderBalance,
    isDemo,
    apiConfigured,
    providerLabel,
    modelLabel,
    runtimeMode,
    messageCount: state.messages.filter((message) => message.role !== "system").length,
    systemPrompt,
  };
}
