import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import {
  BookOpen,
  Brain,
  Cpu,
  Eye,
  FileText,
  ListTree,
  Plus,
  RefreshCw,
  ToggleLeft,
  ToggleRight,
  Trash2,
  Wifi,
  WifiOff,
  X,
  Zap,
} from "lucide-react";
import type { CharacterRow, MemoryRow, PromptTemplateRow, WorldbookRow } from "../../types/database";
import type { ProviderBalanceSnapshot, ProviderCostEstimate, ProviderUsage } from "../../providers/provider.types";
import { parseCharacterCard } from "../../utils/characterPrompt";
import { buildCacheHealthSummary, type CacheDiagnostics, type CacheDiagnosticsRecord, type CacheHealthLevel, type CacheHealthSummary, type ContextBuildOutput } from "../../context/contextBuilder";
import { estimateTokens } from "../../context/tokenBudget";
import { supabase } from "../../../auth/supabaseClient";
import * as Repo from "../../repositories/roleplayRepository";
import * as LocalRepo from "../../repositories/localRoleplayRepository";
import { ContextSectionCard } from "../../../../shared/components/ContextSectionCard";
import { AppModal } from "../../../../shared/components/AppModal";

interface ContextPreviewProps {
  sessionTitle: string;
  messageCount: number;
  isDemo: boolean;
  isLocalMode: boolean;
  providerLabel: string;
  modelLabel: string;
  apiConfigured: boolean;
  runtimeMode: string;
  activeCharacter: CharacterRow | null;
  activeTemplate: PromptTemplateRow | null;
  systemPrompt: string | null;
  lastContextOutput?: ContextBuildOutput | null;
  contextPreviewError?: string | null;
  sessionSummaryText?: string;
  worldbookIds: string[];
  memoryIds: string[];
  disabledWbIds: string[];
  disabledMemIds: string[];
  summaryEnabled: boolean;
  suggestedMemories: MemoryRow[];
  isGeneratingMemorySuggestions?: boolean;
  activeBranchName?: string | null;
  contextRunSaveStatus?: "idle" | "saved" | "failed" | null;
  latestUsage?: ProviderUsage | null;
  latestCostEstimate?: ProviderCostEstimate | null;
  cacheDiag?: CacheDiagnostics | null;
  cacheDiagHistory?: CacheDiagnosticsRecord[];
  providerBalance?: ProviderBalanceSnapshot | null;
  isBalanceLoading?: boolean;
  balanceError?: string | null;
  onAddTemplate: (id: string) => Promise<void>;
  onRemoveTemplate: () => Promise<void>;
  onAddWorldbooks: (ids: string[]) => Promise<void>;
  onRemoveWorldbook: (id: string) => Promise<void>;
  onToggleWorldbook: (id: string) => Promise<void>;
  onAddMemories: (ids: string[]) => Promise<void>;
  onRemoveMemory: (id: string) => Promise<void>;
  onToggleMemory: (id: string) => Promise<void>;
  onGenerateMemorySuggestions: () => Promise<void>;
  onUpdateSuggestedMemoryStatus: (memoryId: string, status: "active" | "disabled" | "deleted") => Promise<void>;
  onSaveSummaryText: (text: string) => Promise<void>;
  onClearSummary: () => Promise<void>;
  onGenerateSummary: () => Promise<string | null>;
  onCompressContext: () => Promise<string | null>;
  compressBusy?: boolean;
  compressPreview?: string | null;
  contextWindowEstimate?: import("../../context/contextBuilder").ContextWindowEstimate | null;
  contextTokenUsed?: number;
  contextTokenLimit?: number;
  onRefreshBalance: () => Promise<void>;
}

function PickerModal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="theme-modal-overlay absolute inset-0" onClick={onClose} />
      <div className="neo-panel relative mx-4 flex max-h-[72vh] w-full max-w-sm flex-col p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold">{title}</h3>
          <button onClick={onClose} className="rounded-full p-1 hover:bg-surface-100">
            <X className="h-4 w-4 text-ink-400" />
          </button>
        </div>
        <div className="scrollbar-none flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

