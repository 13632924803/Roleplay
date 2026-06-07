import { logger } from "../shared/lib/logger";
import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, ChevronDown, Drama, KeyRound, MessageCircle, Palette, Plus, RefreshCw, Settings, WifiOff, X } from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "../features/auth";
import { supabase } from "../features/auth/supabaseClient";
import { useChatSession, type MemorySuggestionDraft } from "../features/roleplay/hooks/useChatSession";
import { ContextPreview } from "../features/roleplay/components/chat/ContextPreview";
import { ChatInput } from "../features/roleplay/components/chat/ChatInput";
import { MessageBubble } from "../features/roleplay/components/chat/MessageBubble";
import { SessionList } from "../features/roleplay/components/chat/SessionList";
import { loadApiKey } from "../features/roleplay/storage/apiKeyStorage";
import { getEnabledConfig } from "../features/roleplay/storage/apiProviderConfigStorage";
import {
  getDefaultHostedCredential,
  saveHostedCredentialSelection,
  selectionFromCredential,
} from "../features/roleplay/services/hostedCredentialsService";
import { ModeBadge } from "../shared/components/ModeBadge";
import { SidebarCollapseButton } from "../shared/components/SidebarCollapseButton";
import { AppModal } from "../shared/components/AppModal";
import { useIsMobile } from "../shared/hooks/useMediaQuery";
import { usePersistentCollapsedState } from "../shared/hooks/usePersistentCollapsedState";
import * as Repo from "../features/roleplay/repositories/roleplayRepository";
import * as LocalRepo from "../features/roleplay/repositories/localRoleplayRepository";
import type { CharacterRow } from "../features/roleplay/types/database";
import type { ChatMessage } from "../features/roleplay/providers/provider.types";
import type { ApiKeyStorageMode, ProviderType } from "../features/roleplay/providers";

function detectProviderConfig(): {
  provider: ProviderType;
  model: string;
  storageMode: ApiKeyStorageMode;
  credentialId?: string | null;
  baseURL?: string;
} {
  // 1. Check new enabled config system first
  const enabled = getEnabledConfig();
  if (enabled && enabled.storageMode !== "hosted_encrypted") {
    return {
      provider: enabled.provider,
      model: enabled.model,
      storageMode: enabled.storageMode,
      baseURL: enabled.baseURL || undefined,
    };
  }
  if (enabled?.storageMode === "hosted_encrypted" && enabled.credentialId) {
    return {
      provider: enabled.provider,
      model: enabled.model,
      storageMode: "hosted_encrypted",
      credentialId: enabled.credentialId,
      baseURL: enabled.baseURL || undefined,
    };
  }

  // 2. Fallback: old direct API key checks for backward compatibility
  const local = loadApiKey("deepseek", "local_device");
  if (local) return { provider: "deepseek", model: local.model, storageMode: "local_device" };
  const session = loadApiKey("deepseek", "session_only");
  if (session) return { provider: "deepseek", model: session.model, storageMode: "session_only" };
  const oaiLocal = loadApiKey("openai_compatible", "local_device");
  if (oaiLocal) return { provider: "openai_compatible", model: oaiLocal.model, storageMode: "local_device" };
  const oaiSession = loadApiKey("openai_compatible", "session_only");
  if (oaiSession) return { provider: "openai_compatible", model: oaiSession.model, storageMode: "session_only" };

  return { provider: "deepseek", model: "deepseek-v4-flash", storageMode: "session_only" };
}