export function ContextPreview(props: ContextPreviewProps) {
  const {
    sessionTitle,
    messageCount,
    isDemo,
    isLocalMode,
    providerLabel,
    modelLabel,
    apiConfigured,
    runtimeMode,
    activeCharacter,
    activeTemplate,
    systemPrompt,
    lastContextOutput,
    contextPreviewError,
    sessionSummaryText,
    worldbookIds,
    memoryIds,
    disabledWbIds,
    disabledMemIds,
    summaryEnabled,
    suggestedMemories,
    isGeneratingMemorySuggestions,
    activeBranchName,
    contextRunSaveStatus,
    latestUsage,
    latestCostEstimate,
    cacheDiag,
    cacheDiagHistory,
    providerBalance,
    isBalanceLoading,
    balanceError,
    onAddTemplate,
    onRemoveTemplate,
    onAddWorldbooks,
    onRemoveWorldbook,
    onToggleWorldbook,
    onAddMemories,
    onRemoveMemory,
    onToggleMemory,
    onGenerateMemorySuggestions,
    onUpdateSuggestedMemoryStatus,
    onSaveSummaryText,
    onClearSummary,
    onGenerateSummary,
    onCompressContext,
    compressBusy,
    compressPreview,
    contextWindowEstimate,
    contextTokenUsed,
    contextTokenLimit,
    onRefreshBalance,
  } = props;

  const card = activeCharacter ? parseCharacterCard(activeCharacter) : null;
  const finalPrompt = lastContextOutput?.systemPrompt || systemPrompt || "";
  const healthSummary: CacheHealthSummary = buildCacheHealthSummary(cacheDiagHistory ?? []);
  const healthLabels: Record<CacheHealthLevel, string> = { excellent: "优秀", good: "良好", warning: "注意", poor: "较差", unknown: "数据不足" };
  const healthColorClasses: Record<CacheHealthLevel, string> = { excellent: "bg-emerald-50 text-emerald-700", good: "bg-sky-50 text-sky-700", warning: "bg-amber-50 text-amber-700", poor: "bg-rose-50 text-rose-700", unknown: "bg-surface-100 text-ink-500" };
  const injectedHits = lastContextOutput?.triggerResult.triggered.filter((hit) => hit.injected) ?? [];
  const skippedEntries = lastContextOutput?.triggerResult.skipped ?? [];
  const injectedMemoryIds = new Set(lastContextOutput?.budget.memories.map((memory) => memory.id) ?? []);

  const [showTplPicker, setShowTplPicker] = useState(false);
  const [showWbPicker, setShowWbPicker] = useState(false);
  const [showMemPicker, setShowMemPicker] = useState(false);
  const [showSummaryEditor, setShowSummaryEditor] = useState(false);
  const [compressionOpen, setCompressionOpen] = useState<"confirm" | "generating" | "preview" | "error" | "success" | null>(null);
  const [compressionEditText, setCompressionEditText] = useState("");
  const [compressionErrorMsg, setCompressionErrorMsg] = useState("");
  const [pickerTpls, setPickerTpls] = useState<PromptTemplateRow[]>([]);
  const [pickerWbs, setPickerWbs] = useState<WorldbookRow[]>([]);
  const [pickerMems, setPickerMems] = useState<MemoryRow[]>([]);
  const [selectedWbIds, setSelectedWbIds] = useState<Set<string>>(new Set());
  const [selectedMemIds, setSelectedMemIds] = useState<Set<string>>(new Set());
  const [wbNames, setWbNames] = useState<Map<string, string>>(new Map());
  const [memInfos, setMemInfos] = useState<Map<string, MemoryRow>>(new Map());
  const [summaryDraft, setSummaryDraft] = useState(sessionSummaryText || "");
  const [generatedPreview, setGeneratedPreview] = useState(false);
  const [generatingSummary, setGeneratingSummary] = useState(false);

  useEffect(() => {
    setSummaryDraft(sessionSummaryText || "");
  }, [sessionSummaryText]);

  const loadPickers = useCallback(async () => {
    const [templates, worldbooks, memories] = await (isLocalMode
      ? Promise.all([
          LocalRepo.listPromptTemplates(),
          LocalRepo.listWorldbooks(),
          LocalRepo.listMemories(),
        ])
      : !supabase || !activeCharacter?.user_id
        ? Promise.resolve([[] as PromptTemplateRow[], [] as WorldbookRow[], [] as MemoryRow[]])
        : Promise.all([
            Repo.listPromptTemplates(supabase, activeCharacter.user_id),
            Repo.listWorldbooks(supabase, activeCharacter.user_id),
            Repo.listMemories(supabase, activeCharacter.user_id),
          ]));
    setPickerTpls(templates);
    setPickerWbs(worldbooks);
    setPickerMems(memories.filter((memory) => memory.status === "active"));
  }, [activeCharacter?.user_id, isLocalMode]);

  useEffect(() => {
    if (worldbookIds.length === 0) {
      setWbNames(new Map());
      return;
    }
    const loader = isLocalMode
      ? Promise.all(worldbookIds.map((id) => LocalRepo.getWorldbook(id).catch(() => null)))
      : !supabase
        ? Promise.resolve([])
        : Promise.all(worldbookIds.map((id) => Repo.getWorldbook(supabase!, id).catch(() => null)));
    loader
      .then((rows) => {
        const names = new Map<string, string>();
        rows.forEach((row) => {
          if (row) names.set(row.id, row.name);
        });
        setWbNames(names);
      })
      .catch(() => setWbNames(new Map()));
  }, [isLocalMode, worldbookIds]);

  useEffect(() => {
    if (memoryIds.length === 0) {
      setMemInfos(new Map());
      return;
    }
    const loader = isLocalMode
      ? LocalRepo.listMemories()
      : !supabase || !activeCharacter?.user_id
        ? Promise.resolve([])
        : Repo.listMemories(supabase, activeCharacter.user_id);
    loader
      .then((rows) => {
        const infos = new Map<string, MemoryRow>();
        rows.forEach((row) => {
          if (memoryIds.includes(row.id)) infos.set(row.id, row);
        });
        setMemInfos(infos);
      })
      .catch(() => setMemInfos(new Map()));
  }, [activeCharacter?.user_id, isLocalMode, memoryIds]);

  const statusRows = [
    { label: "会话", value: sessionTitle || "未选择", icon: <Cpu className="h-4 w-4" /> },
    { label: "分支", value: activeBranchName || "主线", icon: <ListTree className="h-4 w-4" /> },
    { label: "Provider", value: providerLabel, icon: <Cpu className="h-4 w-4" /> },
    { label: "模型", value: modelLabel, icon: <Zap className="h-4 w-4" /> },
    { label: "运行", value: runtimeMode, icon: <Cpu className="h-4 w-4" /> },
    { label: "API", value: isDemo ? "本地预览" : apiConfigured ? "已配置" : "未配置", icon: apiConfigured ? <Wifi className="h-4 w-4" /> : <WifiOff className="h-4 w-4" /> },
  ];

  const isDeepSeek = !isDemo && providerLabel.toLowerCase().includes("deepseek");
  const usageAvailable = latestUsage?.usageAvailable;
  const currentContextTokens = lastContextOutput?.estimatedTokens ?? null;
  const contextWindowLimit = isDeepSeek ? 1_000_000 : (lastContextOutput?.budget.budgetLimit ?? null);
  const contextUsageRate =
    currentContextTokens !== null && contextWindowLimit && contextWindowLimit > 0
      ? currentContextTokens / contextWindowLimit
      : null;
  const contextWindowStatus =
    contextUsageRate === null
      ? "未知"
      : contextUsageRate < 0.7
        ? "正常"
        : contextUsageRate < 0.9
          ? "接近上限"
          : "建议压缩";

  function formatToken(value?: number) {
    return typeof value === "number" ? value.toLocaleString("zh-CN") : "未返回";
  }

  function formatPercent(value?: number) {
    return typeof value === "number" ? `${(value * 100).toFixed(1)}%` : "未返回";
  }

  function formatUsd(value?: number) {
    return typeof value === "number" ? `$${value.toFixed(6)}` : "未返回";
  }

  return (
    <div className="flex h-full flex-col">
      <div className="theme-nav-shell rounded-none border-x-0 border-t-0 px-4 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-brand-50 to-sky-50 text-brand-500 shadow-sm">
            <Cpu className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-ink-800">上下文控制台</h3>
            <p className="text-[11px] text-ink-400">
              {contextPreviewError ? "预览失败，可继续聊天" : lastContextOutput?.debugInfo ? `${lastContextOutput.debugInfo.buildTimeMs}ms · ${lastContextOutput.estimatedTokens}/${lastContextOutput.budget.budgetLimit} tok` : "构建中..."}
            </p>
          </div>
        </div>
      </div>

      <div className="scrollbar-none flex-1 overflow-y-auto px-2 py-2">
        {/* Status rows */}
        <div className="neo-panel mb-3 space-y-2 p-3">
          {statusRows.map((row) => (
            <div key={row.label} className="neo-panel-soft flex min-h-[40px] items-center justify-between px-3 py-2">
              <div className="flex min-w-0 items-center gap-2">
                <span className="text-sky-400">{row.icon}</span>
                <span className="truncate text-[11px] text-ink-500">{row.label}</span>
              </div>
              <span className="neo-pill ml-2 max-w-[140px] flex-shrink-0 truncate text-right font-mono text-[11px] text-ink-400">
                {row.value}
              </span>
            </div>
          ))}
        </div>

        {activeCharacter && (
          <ContextSectionCard
            title={`角色: ${activeCharacter.name}${activeCharacter.deleted_at ? "（已删除角色）" : ""}`}
            icon={<Cpu className="h-3.5 w-3.5 text-brand-400" />}
            defaultOpen
            variant="active"
          >
            <div className="space-y-1.5 pb-1 text-xs text-ink-400">
              {card?.identity && <p>身份：{card.identity}</p>}
              {card?.personality && <p className="line-clamp-2">性格：{card.personality}</p>}
              {card?.relationship && (
                <p>
                  关系：{card.relationship}
                  {card.relationship_stage ? ` · ${card.relationship_stage}` : ""}
                </p>
              )}
            </div>
          </ContextSectionCard>
        )}

        <ContextSectionCard title="提示词模板" icon={<FileText className="h-3.5 w-3.5 text-emerald-400" />} badge={activeTemplate ? activeTemplate.title : "未添加"}>
          {activeTemplate ? (
            <div className="pb-1">
              <p className="mb-1 line-clamp-2 text-xs text-ink-400">{activeTemplate.content.slice(0, 120)}</p>
              <button onClick={onRemoveTemplate} className="neo-button inline-flex items-center gap-1 rounded-[16px] px-2.5 py-1.5 text-xs text-rose-500">
                <Trash2 className="h-3 w-3" />
                移除模板
              </button>
            </div>
          ) : (
            <p className="pb-1 text-xs text-ink-300">未添加模板，当前仅使用角色基础设定。</p>
          )}
          <button
            onClick={() => {
              void loadPickers();
              setShowTplPicker(true);
            }}
            className="neo-button inline-flex items-center gap-1 rounded-[16px] px-2.5 py-1.5 text-xs text-brand-500"
          >
            <Plus className="h-3 w-3" />
            添加模板
          </button>
        </ContextSectionCard>

        <ContextSectionCard title="世界书" icon={<BookOpen className="h-3.5 w-3.5 text-sky-400" />} badge={`${worldbookIds.length} 个`}>
          {worldbookIds.length === 0 ? (
            <p className="pb-1 text-xs text-ink-300">未添加世界书。</p>
          ) : (
            <div className="space-y-2 pb-1">
              {worldbookIds.map((id) => {
                const disabled = disabledWbIds.includes(id);
                const hits = injectedHits.filter((hit) => hit.entry.worldbook_id === id);
                return (
                  <div key={id} className={`neo-panel-soft p-2 ${disabled ? "opacity-55" : hits.length ? "ring-1 ring-sky-200/60" : ""}`}>
                    <div className="flex items-center gap-2">
                      <button onClick={() => void onToggleWorldbook(id)} className="flex-shrink-0">
                        {disabled ? <ToggleLeft className="h-4 w-4 text-ink-300" /> : <ToggleRight className="h-4 w-4 text-sky-500" />}
                      </button>
                      <span className="flex-1 truncate text-xs text-ink-600">{wbNames.get(id) || id.slice(0, 8)}</span>
                      {hits.length > 0 && <span className="neo-pill bg-sky-50/80 text-[10px] text-sky-600">命中</span>}
                      <button onClick={() => void onRemoveWorldbook(id)} className="p-0.5 text-ink-300 hover:text-rose-500">
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                    {hits.map((hit) => (
                      <p key={hit.entry.id} className="mt-1 pl-6 text-xs text-sky-700">
                        {hit.entry.title} · 关键词：{hit.matchedKeywords.join("、") || "已注入"}
                      </p>
                    ))}
                  </div>
                );
              })}
              {lastContextOutput && injectedHits.length === 0 && <p className="text-xs text-ink-300">本轮暂无命中条目。</p>}
            </div>
          )}
          <button
            onClick={() => {
              void loadPickers();
              setSelectedWbIds(new Set());
              setShowWbPicker(true);
            }}
            className="neo-button inline-flex items-center gap-1 rounded-[16px] px-2.5 py-1.5 text-xs text-brand-500"
          >
            <Plus className="h-3 w-3" />
            添加世界书
          </button>
        </ContextSectionCard>

        <ContextSectionCard title="记忆" icon={<Brain className="h-3.5 w-3.5 text-amber-400" />} badge={`${memoryIds.length} 条`}>
          {memoryIds.length === 0 ? (
            <p className="pb-1 text-xs text-ink-300">未添加记忆。</p>
          ) : (
            <div className="space-y-2 pb-1">
              {memoryIds.map((id) => {
                const info = memInfos.get(id);
                const disabled = disabledMemIds.includes(id);
                const injected = injectedMemoryIds.has(id);
                const reason = disabled ? "未启用" : injected ? "已注入本轮上下文" : "未注入，可能超出 token 预算";
                return (
                  <div key={id} className={`neo-panel-soft p-2 ${disabled ? "opacity-60" : injected ? "ring-1 ring-amber-200/60" : ""}`}>
                    <div className="flex items-center gap-2">
                      <button onClick={() => void onToggleMemory(id)} className="flex-shrink-0">
                        {disabled ? <ToggleLeft className="h-4 w-4 text-ink-300" /> : <ToggleRight className="h-4 w-4 text-amber-500" />}
                      </button>
                      <span className="flex-1 truncate text-xs text-ink-600">{info?.title || id.slice(0, 8)}</span>
                      <span className={`neo-pill text-[10px] ${disabled ? "bg-slate-100/80 text-ink-300" : injected ? "bg-amber-50/90 text-amber-700" : "bg-white/80 text-ink-400"}`}>
                        {disabled ? "未启用" : injected ? "已注入" : "未注入"}
                      </span>
                      <button onClick={() => void onRemoveMemory(id)} className="p-0.5 text-ink-300 hover:text-rose-500">
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                    <p className="pl-6 pt-1 text-[11px] text-ink-400">{reason}</p>
                  </div>
                );
              })}
            </div>
          )}
          <div className="flex flex-wrap gap-1.5 pb-2">
            <button
              onClick={() => {
                void loadPickers();
                setSelectedMemIds(new Set());
                setShowMemPicker(true);
              }}
              className="neo-button inline-flex items-center gap-1 rounded-[16px] px-2.5 py-1.5 text-xs text-brand-500"
            >
              <Plus className="h-3 w-3" />
              添加记忆
            </button>
            <button
              onClick={() => {
                void onGenerateMemorySuggestions();
              }}
              disabled={!apiConfigured || !!isGeneratingMemorySuggestions}
              className="neo-button inline-flex items-center gap-1 rounded-[16px] px-2.5 py-1.5 text-xs text-amber-600 disabled:opacity-50"
            >
              <RefreshCw className={`h-3 w-3 ${isGeneratingMemorySuggestions ? "animate-spin" : ""}`} />
              {isGeneratingMemorySuggestions ? "提炼中..." : "AI 提炼记忆"}
            </button>
          </div>
          <div className="space-y-2 pb-1">
            {suggestedMemories.length === 0 ? (
              <p className="text-xs text-ink-300">暂无待确认记忆。候选记忆不会自动注入，确认后才会启用。</p>
            ) : (
              suggestedMemories.map((memory) => (
                <div key={memory.id} className="neo-panel-soft border-amber-200/60 bg-amber-light/20 p-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium text-ink-600">{memory.title || "未命名候选记忆"}</p>
                      <p className="mt-0.5 line-clamp-2 text-[11px] text-ink-400">{memory.content}</p>
                    </div>
                    <span className="neo-pill bg-white/85 px-1.5 py-0.5 text-[10px] text-amber-700">suggested</span>
                  </div>
                  <p className="mt-1 text-[11px] text-ink-400">待确认记忆不会注入最终 System Prompt。</p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    <button onClick={() => void onUpdateSuggestedMemoryStatus(memory.id, "active")} className="neo-button-primary rounded-[14px] px-2.5 py-1.5 text-[11px]">
                      接受并启用
                    </button>
                    <button onClick={() => void onUpdateSuggestedMemoryStatus(memory.id, "disabled")} className="neo-button rounded-[14px] px-2.5 py-1.5 text-[11px] text-ink-500">
                      忽略
                    </button>
                    <button onClick={() => void onUpdateSuggestedMemoryStatus(memory.id, "deleted")} className="neo-button rounded-[14px] px-2.5 py-1.5 text-[11px] text-rose-500">
                      删除
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </ContextSectionCard>

        
        {/* ── Context Window Status ── */}
        <ContextSectionCard
          title="上下文窗口"
          icon={<Cpu className="h-3.5 w-3.5 text-ink-400" />}
          badge={(() => {
            const est = contextWindowEstimate;
            if (!est || est.status === "unknown") return "预览";
            if (est.status === "should_compress") return `建议压缩 ${est.usageRatio ? Math.round(est.usageRatio * 100) + "%" : ""}`;
            if (est.status === "near_limit") return `接近上限 ${est.usageRatio ? Math.round(est.usageRatio * 100) + "%" : ""}`;
            return `正常 ${est.usageRatio ? Math.round(est.usageRatio * 100) + "%" : ""}`;
          })()}
          level={2}
        >
          <div className="space-y-2 pb-1 text-xs text-ink-400">
            {(contextWindowEstimate && contextWindowEstimate.estimatedTokens !== undefined) ? (
              <>
                <div className="stats-chip flex items-center justify-between">
                  <span>当前用量</span>
                  <span>{formatToken(contextWindowEstimate.estimatedTokens)} / {formatToken(contextWindowEstimate.modelLimit)} tok ({contextWindowEstimate.usageRatio ? Math.round(contextWindowEstimate.usageRatio * 100) : 0}%)</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-surface-200">
                  <div className={`h-full rounded-full transition-all ${(contextWindowEstimate.usageRatio ?? 0) >= 0.7 ? "bg-rose-400" : (contextWindowEstimate.usageRatio ?? 0) >= 0.5 ? "bg-amber-400" : "bg-emerald-400"}`}
                    style={{ width: `${Math.min(100, Math.round((contextWindowEstimate.usageRatio ?? 0) * 100))}%` }} />
                </div>

                {contextWindowEstimate.reason && (
                  <p className={`text-[11px] ${(contextWindowEstimate.usageRatio ?? 0) >= 0.7 ? "text-amber-600" : "text-ink-300"}`}>{contextWindowEstimate.reason}</p>
                )}

                {contextWindowEstimate.oldMessagesCount !== undefined && (
                  <div className="grid gap-1 sm:grid-cols-2">
                    <div className="stats-chip flex items-center justify-between"><span>可压缩</span><span>{contextWindowEstimate.oldMessagesCount} 条 · {formatToken(contextWindowEstimate.oldMessagesTokens)} tok</span></div>
                    <div className="stats-chip flex items-center justify-between"><span>保留最近</span><span>{contextWindowEstimate.recentMessagesCount ?? 20} 条</span></div>
                  </div>
                )}

                <button
                  onClick={() => {
                    if (compressBusy) return;
                    const est = contextWindowEstimate;
                    if (!est?.canCompress) {
                      setCompressionErrorMsg(est?.reason || "当前会话暂不需要压缩。");
                      setCompressionOpen("error");
                      return;
                    }
                    setCompressionOpen("confirm");
                  }}
                  disabled={compressBusy}
                  className={`neo-button flex w-full items-center justify-center gap-1.5 rounded-[16px] px-3 py-2 text-xs font-medium transition-all ${
                    (contextTokenUsed && contextTokenLimit && contextTokenUsed / contextTokenLimit >= 0.5)
                      ? "text-brand-600 hover:text-brand-700"
                      : "text-ink-400"
                  }`}
                >
                  {compressBusy ? (
                    <>
                      <RefreshCw className="h-3 w-3 animate-spin" />
                      压缩中...
                    </>
                  ) : (
                    <>手动压缩上下文</>
                  )}
                </button>

                {compressPreview && (
                  <div className="stats-chip flex items-center justify-between">
                    <span className="text-ink-400">最近生成摘要</span>
                    <button onClick={() => { setCompressionEditText(compressPreview); setCompressionOpen("preview"); }}
                      className="text-[11px] text-brand-500 hover:text-brand-600">查看</button>
                  </div>
                )}
              </>
            ) : (
              <p>发送消息后将显示上下文用量估算。</p>
            )}
          </div>
        </ContextSectionCard>

        <ContextSectionCard title="会话摘要" icon={<ListTree className="h-3.5 w-3.5 text-ink-400" />} badge={summaryEnabled ? "已启用" : "未启用"}>
          {showSummaryEditor ? (
            <div className="pb-2">
              <p className="mb-2 text-xs text-ink-300">
                {generatedPreview ? "AI 生成摘要预览，可编辑。点击保存后启用。" : "可以手动编辑摘要，也可以点击 AI 生成摘要。"}
              </p>
              <textarea
                value={summaryDraft}
                onChange={(event) => setSummaryDraft(event.target.value)}
                placeholder="摘要内容..."
                rows={4}
                className="mb-2 w-full resize-y rounded-input border border-surface-200 bg-surface-50 px-3 py-1.5 text-xs"
              />
              <div className="flex flex-wrap gap-1.5">
                <button
                  onClick={async () => {
                    if (!apiConfigured) {
                      alert("未配置 API Key，无法生成摘要。");
                      return;
                    }
                    setGeneratingSummary(true);
                    const result = await onGenerateSummary();
                    setGeneratingSummary(false);
                    if (result) {
                      setSummaryDraft(result);
                      setGeneratedPreview(true);
                    }
                  }}
                  disabled={generatingSummary}
                  className="neo-button inline-flex items-center gap-1 rounded-[16px] px-2.5 py-1.5 text-xs text-brand-500"
                >
                  <RefreshCw className={`h-3 w-3 ${generatingSummary ? "animate-spin" : ""}`} />
                  {generatingSummary ? "生成中..." : "AI 生成摘要"}
                </button>
                <button
                  onClick={async () => {
                    await onSaveSummaryText(summaryDraft);
                    setGeneratedPreview(false);
                    setShowSummaryEditor(false);
                  }}
                  className="btn-primary px-2 py-1 text-xs"
                >
                  保存并启用
                </button>
                <button
                  onClick={async () => {
                    await onSaveSummaryText("");
                    setSummaryDraft("");
                    setGeneratedPreview(false);
                    setShowSummaryEditor(false);
                  }}
                  className="neo-button rounded-[16px] px-2.5 py-1.5 text-xs text-amber-600"
                >
                  关闭摘要
                </button>
                <button
                  onClick={async () => {
                    await onClearSummary();
                    setSummaryDraft("");
                    setGeneratedPreview(false);
                    setShowSummaryEditor(false);
                  }}
                  className="neo-button rounded-[16px] px-2.5 py-1.5 text-xs text-rose-500"
                >
                  清空摘要
                </button>
              </div>
            </div>
          ) : (
            <div className="pb-1">
              {summaryEnabled && sessionSummaryText ? (
                <>
                  <p className="mb-1 text-xs text-emerald-600">摘要已启用，将从下一条消息开始注入。</p>
                  <p className="mb-1 line-clamp-3 text-xs text-ink-400">{sessionSummaryText}</p>
                </>
              ) : (
                <p className="mb-1 text-xs text-ink-300">
                  暂无会话摘要。点击 AI 生成摘要，会根据当前聊天记录生成一段可编辑摘要；保存后将从下一轮开始注入上下文。
                </p>
              )}
              <button
                onClick={() => {
                  setSummaryDraft(sessionSummaryText || "");
                  setGeneratedPreview(false);
                  setShowSummaryEditor(true);
                }}
                className="neo-button inline-flex items-center gap-1 rounded-[16px] px-2.5 py-1.5 text-xs text-brand-500"
              >
                <Plus className="h-3 w-3" />
                AI 生成摘要
              </button>
            </div>
          )}
        </ContextSectionCard>

        <div className="px-1 pt-1">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-300">高级信息</p>
        </div>
        <ContextSectionCard title="Debug" icon={<Cpu className="h-3.5 w-3.5 text-ink-400" />} badge={lastContextOutput ? `${injectedHits.length} 命中` : "预览"} level={3} variant="debug">
          <div className="space-y-2 pb-1 text-xs text-ink-400">
            {contextRunSaveStatus !== null && (
              <div>
                <p className="font-medium text-ink-500">Context Run 持久化</p>
                <p className={contextRunSaveStatus === "saved" ? "text-emerald-500" : contextRunSaveStatus === "failed" ? "text-rose-500" : "text-ink-300"}>
                  {contextRunSaveStatus === "saved" ? "已保存" : contextRunSaveStatus === "failed" ? "保存失败" : "保存中..."}
                </p>
              </div>
            )}
            <div>
              <p className="font-medium text-ink-500">已添加的世界书</p>
              <p>{worldbookIds.length ? worldbookIds.map((id) => wbNames.get(id) || id.slice(0, 8)).join("、") : "无"}</p>
            </div>
            <div>
              <p className="font-medium text-ink-500">本轮命中的条目</p>
              {injectedHits.length ? injectedHits.map((hit) => <p key={hit.entry.id}>{hit.entry.title} · 关键词：{hit.matchedKeywords.join("、") || "无"}</p>) : <p>无</p>}
            </div>
            {skippedEntries.length > 0 && (
              <details>
                <summary className="cursor-pointer text-ink-500">未注入条目 ({skippedEntries.length})</summary>
                <div className="mt-1 space-y-0.5">
                  {skippedEntries.slice(0, 12).map((item) => (
                    <p key={item.entry.id}>{item.entry.title} · {item.reason}</p>
                  ))}
                </div>
              </details>
            )}
          </div>
        </ContextSectionCard>

        <ContextSectionCard
          title="缓存诊断"
          icon={<Cpu className="h-3.5 w-3.5 text-ink-400" />}
          badge={
            cacheDiag
              ? cacheDiag.prefixChanged
                ? "已变化"
                : "稳定"
              : "预览"
          }
          level={3}
          variant="debug"
        >
          <div className="space-y-2 pb-1 text-xs text-ink-400">
            {cacheDiag ? (
              <>
                {/* Prefix status + change reasons */}
                <div className="stats-chip flex items-center justify-between">
                  <span>前缀状态</span>
                  <span className={`font-medium ${cacheDiag.prefixChanged ? "text-amber-600" : "text-emerald-600"}`}>
                    {cacheDiag.prefixChanged && cacheDiag.prefixChangeReasons.includes("no_previous_snapshot")
                      ? "首次构建"
                      : cacheDiag.prefixChanged
                        ? "已变化"
                        : "稳定"}
                  </span>
                </div>
                {cacheDiag.prefixChanged && cacheDiag.prefixChangeReasons.filter((r) => r !== "no_previous_snapshot" && r !== "unchanged").length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {cacheDiag.prefixChangeReasons
                      .filter((r) => r !== "no_previous_snapshot" && r !== "unchanged")
                      .map((reason) => (
                        <span key={reason} className="neo-pill bg-amber-50 text-[10px] text-amber-700">
                          {{
                            system_rules_changed: "系统规则",
                            character_changed: "角色设定",
                            templates_changed: "固定模板",
                            persistent_worldbooks_changed: "常驻世界书",
                            core_memories_changed: "核心记忆",
                            summary_changed: "摘要",
                            unchanged: "",
                            no_previous_snapshot: "",
                          }[reason] || reason}
                        </span>
                      ))}
                  </div>
                )}

                {/* Module hash breakdown (collapsible) */}
                {cacheDiag.snapshot && (
                  <details className="stats-chip">
                    <summary className="cursor-pointer font-medium text-ink-500">模块 Hash</summary>
                    <div className="mt-1.5 space-y-1">
                      {cacheDiag.snapshot.moduleHashes.systemRules && (
                        <div className="flex items-center justify-between"><span className="text-ink-400">系统规则</span><span className="font-mono text-[10px]">{cacheDiag.snapshot.moduleHashes.systemRules}</span></div>
                      )}
                      {cacheDiag.snapshot.moduleHashes.character && (
                        <div className="flex items-center justify-between"><span className="text-ink-400">角色设定</span><span className="font-mono text-[10px]">{cacheDiag.snapshot.moduleHashes.character}</span></div>
                      )}
                      {cacheDiag.snapshot.moduleHashes.templates && (
                        <div className="flex items-center justify-between"><span className="text-ink-400">固定模板</span><span className="font-mono text-[10px]">{cacheDiag.snapshot.moduleHashes.templates}</span></div>
                      )}
                      {cacheDiag.snapshot.moduleHashes.persistentWorldbooks && (
                        <div className="flex items-center justify-between"><span className="text-ink-400">常驻世界书</span><span className="font-mono text-[10px]">{cacheDiag.snapshot.moduleHashes.persistentWorldbooks}</span></div>
                      )}
                      {cacheDiag.snapshot.moduleHashes.coreMemories && (
                        <div className="flex items-center justify-between"><span className="text-ink-400">核心记忆</span><span className="font-mono text-[10px]">{cacheDiag.snapshot.moduleHashes.coreMemories}</span></div>
                      )}
                      {cacheDiag.snapshot.moduleHashes.summary && (
                        <div className="flex items-center justify-between"><span className="text-ink-400">摘要</span><span className="font-mono text-[10px]">{cacheDiag.snapshot.moduleHashes.summary}</span></div>
                      )}
                    </div>
                  </details>
                )}

                {/* Token breakdown */}
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="stats-chip flex items-center justify-between"><span>稳定前缀</span><span>{formatToken(cacheDiag.stablePrefixTokens)} tok</span></div>
                  <div className="stats-chip flex items-center justify-between"><span>动态上下文</span><span>{formatToken(cacheDiag.dynamicContextTokens)} tok</span></div>
                  <div className="stats-chip flex items-center justify-between"><span>最近消息</span><span>{formatToken(cacheDiag.recentMessagesTokens)} tok</span></div>
                  <div className="stats-chip flex items-center justify-between"><span>世界书</span><span>{formatToken(cacheDiag.worldbookTokens)} tok</span></div>
                  <div className="stats-chip flex items-center justify-between"><span>记忆</span><span>{formatToken(cacheDiag.memoryTokens)} tok</span></div>
                  <div className="stats-chip flex items-center justify-between"><span>摘要</span><span>{formatToken(cacheDiag.summaryTokens)} tok</span></div>
                </div>

                {cacheDiag.estimatedCacheableRatio !== null && (
                  <div className="stats-chip flex items-center justify-between">
                    <span>预计可缓存比例</span>
                    <span className="font-medium text-emerald-600">{formatPercent(cacheDiag.estimatedCacheableRatio)}</span>
                  </div>
                )}

                {cacheDiag.snapshot?.hash && (
                  <div className="stats-chip flex items-center justify-between">
                    <span>前缀 hash</span>
                    <span className="font-mono text-[10px]">{cacheDiag.snapshot.hash.slice(0, 8)}</span>
                  </div>
                )}
                {cacheDiag.dynamicContextHash && (
                  <div className="stats-chip flex items-center justify-between">
                    <span>动态 hash</span>
                    <span className="font-mono text-[10px]">{cacheDiag.dynamicContextHash}</span>
                  </div>
                )}

                <p className="text-[11px] text-ink-300">
                  稳定前缀不变时可复用 DeepSeek 缓存，降低输入成本。动态内容（世界书、记忆、最近消息）每轮可能变化。
                </p>
              </>
            ) : (
              <p>暂无上一轮对比数据。发送消息后将生成缓存诊断。</p>
            )}
          </div>
        </ContextSectionCard>


        {/* ── Cache Health Panel ── */}
        <ContextSectionCard
          title="缓存健康"
          icon={<Cpu className="h-3.5 w-3.5 text-ink-400" />}
          badge={`${healthLabels[healthSummary.healthLevel]} · ${healthSummary.sampleSize}次`}
          level={3}
          variant="debug"
        >
          <div className="space-y-2 pb-1 text-xs text-ink-400">
            {(cacheDiagHistory && cacheDiagHistory.length >= 2) ? (
              <>
                <div className="stats-chip flex items-center justify-between">
                  <span>健康度</span>
                  <span className={"neo-pill text-[10px] " + healthColorClasses[healthSummary.healthLevel]}>{healthLabels[healthSummary.healthLevel]}</span>
                </div>

                <div className="stats-chip">
                  <span className="mb-1.5 block text-ink-400">
                    最近 {Math.min(cacheDiagHistory.length, 20)} 次命中趋势
                    {cacheDiagHistory.length > 20 ? "（展示最近 20 次）" : ""}
                  </span>
                  <div className="overflow-x-auto pb-1">
                    <div className="flex items-end gap-0.5" style={{ height: 32, minWidth: cacheDiagHistory.length > 12 ? `${Math.min(cacheDiagHistory.length, 20) * 8}px` : "auto" }}>
                      {cacheDiagHistory.slice(-20).map((r, i) => {
                        const hr = (r.usage && typeof (r.usage as Record<string,unknown>).cacheHitRate === "number") ? (r.usage as Record<string,unknown>).cacheHitRate as number : null;
                        const color = hr === null ? "bg-ink-200" : hr >= 0.7 ? "bg-emerald-500" : hr >= 0.4 ? "bg-amber-400" : "bg-rose-400";
                        const barCount = Math.min(cacheDiagHistory.length, 20);
                        const minW = barCount > 12 ? "4px" : "auto";
                        return (
                          <div key={i} className={"flex-1 rounded-t-sm " + color}
                            style={{ height: hr !== null ? `${Math.max(4, Math.round(hr * 32))}px` : "4px", minWidth: minW }}
                            title={hr !== null ? `命中率 ${Math.round(hr * 100)}%` : "无数据"}
                          />
                        );
                      })}
                    </div>
                  </div>
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                  {healthSummary.averageHitRate !== undefined && (
                    <div className="stats-chip flex items-center justify-between"><span>平均命中率</span><span>{formatPercent(healthSummary.averageHitRate)}</span></div>
                  )}
                  {healthSummary.averageCacheMissTokens !== undefined && (
                    <div className="stats-chip flex items-center justify-between"><span>平均未命中</span><span>{formatToken(healthSummary.averageCacheMissTokens)} tok</span></div>
                  )}
                  {healthSummary.averageInputTokens !== undefined && (
                    <div className="stats-chip flex items-center justify-between"><span>平均输入</span><span>{formatToken(healthSummary.averageInputTokens)} tok</span></div>
                  )}
                  {healthSummary.averageEstimatedCost !== undefined && (
                    <div className="stats-chip flex items-center justify-between"><span>平均费用</span><span>{formatUsd(healthSummary.averageEstimatedCost)}</span></div>
                  )}
                </div>

                <div className="stats-chip flex items-center justify-between">
                  <span>前缀变化</span>
                  <span>{healthSummary.stablePrefixChangeCount}/{healthSummary.sampleSize} 次{healthSummary.stablePrefixChangeRate !== undefined ? ` (${Math.round(healthSummary.stablePrefixChangeRate * 100)}%)` : ""}</span>
                </div>
                {healthSummary.mostCommonChangeReasons.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {healthSummary.mostCommonChangeReasons.map(({ reason, count }) => (
                      <span key={reason} className="neo-pill bg-amber-50 text-[10px] text-amber-700">
                        {{system_rules_changed:"系统规则",character_changed:"角色设定",templates_changed:"模板",persistent_worldbooks_changed:"世界书",core_memories_changed:"记忆",summary_changed:"摘要"}[reason]||reason} ×{count}
                      </span>
                    ))}
                  </div>
                )}

                {healthSummary.suggestions.length > 0 && (
                  <details className="stats-chip">
                    <summary className="cursor-pointer font-medium text-ink-500">优化建议</summary>
                    <div className="mt-1.5 space-y-1">
                      {healthSummary.suggestions.map((s, i) => (
                        <p key={i} className="text-[11px] text-ink-400">{i + 1}. {s}</p>
                      ))}
                    </div>
                  </details>
                )}

                <p className="text-[11px] text-ink-300">
                  测试缓存：选择同一角色和会话，连续发送 5 条消息不修改设置，观察命中率是否上升。
                </p>
              </>
            ) : (
              <p>发送更多消息后即可查看缓存健康趋势。</p>
            )}
          </div>
        </ContextSectionCard>

        <ContextSectionCard title="用量与费用" icon={<Zap className="h-3.5 w-3.5 text-ink-400" />} badge={usageAvailable ? formatToken(latestUsage?.totalTokens) : "预览"} level={3} variant="debug">
          <p className="mb-2 text-[11px] text-ink-300">仅统计与估算，不限制发送。</p>
          <div className="space-y-3 pb-1 text-xs text-ink-400">
            <div className="neo-panel-soft space-y-2 p-2.5">
              <div className="flex items-center justify-between">
                <span className="font-medium text-ink-500">本次请求</span>
                <span className="neo-pill text-[10px]">{usageAvailable ? "Provider usage" : "未返回"}</span>
              </div>
              {usageAvailable ? (
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="stats-chip flex items-center justify-between"><span>输入 token</span><span>{formatToken(latestUsage?.inputTokens)}</span></div>
                  <div className="stats-chip flex items-center justify-between"><span>输出 token</span><span>{formatToken(latestUsage?.outputTokens)}</span></div>
                  <div className="stats-chip flex items-center justify-between"><span>总 token</span><span>{formatToken(latestUsage?.totalTokens)}</span></div>
                  <div className="stats-chip flex items-center justify-between"><span>推理 token</span><span>{formatToken(latestUsage?.reasoningTokens)}</span></div>
                </div>
              ) : (
                <p>{latestUsage?.usageUnavailableReason ?? "当前 Provider 未返回本次用量。"}</p>
              )}
            </div>

            <div className="neo-panel-soft space-y-2 p-2.5">
              <div className="flex items-center justify-between">
                <span className="font-medium text-ink-500">缓存命中</span>
                <span className="neo-pill text-[10px]">{isDeepSeek ? "DeepSeek" : "暂未适配"}</span>
              </div>
              {isDeepSeek ? (
                latestUsage?.cacheHitInputTokens !== undefined || latestUsage?.cacheMissInputTokens !== undefined ? (
                  <>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <div className="stats-chip flex items-center justify-between"><span>命中 token</span><span>{formatToken(latestUsage?.cacheHitInputTokens)}</span></div>
                      <div className="stats-chip flex items-center justify-between"><span>未命中 token</span><span>{formatToken(latestUsage?.cacheMissInputTokens)}</span></div>
                      <div className="stats-chip flex items-center justify-between sm:col-span-2"><span>命中率</span><span>{formatPercent(latestUsage?.cacheHitRate)}</span></div>
                    </div>
                    <p className="text-[11px] text-ink-300">缓存命中越高，输入成本越低。</p>
                  </>
                ) : (
                  <p>本次 DeepSeek 响应未返回缓存明细。</p>
                )
              ) : (
                <p>当前阶段仅 DeepSeek 支持缓存命中明细。</p>
              )}
            </div>

            <div className="neo-panel-soft space-y-2 p-2.5">
              <div className="flex items-center justify-between">
                <span className="font-medium text-ink-500">费用估算</span>
                <span className="neo-pill text-[10px]">{isDeepSeek ? "估算" : "DeepSeek only"}</span>
              </div>
              {isDeepSeek ? (
                latestCostEstimate ? (
                  <>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <div className="stats-chip flex items-center justify-between"><span>命中输入费用</span><span>{formatUsd(latestCostEstimate.cacheHitInputCost)}</span></div>
                      <div className="stats-chip flex items-center justify-between"><span>未命中输入费用</span><span>{formatUsd(latestCostEstimate.cacheMissInputCost ?? latestCostEstimate.inputCost)}</span></div>
                      <div className="stats-chip flex items-center justify-between"><span>输出费用</span><span>{formatUsd(latestCostEstimate.outputCost)}</span></div>
                      <div className="stats-chip flex items-center justify-between font-medium text-ink-500"><span>本次合计</span><span>{formatUsd(latestCostEstimate.totalCost)}</span></div>
                    </div>
                    <p className="text-[11px] text-ink-300">按内置价格表估算，实际扣费以 Provider 官方账单为准。</p>
                    <p className="text-[11px] text-ink-300">DeepSeek 价格表版本：{latestCostEstimate.pricingVersion} · 更新时间：{latestCostEstimate.pricingUpdatedAt}</p>
                    {latestCostEstimate.estimateWarning && <p className="text-[11px] text-amber-600">{latestCostEstimate.estimateWarning}</p>}
                  </>
                ) : (
                  <p>当前没有可用于估算费用的 DeepSeek 用量数据。</p>
                )
              ) : (
                <p>当前阶段仅支持 DeepSeek 费用估算。</p>
              )}
            </div>

            <div className="neo-panel-soft space-y-2 p-2.5">
              <div className="flex items-center justify-between">
                <span className="font-medium text-ink-500">账户余额</span>
                <button
                  type="button"
                  onClick={() => void onRefreshBalance()}
                  disabled={!isDeepSeek || !!isBalanceLoading}
                  className="neo-button inline-flex items-center gap-1 rounded-[16px] px-2.5 py-1 text-[11px] disabled:opacity-50"
                >
                  <RefreshCw className={`h-3 w-3 ${isBalanceLoading ? "animate-spin" : ""}`} />
                  {isBalanceLoading ? "刷新中..." : "刷新余额"}
                </button>
              </div>
              {isDeepSeek ? (
                providerBalance ? (
                  <>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {providerBalance.balances.map((balance) => (
                        <div key={balance.currency} className="stats-chip space-y-1">
                          <div className="flex items-center justify-between"><span>币种</span><span>{balance.currency}</span></div>
                          <div className="flex items-center justify-between"><span>总余额</span><span>{balance.totalBalance}</span></div>
                          <div className="flex items-center justify-between"><span>赠送余额</span><span>{balance.grantedBalance}</span></div>
                          <div className="flex items-center justify-between"><span>充值余额</span><span>{balance.toppedUpBalance}</span></div>
                        </div>
                      ))}
                    </div>
                    <p className="text-[11px] text-ink-300">最后刷新时间：{new Date(providerBalance.fetchedAt).toLocaleString("zh-CN")}</p>
                  </>
                ) : (
                  <p>{balanceError ?? "点击“刷新余额”查询 DeepSeek 账户余额。"}</p>
                )
              ) : (
                <p>当前阶段仅支持 DeepSeek 余额查询。</p>
              )}
            </div>

            <div className="neo-panel-soft space-y-2 p-2.5">
              <div className="flex items-center justify-between">
                <span className="font-medium text-ink-500">上下文窗口</span>
                <span className="neo-pill text-[10px]">{contextWindowStatus}</span>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="stats-chip flex items-center justify-between"><span>当前上下文 token</span><span>{currentContextTokens !== null ? currentContextTokens.toLocaleString("zh-CN") : "未计算"}</span></div>
                <div className="stats-chip flex items-center justify-between"><span>模型上下文上限</span><span>{contextWindowLimit !== null ? contextWindowLimit.toLocaleString("zh-CN") : "未知"}</span></div>
                <div className="stats-chip flex items-center justify-between sm:col-span-2"><span>使用率</span><span>{contextUsageRate !== null ? `${(contextUsageRate * 100).toFixed(1)}%` : "未知"}</span></div>
              </div>
              <p className="text-[11px] text-ink-300">上下文窗口接近上限时，可能需要压缩摘要或减少注入内容，否则请求可能失败。</p>
              <button type="button" disabled className="neo-button rounded-[16px] px-2.5 py-1.5 text-[11px] text-ink-400 disabled:opacity-60">
                压缩功能将在后续版本接入
              </button>
            </div>
          </div>
        </ContextSectionCard>

        <ContextSectionCard title="最终 System Prompt" icon={<Eye className="h-3.5 w-3.5 text-brand-400" />} badge={estimateTokens(finalPrompt).toString()} defaultOpen level={2}>
          <p className="mb-2 text-xs text-ink-400">
            {messageCount === 0 ? "预览构建结果，下一条消息将使用这份 system prompt。" : "最近一次上下文构建结果。"}
          </p>
          <pre className="neo-code scrollbar-none max-h-56 overflow-y-auto whitespace-pre-wrap p-3 text-xs leading-relaxed text-slate-600">
            {contextPreviewError && !finalPrompt ? "上下文预览失败，可继续聊天" : finalPrompt || "上下文加载中..."}
          </pre>
        </ContextSectionCard>
      </div>

      {showTplPicker && (
        <PickerModal title="选择提示词模板" onClose={() => setShowTplPicker(false)}>
          {pickerTpls.length === 0 ? (
            <p className="py-4 text-center text-xs text-ink-300">暂无模板</p>
          ) : (
            pickerTpls.map((template) => (
              <button
                key={template.id}
                onClick={() => {
                  void onAddTemplate(template.id);
                  setShowTplPicker(false);
                }}
                className="neo-button mb-2 w-full px-3 py-2 text-left"
              >
                <p className="truncate text-sm font-medium text-ink-700">{template.title}</p>
                <p className="mt-0.5 line-clamp-1 text-xs text-ink-300">{template.content.slice(0, 60)}</p>
              </button>
            ))
          )}
        </PickerModal>
      )}

      {showWbPicker && (
        <PickerModal title="选择世界书（可多选）" onClose={() => setShowWbPicker(false)}>
          {pickerWbs.length === 0 ? (
            <p className="py-4 text-center text-xs text-ink-300">暂无世界书</p>
          ) : (
            pickerWbs.map((worldbook) => {
              const selected = selectedWbIds.has(worldbook.id);
              return (
                <button
                  key={worldbook.id}
                  onClick={() => {
                    const next = new Set(selectedWbIds);
                    if (selected) next.delete(worldbook.id);
                    else next.add(worldbook.id);
                    setSelectedWbIds(next);
                  }}
                  className={`mb-2 w-full px-3 py-2 text-left ${selected ? "neo-button-pressed" : "neo-button"}`}
                >
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-ink-700">{worldbook.name}</p>
                    <span className={`text-xs ${selected ? "font-medium text-brand-500" : "text-ink-300"}`}>{selected ? "已选" : "点击选择"}</span>
                  </div>
                  {worldbook.description && <p className="mt-0.5 text-xs text-ink-300">{worldbook.description}</p>}
                </button>
              );
            })
          )}
          <button
            onClick={() => {
              void onAddWorldbooks([...selectedWbIds]);
              setShowWbPicker(false);
            }}
            disabled={selectedWbIds.size === 0}
            className="btn-primary mt-2 w-full text-sm disabled:opacity-50"
          >
            添加所选世界书 ({selectedWbIds.size})
          </button>
        </PickerModal>
      )}

      {showMemPicker && (
        <PickerModal title="选择记忆（可多选）" onClose={() => setShowMemPicker(false)}>
          {pickerMems.length === 0 ? (
            <p className="py-4 text-center text-xs text-ink-300">暂无 active 记忆</p>
          ) : (
            pickerMems.map((memory) => {
              const selected = selectedMemIds.has(memory.id);
              return (
                <button
                  key={memory.id}
                  onClick={() => {
                    const next = new Set(selectedMemIds);
                    if (selected) next.delete(memory.id);
                    else next.add(memory.id);
                    setSelectedMemIds(next);
                  }}
                  className={`mb-2 w-full px-3 py-2 text-left ${selected ? "neo-button-pressed" : "neo-button"}`}
                >
                  <div className="flex items-center justify-between">
                    <p className="truncate text-sm font-medium text-ink-700">{memory.title || "未命名记忆"}</p>
                    <span className={`text-xs ${selected ? "font-medium text-brand-500" : "text-ink-300"}`}>{selected ? "已选" : "点击选择"}</span>
                  </div>
                  <p className="mt-0.5 line-clamp-1 text-xs text-ink-300">{memory.content.slice(0, 60)}</p>
                </button>
              );
            })
          )}
          <button
            onClick={() => {
              void onAddMemories([...selectedMemIds]);
              setShowMemPicker(false);
            }}
            disabled={selectedMemIds.size === 0}
            className="btn-primary mt-2 w-full text-sm disabled:opacity-50"
          >
            添加所选记忆 ({selectedMemIds.size})
          </button>
        </PickerModal>
      )}

      {/* ── Compression Confirm Modal ── */}
      <AppModal
        open={compressionOpen === "confirm"}
        title="压缩上下文？"
        description="系统会把较早的聊天记录整理成会话摘要。原始消息不会删除。应用摘要后，稳定前缀会变化一次，后续连续对话的缓存命中率通常会逐步恢复。"
        onClose={() => setCompressionOpen(null)}
        size="sm"
        footer={
          <div className="flex gap-2">
            <button onClick={() => setCompressionOpen(null)} className="neo-button flex-1 px-4 py-2 text-xs font-medium text-ink-500">取消</button>
            <button onClick={async () => {
              setCompressionOpen("generating");
              const result = await onCompressContext();
              if (result) {
                setCompressionEditText(result);
                setCompressionOpen("preview");
              } else {
                setCompressionErrorMsg("压缩生成失败，请检查 API 配置后重试。");
                setCompressionOpen("error");
              }
            }} className="neo-button-primary flex flex-1 items-center justify-center gap-1.5 px-4 py-2 text-xs font-semibold">
              开始压缩
            </button>
          </div>
        }
      >{null}</AppModal>

      {/* ── Compression Generating ── */}
      <AppModal
        open={compressionOpen === "generating"}
        title="正在压缩上下文"
        description="正在整理旧剧情、角色关系、伏笔和下一轮对话注意事项..."
        onClose={() => {}}
        size="sm"
        closeOnOverlayClick={false}
        footer={null}
      >
        <div className="flex items-center justify-center py-4">
          <RefreshCw className="h-6 w-6 animate-spin text-brand-500" />
        </div>
      </AppModal>

      {/* ── Compression Preview Modal ── */}
      <AppModal
        open={compressionOpen === "preview"}
        title="摘要预览"
        description="你可以直接修改这份摘要。点击应用后，它会成为新的会话摘要。原始消息不会删除。"
        onClose={() => setCompressionOpen(null)}
        size="lg"
        footer={
          <div className="flex gap-2">
            <button onClick={() => setCompressionOpen(null)} className="neo-button flex-1 px-4 py-2 text-xs font-medium text-ink-500">取消</button>
            <button onClick={async () => {
              setCompressionOpen("generating");
              const result = await onCompressContext();
              if (result) {
                setCompressionEditText(result);
                setCompressionOpen("preview");
              } else {
                setCompressionErrorMsg("重新生成失败，请重试。");
                setCompressionOpen("error");
              }
            }} disabled={compressBusy} className="neo-button flex-1 px-4 py-2 text-xs font-medium text-brand-600 hover:text-brand-700 disabled:opacity-50">
              重新生成
            </button>
            <button onClick={async () => {
              const trimmed = compressionEditText.trim();
              if (!trimmed) {
                setCompressionErrorMsg("摘要不能为空。");
                setCompressionOpen("error");
                return;
              }
              await onSaveSummaryText(trimmed);
              setCompressionOpen("success");
              setTimeout(() => setCompressionOpen(null), 2000);
            }} disabled={compressBusy} className="neo-button-primary flex flex-1 items-center justify-center gap-1.5 px-4 py-2 text-xs font-semibold disabled:opacity-50">
              应用摘要
            </button>
          </div>
        }
      >
        <textarea
          value={compressionEditText}
          onChange={(e) => setCompressionEditText(e.target.value)}
          rows={18}
          className="neo-input w-full resize-y rounded-[16px] px-3 py-2 text-xs"
          style={{ minHeight: "200px", maxHeight: "60vh" }}
        />
      </AppModal>

      {/* ── Compression Error ── */}
      <AppModal
        open={compressionOpen === "error"}
        title="提示"
        onClose={() => setCompressionOpen(null)}
        size="sm"
        footer={
          <button onClick={() => setCompressionOpen(null)} className="neo-button-primary w-full px-4 py-2 text-xs font-semibold">知道了</button>
        }
      >
        <p className="text-sm text-ink-600">{compressionErrorMsg}</p>
      </AppModal>

      {/* ── Compression Success ── */}
      <AppModal
        open={compressionOpen === "success"}
        title="摘要已应用"
        description="稳定前缀已更新，后续连续聊天缓存命中率会逐步恢复。"
        onClose={() => setCompressionOpen(null)}
        size="sm"
        footer={
          <button onClick={() => setCompressionOpen(null)} className="neo-button-primary w-full px-4 py-2 text-xs font-semibold">知道了</button>
        }
      >{null}</AppModal>

    </div>
  );
}