function MemorySuggestionModal({
  drafts,
  title,
  savingMode,
  onChange,
  onClose,
  onSave,
}: {
  drafts: MemorySuggestionDraft[];
  title: string;
  savingMode: "active" | "suggested" | null;
  onChange: (index: number, patch: Partial<MemorySuggestionDraft>) => void;
  onClose: () => void;
  onSave: (status: "active" | "suggested") => Promise<void>;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="theme-modal-overlay absolute inset-0" onClick={onClose} />
      <div className="neo-panel relative mx-4 flex max-h-[80vh] w-full max-w-2xl flex-col p-5">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold">{title}</h3>
            <p className="mt-0.5 text-xs text-ink-300">先预览并编辑候选记忆，再决定保存并启用，或放入记忆收件箱。</p>
          </div>
          <button onClick={onClose} className="rounded-full p-1 hover:bg-surface-100">
            <X className="h-4 w-4 text-ink-400" />
          </button>
        </div>
        <div className="scrollbar-none flex-1 space-y-3 overflow-y-auto pr-1">
          {drafts.map((draft, index) => (
            <div key={`${draft.title}-${index}`} className="neo-panel-soft p-3">
              <div className="mb-2 grid gap-2 sm:grid-cols-[1fr_140px_90px]">
                <input
                  type="text"
                  value={draft.title}
                  onChange={(event) => onChange(index, { title: event.target.value })}
                  className="rounded-input border border-surface-200 bg-surface-0/70 px-3 py-1.5 text-sm"
                  placeholder="记忆标题"
                />
                <select
                  value={draft.memory_type}
                  onChange={(event) => onChange(index, { memory_type: event.target.value as MemorySuggestionDraft["memory_type"] })}
                  className="rounded-input border border-surface-200 bg-surface-0/70 px-3 py-1.5 text-sm"
                >
                  <option value="event">剧情事件</option>
                  <option value="relationship">角色关系</option>
                  <option value="user_preference">用户偏好</option>
                  <option value="character_preference">角色偏好</option>
                  <option value="long_term">长期记忆</option>
                  <option value="short_term">短期记忆</option>
                  <option value="summary">摘要</option>
                </select>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={draft.salience}
                  onChange={(event) => onChange(index, { salience: Number(event.target.value) })}
                  className="rounded-input border border-surface-200 bg-surface-0/70 px-3 py-1.5 text-sm"
                />
              </div>
              <textarea
                value={draft.content}
                onChange={(event) => onChange(index, { content: event.target.value })}
                rows={3}
                className="w-full rounded-input border border-surface-200 bg-surface-0/70 px-3 py-2 text-sm"
                placeholder="记忆内容"
              />
              <p className="mt-1 text-xs text-ink-300">提炼理由：{draft.reason || "模型未提供"}</p>
            </div>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <button onClick={onClose} className="btn-ghost text-xs">
            取消
          </button>
          <button onClick={() => void onSave("suggested")} disabled={savingMode !== null} className="btn-ghost text-xs text-amber-700 disabled:opacity-50">
            {savingMode === "suggested" ? "保存中..." : "保存到收件箱"}
          </button>
          <button onClick={() => void onSave("active")} disabled={savingMode !== null} className="btn-primary text-xs disabled:opacity-50">
            {savingMode === "active" ? "保存中..." : "保存并启用"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function ChatRoomPage() {
  const isMobile = useIsMobile();
  const { isGuestOrDemo, user } = useAuth();
  const userId = user?.id;
  const [providerConfig, setProviderConfig] = useState(detectProviderConfig);
  const [sessionsCollapsed, toggleSessionsCollapsed] = usePersistentCollapsedState("roleplay.chat.sessions.collapsed", false);
  const [contextCollapsed, toggleContextCollapsed] = usePersistentCollapsedState("roleplay.chat.context.collapsed", false);

  useEffect(() => {
    setProviderConfig(detectProviderConfig());
  }, [userId]);

  useEffect(() => {
    if (isGuestOrDemo || !userId) return;
    if (providerConfig.storageMode === "hosted_encrypted" && providerConfig.credentialId) return;
    if (
      loadApiKey("deepseek", "local_device") ||
      loadApiKey("deepseek", "session_only") ||
      loadApiKey("openai_compatible", "local_device") ||
      loadApiKey("openai_compatible", "session_only")
    ) {
      return;
    }
    let cancelled = false;
    void getDefaultHostedCredential()
      .then((credential) => {
        if (!credential || cancelled) return;
        const selection = selectionFromCredential(credential);
        saveHostedCredentialSelection(selection);
        setProviderConfig({
          provider: selection.provider,
          model: selection.model,
          storageMode: "hosted_encrypted",
          credentialId: selection.credentialId,
          baseURL: selection.baseURL,
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isGuestOrDemo, providerConfig.credentialId, providerConfig.storageMode, userId]);

  const chat = useChatSession(
    isGuestOrDemo,
    userId,
    providerConfig.provider,
    providerConfig.model,
    providerConfig.storageMode,
    providerConfig.credentialId,
    providerConfig.baseURL,
  );

  const [inputValue, setInputValue] = useState("");
  const [showMobileSessions, setShowMobileSessions] = useState(false);
  const [showMobileContext, setShowMobileContext] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editText, setEditText] = useState("");
  const [showPicker, setShowPicker] = useState(false);
  const [pickerChars, setPickerChars] = useState<CharacterRow[]>([]);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [pickerError, setPickerError] = useState<string | null>(null);
  const [memoryDrafts, setMemoryDrafts] = useState<MemorySuggestionDraft[] | null>(null);
  const [memoryDraftTitle, setMemoryDraftTitle] = useState("AI 鎻愮偧璁板繂");
  const [memorySaveMode, setMemorySaveMode] = useState<"active" | "suggested" | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const prevMessageCountRef = useRef(0);
  const prevSessionIdRef = useRef<string | null>(null);
  const olderLoadHeightRef = useRef<number | null>(null);
  const [userScrolledUp, setUserScrolledUp] = useState(false);

  const loadPickerChars = useCallback(async () => {
    const chars = isGuestOrDemo || !supabase || !userId
      ? await LocalRepo.listActiveCharacters()
      : await Repo.listActiveCharacters(supabase, userId);
    setPickerChars(chars);
  }, [isGuestOrDemo, userId]);

  const debugCreateSession = useCallback((message: string, extra?: Record<string, unknown>) => {
    if (import.meta.env.DEV) {
      logger.info("[mobile-create-session]", message, extra ?? {});
    }
  }, []);

  const openCreateSessionDialog = useCallback(async (source: string) => {
    debugCreateSession("openCreateSessionDialog called", {
      source,
      sessions: chat.sessions.length,
      activeSessionId: chat.activeSessionId,
    });
    setPickerError(null);
    setPickerLoading(true);
    setShowMobileSessions(false);
    setShowPicker(true);
    try {
      await loadPickerChars();
      debugCreateSession("roles loaded", { count: pickerChars.length });
    } catch (error) {
      const message = error instanceof Error ? error.message : "角色列表加载失败，请稍后重试。";
      setPickerError(message);
      debugCreateSession("load roles failed", { message });
    } finally {
      setPickerLoading(false);
    }
  }, [chat.activeSessionId, chat.sessions.length, debugCreateSession, loadPickerChars, pickerChars.length]);

  function handleCreateSession() {
    void openCreateSessionDialog("generic");
  }

  function handleMobileSessionTrigger() {
    if (!chat.sessions.length) {
      void openCreateSessionDialog("mobile-header-empty");
      return;
    }
    setShowMobileSessions((value) => !value);
  }

  async function handleCreateSessionChoice(characterId?: string) {
    debugCreateSession("createSession selected", { characterId: characterId ?? null });
    try {
      await chat.createSession(characterId);
      setShowPicker(false);
      setShowMobileSessions(false);
      debugCreateSession("createSession success", { characterId: characterId ?? null });
    } catch (error) {
      const message = error instanceof Error ? error.message : "创建会话失败，请稍后重试。";
      setPickerError(message);
      debugCreateSession("createSession failed", { message });
    }
  }

  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;
    const handleScroll = () => {
      setUserScrolledUp(container.scrollHeight - container.scrollTop - container.clientHeight >= 80);
    };
    container.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
    return () => container.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    if (olderLoadHeightRef.current !== null) {
      const previousHeight = olderLoadHeightRef.current;
      olderLoadHeightRef.current = null;
      container.scrollTop = container.scrollHeight - previousHeight;
      prevMessageCountRef.current = chat.messages.length;
      prevSessionIdRef.current = chat.activeSessionId;
      return;
    }

    const sessionChanged = prevSessionIdRef.current !== chat.activeSessionId;
    const messageCountChanged = prevMessageCountRef.current !== chat.messages.length;
    if (sessionChanged) {
      messagesEndRef.current?.scrollIntoView({ behavior: "auto" });
    } else if (messageCountChanged && (!userScrolledUp || chat.isStreaming)) {
      messagesEndRef.current?.scrollIntoView({ behavior: chat.isStreaming ? "auto" : "smooth" });
    }

    prevMessageCountRef.current = chat.messages.length;
    prevSessionIdRef.current = chat.activeSessionId;
  }, [chat.activeSessionId, chat.isStreaming, chat.messages, userScrolledUp]);

  function scrollToBottom() {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    setUserScrolledUp(false);
  }

  async function handleLoadOlderMessages() {
    const container = messagesContainerRef.current;
    if (container) olderLoadHeightRef.current = container.scrollHeight;
    await chat.loadOlderMessages();
  }

  const hasActiveSession = !!chat.activeSessionId;

  function handleSend() {
    if (!inputValue.trim() || !hasActiveSession || chat.isStreaming) return;
    void chat.sendMessage(inputValue.trim());
    setInputValue("");
  }

  async function openMemorySuggestion(source?: { messageIndex?: number }) {
    if (!chat.isDemo && !chat.apiConfigured) {
      alert("请先配置 API。");
      return;
    }
    const drafts = await chat.generateMemorySuggestions(source);
    if (!drafts || drafts.length === 0) return;
    setMemoryDraftTitle(source?.messageIndex !== undefined ? "从单条消息提炼记忆" : "AI 提炼记忆");
    setMemoryDrafts(drafts);
  }

  async function saveMemoryDrafts(status: "active" | "suggested") {
    if (!memoryDrafts) return;
    setMemorySaveMode(status);
    await chat.saveMemorySuggestions(memoryDrafts, status);
    setMemorySaveMode(null);
    setMemoryDrafts(null);
  }

  const contextProps = {
    sessionTitle: chat.sessions.find((session) => session.id === chat.activeSessionId)?.title || "",
    messageCount: chat.messageCount,
    isDemo: chat.isDemo,
    providerLabel: chat.providerLabel,
    modelLabel: chat.modelLabel,
    apiConfigured: chat.apiConfigured,
    runtimeMode: chat.runtimeMode,
    isLocalMode: isGuestOrDemo,
    activeCharacter: chat.activeCharacter,
    activeTemplate: chat.activeTemplate,
    systemPrompt: chat.systemPrompt,
    lastContextOutput: chat.lastContextOutput,
    contextPreviewError: chat.contextPreviewError,
    sessionSummaryText: chat.summaryText,
    worldbookIds: chat.worldbookIds,
    memoryIds: chat.memoryIds,
    disabledWbIds: chat.disabledWbIds,
    disabledMemIds: chat.disabledMemIds,
    summaryEnabled: chat.summaryEnabled,
    suggestedMemories: chat.suggestedMemories,
    isGeneratingMemorySuggestions: chat.isGeneratingMemorySuggestions,
    activeBranchName: chat.activeBranchName,
    contextRunSaveStatus: chat.contextRunSaveStatus,
    latestUsage: chat.latestProviderUsage,
    latestCostEstimate: chat.latestCostEstimate,
    cacheDiag: chat.cacheDiag,
    cacheDiagHistory: chat.cacheDiagHistory,
    providerBalance: chat.providerBalance,
    isBalanceLoading: chat.isBalanceLoading,
    balanceError: chat.balanceError,
    onAddTemplate: chat.addTemplate,
    onRemoveTemplate: chat.removeTemplate,
    onAddWorldbooks: chat.addWorldbooks,
    onRemoveWorldbook: chat.removeWorldbook,
    onToggleWorldbook: chat.toggleWorldbook,
    onAddMemories: chat.addMemories,
    onRemoveMemory: chat.removeMemory,
    onToggleMemory: chat.toggleMemory,
    onGenerateMemorySuggestions: async () => {
      await openMemorySuggestion();
    },
    onUpdateSuggestedMemoryStatus: chat.updateSuggestedMemoryStatus,
    onSaveSummaryText: chat.saveSummary,
    onClearSummary: chat.clearSummary,
    onGenerateSummary: chat.generateSummary,
    onCompressContext: chat.compressContext,
    compressBusy: chat.compressBusy,
    compressPreview: chat.compressPreview,
    contextWindowEstimate: chat.contextWindowEstimate,
    contextTokenUsed: chat.lastContextOutput?.estimatedTokens,
    contextTokenLimit: chat.lastContextOutput?.budget?.budgetLimit,
    onRefreshBalance: chat.refreshProviderBalance,
  };

  function renderLoadOlderButton() {
    if (!hasActiveSession) return null;
    if (!chat.hasMoreMessages && chat.messages.length === 0) return null;
    return (
      <div className="mb-3 flex justify-center">
        {chat.hasMoreMessages ? (
          <button
            type="button"
            onClick={() => void handleLoadOlderMessages()}
            disabled={chat.isLoadingOlderMessages}
            className="btn-ghost text-xs disabled:opacity-50"
          >
            {chat.isLoadingOlderMessages ? "加载中..." : "加载更早消息"}
          </button>
        ) : (
          <span className="text-xs text-ink-300">已经加载到最早消息</span>
        )}
      </div>
    );
  }

  function renderMessageBubble(message: ChatMessage, index: number) {
    const dbId = chat.messageDbIds.get(index);
    const revisions = dbId ? chat.messageRevisions.get(dbId) : undefined;
    const revisionCount = dbId ? (chat.messageRevisionCounts.get(dbId) ?? 0) : 0;
    return (
      <MessageBubble
        key={dbId ?? `${message.role}-${index}`}
        message={message}
        index={index}
        isStreaming={chat.isStreaming && index === chat.messages.length - 1 && message.role === "assistant"}
        onCopy={() => chat.copyMessage(index)}
        onDelete={() => void chat.deleteMessage(index)}
        onRegenerate={message.role === "assistant" && index === chat.messages.length - 1 && !chat.isStreaming ? chat.regenerateLast : undefined}
        onEdit={message.role === "user" ? () => { setEditingIndex(index); setEditText(message.content); } : undefined}
        onExtractMemory={() => void openMemorySuggestion({ messageIndex: index })}
        revisionCount={revisionCount}
        revisions={revisions}
        onLoadRevisions={() => chat.loadMessageRevisions(index)}
      />
    );
  }

  const messageList = (
    <>
      {renderLoadOlderButton()}
      {chat.messages.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
          <div className="mb-4 text-ink-200">
            <MessageCircle className="h-10 w-10" />
          </div>
          {hasActiveSession ? (
            <>
              <h3 className="text-lg font-semibold text-ink-700">开始聊天</h3>
              <p className="mt-1.5 max-w-xs text-sm text-ink-300">
                {chat.isDemo
                  ? "本地模式，可直接使用本地预览回复。"
                  : chat.apiConfigured
                  ? "输入消息后就可以开始角色扮演。"
                  : "请先在设置中心启用 API 配置。"}
              </p>
            </>
          ) : (
            <>
              <h3 className="text-lg font-semibold text-ink-700">开始你的第一段对话</h3>
              <p className="mt-1.5 max-w-xs text-sm text-ink-300">
                {!chat.apiConfigured 
                  ? "连接 API 后才能使用真实模型回复，或者继续使用本地预览模式。"
                  : "先创建一个会话，选择角色后即可开始聊天。"}
              </p>
              <div className="mt-5 flex flex-col gap-3 max-w-xs w-full">
                {/* API configuration prompt - show first if not configured */}
                {!chat.apiConfigured && (
                  <div className="rounded-2xl border border-amber-200 bg-amber-light/30 p-4 text-left">
                    <div className="flex items-center gap-2 mb-2">
                      <KeyRound className="h-4 w-4 text-amber-500" />
                      <span className="text-sm font-semibold text-ink-800">先配置 API</span>
                    </div>
                    <p className="text-xs text-ink-500 mb-3">
                      连接 DeepSeek、OpenAI-compatible 或其他 Provider 后，才能使用真实模型回复。你也可以继续使用本地预览模式测试流程。
                    </p>
                    <div className="flex flex-col gap-2">
                      <Link to="/settings" className="btn-primary inline-flex items-center justify-center gap-2 py-2.5 text-sm">
                        <KeyRound className="h-4 w-4" />
                        去配置 API
                      </Link>
                      <button
                        onClick={handleCreateSession}
                        className="btn-ghost inline-flex items-center justify-center gap-2 py-2 text-sm"
                      >
                        继续本地预览
                      </button>
                    </div>
                  </div>
                )}
                
                {/* Session creation - show if API configured or as secondary option */}
                {chat.apiConfigured && (
                  <>
                    <button
                      onClick={handleCreateSession}
                      className="btn-primary inline-flex items-center justify-center gap-2 px-6 py-2.5 text-sm"
                    >
                      <Plus className="h-4 w-4" />
                      新建会话
                    </button>
                    <Link to="/studio" className="btn-ghost inline-flex items-center justify-center gap-2 px-6 py-2.5 text-sm">
                      <Palette className="h-4 w-4" />
                      去创作工坊创建角色
                    </Link>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      ) : (
        chat.messages.map((message, index) => renderMessageBubble(message, index))
      )}
      <div ref={messagesEndRef} />
    </>
  );

  const createSessionPickerModal = (
    <AppModal
      open={showPicker}
      onClose={() => {
        setShowPicker(false);
        setPickerError(null);
      }}
      title={pickerChars.length > 0 ? "选择聊天角色" : "还没有角色"}
      description={
        pickerChars.length > 0
          ? "选择一个角色开始新会话，也可以创建空白会话。"
          : "请先在创作工坊创建角色，然后再开始聊天。"
      }
      size="sm"
      footer={
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={() => {
              setShowPicker(false);
              setPickerError(null);
            }}
            className="neo-button rounded-[18px] px-4 py-2.5 text-sm text-ink-600"
          >
            取消
          </button>
          <button
            type="button"
            onClick={() => void handleCreateSessionChoice()}
            className="neo-button-primary rounded-[18px] px-4 py-2.5 text-sm"
          >
            不绑定角色，创建空白会话
          </button>
        </div>
      }
    >
      <div className="space-y-3">
        {pickerLoading ? (
          <div className="rounded-[24px] border border-sky-100/80 bg-sky-50/40 px-4 py-4 text-sm text-ink-500">
            正在加载角色列表...
          </div>
        ) : pickerError ? (
          <div className="rounded-[24px] border border-rose-100/80 bg-rose-50/60 px-4 py-4 text-sm text-rose-600">
            {pickerError}
          </div>
        ) : pickerChars.length > 0 ? (
          <>
            <div className="space-y-2">
              {pickerChars.map((character) => (
                <button
                  key={character.id}
                  type="button"
                  onClick={() => void handleCreateSessionChoice(character.id)}
                  className="neo-button flex w-full items-center gap-3 rounded-[22px] px-3 py-3 text-left"
                >
                  <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-[16px] bg-brand-50 text-sm text-brand-500">
                    {character.avatar_emoji || character.name[0]}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink-700">{character.name}</p>
                    <p className="truncate text-xs text-ink-400">
                      {String((character.card_json as Record<string, unknown>)?.identity ?? "") || "未填写身份设定"}
                    </p>
                  </div>
                </button>
              ))}
            </div>
            <Link
              to="/studio"
              onClick={() => setShowPicker(false)}
              className="neo-button inline-flex w-full items-center justify-center gap-2 rounded-[18px] px-4 py-3 text-sm text-ink-600"
            >
              <Palette className="h-4 w-4" />
              去创作工坊创建角色
            </Link>
          </>
        ) : (
          <div className="space-y-3 rounded-[24px] border border-amber-100/80 bg-amber-light/20 px-4 py-4">
            <p className="text-sm text-amber-700">当前还没有角色，请先创建角色，或直接创建空白会话。</p>
            <Link
              to="/studio"
              onClick={() => setShowPicker(false)}
              className="neo-button-primary inline-flex w-full items-center justify-center gap-2 rounded-[18px] px-4 py-3 text-sm"
            >
              <Palette className="h-4 w-4" />
              去创作工坊创建角色
            </Link>
          </div>
        )}
      </div>
    </AppModal>
  );

  if (isMobile) {
    return (
        <div className="mobile-bottom-nav-spacer flex h-dvh flex-col bg-surface-50 md:pb-0">
        <div className="theme-nav-shell flex items-center gap-2 rounded-none border-x-0 border-t-0 px-3 py-2.5">
          <button type="button" onClick={handleMobileSessionTrigger} className="flex items-center gap-1.5 rounded-lg bg-brand-50 px-3 py-1.5 text-xs font-medium text-brand-600 transition-colors hover:bg-brand-100">
            <Drama className="h-4 w-4" />
            <span>{chat.activeSessionId ? "会话" : "选择角色"}</span>
            <ChevronDown className="h-3 w-3" />
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-ink-900">
              {chat.activeSessionId
                ? chat.activeCharacter?.name || chat.sessions.find((session) => session.id === chat.activeSessionId)?.characterName || chat.sessions.find((session) => session.id === chat.activeSessionId)?.title || "空白会话"
                : "会话"}
            </p>
          </div>
          {providerConfig.storageMode === "hosted_encrypted" && (
            <span className="rounded-full bg-sky-100 px-1.5 py-0.5 text-[10px] text-sky-700">托管模式</span>
          )}
          <ModeBadge />
        </div>

        {showMobileSessions && (
          <div className="theme-page-shell absolute left-0 top-0 z-[60] flex h-dvh w-72 flex-col rounded-none border-y-0 border-l-0">
            <div className="flex items-center justify-between border-b p-3" style={{ borderColor: "var(--border-soft)" }}>
              <span className="text-sm font-medium">会话</span>
              <button type="button" onClick={() => setShowMobileSessions(false)} className="btn-ghost p-1 text-xs">关闭</button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <SessionList
                sessions={chat.sessions}
                activeSessionId={chat.activeSessionId}
                onSelect={(id) => {
                  void chat.selectSession(id);
                  setShowMobileSessions(false);
                }}
                onCreate={() => {
                  void openCreateSessionDialog("mobile-session-list");
                  setShowMobileSessions(false);
                }}
                onDelete={chat.deleteSession}
                loading={false}
              />
            </div>
            <div className="space-y-2 border-t p-3" style={{ borderColor: "var(--border-soft)" }}>
              <button
                type="button"
                onClick={() => {
                  void openCreateSessionDialog("mobile-session-drawer");
                  setShowMobileSessions(false);
                }}
                className="btn-primary flex w-full items-center justify-center gap-2 py-2.5 text-sm"
              >
                <Plus className="h-4 w-4" />
                新建会话
              </button>
              <Link
                to="/studio"
                onClick={() => setShowMobileSessions(false)}
                className="btn-ghost flex w-full items-center justify-center gap-2 py-2 text-xs"
              >
                <Palette className="h-3.5 w-3.5" />
                去创作工坊创建角色
              </Link>
            </div>
          </div>
        )}

        {showMobileContext && (
          <>
            {/* Backdrop */}
            <div
              className="theme-modal-overlay absolute inset-0 z-20"
              onClick={() => setShowMobileContext(false)}
            />
            {/* Bottom sheet */}
            <div className="theme-page-shell absolute inset-x-0 bottom-0 z-30 flex h-[88dvh] flex-col rounded-t-[24px] rounded-b-none">
              {/* Drag handle */}
              <div className="flex justify-center pt-3 pb-1">
                <div className="h-1 w-10 rounded-full bg-surface-200" />
              </div>
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-3">
                <div>
                  <h3 className="text-base font-semibold text-ink-900">上下文控制台</h3>
                  <p className="text-xs text-ink-400">角色、世界书、记忆与费用预览</p>
                </div>
                <button 
                  onClick={() => setShowMobileContext(false)} 
                  className="neo-button flex h-9 w-9 items-center justify-center rounded-full text-ink-400 hover:text-ink-600"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              {/* Content */}
              <div className="flex-1 overflow-y-auto pb-safe-bottom">
                <ContextPreview {...contextProps} />
              </div>
            </div>
          </>
        )}

        <div ref={messagesContainerRef} className="flex-1 overflow-y-auto px-3 py-4">
          {messageList}
          {userScrolledUp && (
            <button type="button" onClick={scrollToBottom} className="fixed bottom-28 left-1/2 z-10 -translate-x-1/2 rounded-full bg-brand-500 px-4 py-1.5 text-xs text-white shadow-elevated">
              回到底部
            </button>
          )}
        </div>

        {chat.error && (
          <div className="theme-status-danger flex items-center gap-2 border-t px-3 py-2">
            <AlertTriangle className="h-4 w-4 flex-shrink-0 text-rose-500" />
            <p className="flex-1 truncate text-xs text-rose-700">{chat.error}</p>
            <button type="button" onClick={() => void chat.retry()} className="btn-ghost flex items-center gap-1 text-xs text-rose-600">
              <RefreshCw className="h-3 w-3" />
              重试
            </button>
          </div>
        )}

        {!chat.isDemo && !chat.apiConfigured && (
          <div className="theme-status-warning flex items-center gap-2 border-t px-3 py-2">
            <WifiOff className="h-4 w-4 flex-shrink-0 text-amber-500" />
            <p className="flex-1 text-xs text-amber-700">请先配置 API Key</p>
            <Link to="/settings" className="btn-ghost text-xs text-amber-700">
              <Settings className="h-3 w-3" />
              设置
            </Link>
          </div>
        )}

        {editingIndex !== null && (
          <div className="theme-section-accent flex items-center gap-2 border-t px-3 py-2">
            <input
              type="text"
              value={editText}
              onChange={(event) => setEditText(event.target.value)}
              className="flex-1 rounded-input border border-brand-200 bg-surface-0/70 px-3 py-1.5 text-sm"
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  void chat.editAndResend(editingIndex, editText);
                  setEditingIndex(null);
                }
                if (event.key === "Escape") setEditingIndex(null);
              }}
            />
            <button type="button" onClick={() => { void chat.editAndResend(editingIndex, editText); setEditingIndex(null); }} className="btn-primary px-3 py-1 text-xs">重发</button>
            <button type="button" onClick={() => setEditingIndex(null)} className="btn-ghost text-xs">取消</button>
          </div>
        )}

        <ChatInput
          value={inputValue}
          onChange={setInputValue}
          onSend={handleSend}
          onStop={chat.stopGeneration}
          isStreaming={chat.isStreaming}
          disabled={!hasActiveSession || (!chat.isDemo && !chat.apiConfigured)}
          placeholder={!hasActiveSession ? "请先创建会话" : !chat.isDemo && !chat.apiConfigured ? "请先在设置中心启用 API 配置..." : "输入消息..."}
        />

        {memoryDrafts && (
          <MemorySuggestionModal
            drafts={memoryDrafts}
            title={memoryDraftTitle}
            savingMode={memorySaveMode}
            onClose={() => setMemoryDrafts(null)}
            onSave={saveMemoryDrafts}
            onChange={(index, patch) => {
              setMemoryDrafts((current) => {
                if (!current) return current;
                const next = [...current];
                next[index] = { ...next[index], ...patch };
                return next;
              });
            }}
          />
        )}
        {createSessionPickerModal}
      </div>
    );
  }

  return (
    <div className="flex h-full gap-3 p-3">
      <div className={`theme-sidebar-shell scrollbar-none flex-shrink-0 overflow-y-auto transition-all duration-200 ${sessionsCollapsed ? "w-16" : "w-64"}`}
        style={{ borderRadius: '24px' }}
      >
        {sessionsCollapsed ? (
          <div className="flex h-full flex-col items-center py-3">
            <button
              onClick={handleCreateSession}
              className="neo-button-pressed flex h-9 w-9 items-center justify-center rounded-xl text-brand-500 shadow-sm transition-colors"
              title="新建会话"
            >
              <Plus className="h-4 w-4" />
            </button>
            <div className="mt-3 flex-1 overflow-y-auto">
              {chat.sessions.slice(0, 8).map((session) => (
                <button
                  key={session.id}
                  onClick={() => void chat.selectSession(session.id)}
                  className={`mt-1.5 flex h-9 w-9 items-center justify-center rounded-xl transition-colors ${
                    session.id === chat.activeSessionId
                      ? "neo-button-pressed text-brand-600 shadow-sm"
                      : "text-ink-400 hover:bg-surface-100/60 hover:text-ink-600"
                  }`}
                  title={session.title}
                >
                  <span className="text-sm">
                    {session.characterEmoji || <MessageCircle className="h-4 w-4" />}
                  </span>
                </button>
              ))}
            </div>
            <div className="border-t border-sky-100/60 pt-2">
              <SidebarCollapseButton collapsed={sessionsCollapsed} onToggle={toggleSessionsCollapsed} side="left" />
            </div>
          </div>
        ) : (
          <div className="flex h-full flex-col">
            <div className="flex items-center justify-between border-b px-3 py-2.5" style={{ borderColor: "var(--border-soft)" }}>
              <span className="text-xs font-semibold uppercase tracking-wide text-brand-500">会话列表</span>
              <SidebarCollapseButton collapsed={sessionsCollapsed} onToggle={toggleSessionsCollapsed} side="left" />
            </div>
            <div className="flex-1 overflow-y-auto">
              <SessionList
                sessions={chat.sessions}
                activeSessionId={chat.activeSessionId}
                onSelect={chat.selectSession}
                onCreate={handleCreateSession}
                onDelete={chat.deleteSession}
                loading={false}
              />
            </div>
          </div>
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col justify-center">
        <div className="neo-page-shell mx-auto flex h-full w-full max-w-[1120px] flex-col overflow-hidden rounded-[34px]">
          <div className="theme-nav-shell flex items-center gap-3 rounded-none border-x-0 border-t-0 px-5 py-3">
          <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-brand-50 text-sm text-brand-500">
            {chat.activeCharacter?.avatar_emoji || <Drama className="h-4 w-4" />}
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-sm font-semibold text-ink-900">{chat.sessions.find((session) => session.id === chat.activeSessionId)?.title || "聊天房间"}</h1>
            {chat.activeCharacter && <p className="truncate text-xs text-brand-500">{chat.activeCharacter.name}</p>}
          </div>
          <div className="flex items-center gap-2">
            {providerConfig.storageMode === "hosted_encrypted" && (
              <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] text-sky-700">托管模式</span>
            )}
            {chat.saveStatus === "saving" && <span className="text-xs text-ink-300">淇濆瓨涓?..</span>}
            {chat.saveStatus === "saved" && <span className="text-xs text-emerald-500">已保存</span>}
            {chat.saveStatus === "error" && <span className="text-xs text-rose-500">淇濆瓨澶辫触</span>}
            <ModeBadge />
          </div>
        </div>

        <div ref={messagesContainerRef} className="scrollbar-none flex-1 overflow-y-auto px-5 py-5">
          <div className="mx-auto max-w-4xl">
            {messageList}
          </div>
          {userScrolledUp && (
            <button onClick={scrollToBottom} className="sticky bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-brand-500 px-4 py-1.5 text-xs text-white shadow-elevated">
              回到底部
            </button>
          )}
        </div>

        {chat.error && (
          <div className="theme-status-danger flex items-center gap-2 border-t px-4 py-2">
            <AlertTriangle className="h-4 w-4 text-rose-500" />
            <p className="flex-1 truncate text-xs text-rose-700">{chat.error}</p>
            <button onClick={() => void chat.retry()} className="btn-ghost text-xs text-rose-600">
              <RefreshCw className="h-3 w-3" />
              重试
            </button>
          </div>
        )}

        {!chat.isDemo && !chat.apiConfigured && (
          <div className="theme-status-warning flex items-center gap-2 border-t px-4 py-2">
            <WifiOff className="h-4 w-4 text-amber-500" />
            <p className="flex-1 text-xs text-amber-700">请先在设置中心启用 API 配置</p>
            <Link to="/settings" className="btn-ghost text-xs text-amber-700">
              <Settings className="h-3 w-3" />
              去设置
            </Link>
          </div>
        )}

        {editingIndex !== null && (
          <div className="theme-section-accent flex items-center gap-2 border-t px-4 py-2">
            <input
              type="text"
              value={editText}
              onChange={(event) => setEditText(event.target.value)}
              className="flex-1 rounded-input border border-brand-200 bg-surface-0/70 px-3 py-1.5 text-sm"
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  void chat.editAndResend(editingIndex, editText);
                  setEditingIndex(null);
                }
                if (event.key === "Escape") setEditingIndex(null);
              }}
              autoFocus
            />
            <button onClick={() => { void chat.editAndResend(editingIndex, editText); setEditingIndex(null); }} className="btn-primary px-3 py-1 text-xs">编辑重发</button>
            <button onClick={() => setEditingIndex(null)} className="btn-ghost text-xs">取消</button>
          </div>
        )}

        <div className="theme-nav-shell rounded-none border-x-0 border-b-0 px-5 py-4">
          <div className="mx-auto max-w-4xl">
            <ChatInput
              value={inputValue}
              onChange={setInputValue}
              onSend={handleSend}
              onStop={chat.stopGeneration}
              isStreaming={chat.isStreaming}
              disabled={!hasActiveSession || (!chat.isDemo && !chat.apiConfigured)}
              placeholder={!hasActiveSession ? "请先创建会话" : !chat.isDemo && !chat.apiConfigured ? "请先在设置中心启用 API 配置..." : "输入消息...（Enter 发送，Shift+Enter 换行）"}
            />
          </div>
        </div>
      </div>
    </div>

      <div className={`theme-sidebar-shell scrollbar-none flex-shrink-0 overflow-y-auto transition-all duration-200 ${contextCollapsed ? "w-12" : "w-80"}`}
        style={{ borderRadius: '24px' }}
      >
        {contextCollapsed ? (
          <div className="flex h-full flex-col items-center py-3">
            <SidebarCollapseButton 
              collapsed={contextCollapsed} 
              onToggle={toggleContextCollapsed} 
              side="right"
              floating
              ariaLabel="展开上下文控制台"
            />
          </div>
        ) : (
          <div className="flex h-full flex-col">
            <div className="flex items-center justify-between border-b px-3 py-2.5" style={{ borderColor: "var(--border-soft)" }}>
              <div>
                <span className="text-xs font-semibold text-ink-700">上下文</span>
                <p className="text-[10px] text-ink-400">角色设定与上下文控制台</p>
              </div>
              <SidebarCollapseButton 
                collapsed={contextCollapsed} 
                onToggle={toggleContextCollapsed} 
                side="right"
                ariaLabel="收起上下文控制台"
              />
            </div>
            <div className="flex-1 overflow-y-auto">
              <ContextPreview {...contextProps} />
            </div>
          </div>
        )}
      </div>

      {createSessionPickerModal}

      {memoryDrafts && (
        <MemorySuggestionModal
          drafts={memoryDrafts}
          title={memoryDraftTitle}
          savingMode={memorySaveMode}
          onClose={() => setMemoryDrafts(null)}
          onSave={saveMemoryDrafts}
          onChange={(index, patch) => {
            setMemoryDrafts((current) => {
              if (!current) return current;
              const next = [...current];
              next[index] = { ...next[index], ...patch };
              return next;
            });
          }}
        />
      )}
    </div>
  );
}
