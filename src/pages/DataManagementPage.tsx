import { logger } from "../shared/lib/logger";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { ArrowLeft, Database, Download, FileUp, RefreshCw, RotateCcw, Shield, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";
import { supabase } from "../features/auth/supabaseClient";
import { useAuth } from "../features/auth";
import { ModeBadge } from "../shared/components/ModeBadge";
import type { ImportMode, ImportPreview, TrashEntityType, TrashListItem } from "../features/roleplay/types/dataManagement";
import {
  checkStoragePersistence,
  getStorageProtectionStatus,
  recordBackup,
  requestStoragePersistence,
} from "../features/roleplay/services/localStorageMetadata";
import {
  buildBackupFile,
  downloadBackupFile,
  importBackupFile,
  loadDataManagementStats,
  loadTrashItems,
  parseBackupText,
  recordBackupArtifact,
  restoreTrashItem,
} from "../features/roleplay/services/dataManagementService";

const trashFilterOptions: Array<{ value: TrashEntityType; label: string }> = [
  { value: "all", label: "全部" },
  { value: "sessions", label: "会话" },
  { value: "messages", label: "消息" },
  { value: "characters", label: "角色" },
  { value: "prompt_templates", label: "提示词模板" },
  { value: "worldbooks", label: "世界书" },
  { value: "worldbook_entries", label: "世界书条目" },
  { value: "memories", label: "记忆" },
];

export function DataManagementPage() {
  const { isGuestOrDemo, user } = useAuth();
  const userId = user?.id ?? null;
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [stats, setStats] = useState<Awaited<ReturnType<typeof loadDataManagementStats>> | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [includeContextRuns, setIncludeContextRuns] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportMessage, setExportMessage] = useState<string | null>(null);

  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [importMode, setImportMode] = useState<ImportMode>("copy");
  const [importing, setImporting] = useState(false);
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const [trashFilter, setTrashFilter] = useState<TrashEntityType>("all");
  const [trashItems, setTrashItems] = useState<TrashListItem[]>([]);
  const [trashLoading, setTrashLoading] = useState(false);
  const [trashError, setTrashError] = useState<string | null>(null);
  const [restoringKey, setRestoringKey] = useState<string | null>(null);

  // Storage protection
  const [storageProtection, setStorageProtection] = useState<ReturnType<typeof getStorageProtectionStatus> | null>(null);
  const [persistRequesting, setPersistRequesting] = useState(false);

  async function checkProtection() {
    const protection = getStorageProtectionStatus();
    const { persisted } = await checkStoragePersistence();
    setStorageProtection({ ...protection, persistenceGranted: persisted });
  }

  async function handleRequestPersistence() {
    setPersistRequesting(true);
    try {
      const granted = await requestStoragePersistence();
      setStorageProtection((prev) => prev ? { ...prev, persistenceGranted: granted } : null);
    } finally {
      setPersistRequesting(false);
    }
  }

  // Check protection on mount and when stats load
  useEffect(() => {
    void checkProtection();
  }, []);

  const exportEstimate = useMemo(() => {
    if (!stats) return null;
    return stats.exportCounts;
  }, [stats]);

  async function refreshStats() {
    if (!supabase || !userId) return;
    setStatsLoading(true);
    setStatsError(null);
    try {
      const next = await loadDataManagementStats(supabase, userId);
      setStats(next);
    } catch (error) {
      setStatsError(`读取数据统计失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setStatsLoading(false);
    }
  }

  async function refreshTrash(nextFilter: TrashEntityType = trashFilter) {
    if (!supabase || !userId) return;
    setTrashLoading(true);
    setTrashError(null);
    try {
      const next = await loadTrashItems(supabase, userId, nextFilter);
      setTrashItems(next);
    } catch (error) {
      setTrashError(`读取回收站失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setTrashLoading(false);
    }
  }

  useEffect(() => {
    if (!userId || !supabase || isGuestOrDemo) return;
    void refreshStats();
    void refreshTrash("all");
  }, [isGuestOrDemo, userId]);

  async function handleExport() {
    if (!supabase || !userId) return;
    setExporting(true);
    setExportMessage(null);
    try {
      const { fileName, jsonText, checksum } = await buildBackupFile(supabase, userId, includeContextRuns);
      downloadBackupFile(fileName, jsonText);
      recordBackup(exportEstimate ? Object.values(exportEstimate).reduce((s, c) => s + c, 0) : 0);
      await recordBackupArtifact(supabase, userId, fileName, checksum).catch((error) => {
        logger.warn("[DataManagement] backup metadata record failed:", error);
      });
      setExportMessage(`导出完成：${fileName}`);
      await refreshStats();
    } catch (error) {
      setExportMessage(`导出失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setExporting(false);
    }
  }

  async function handleFileSelected(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setImportMessage(null);
    setImportError(null);
    try {
      const text = await file.text();
      const nextPreview = parseBackupText(file.name, text);
      setPreview(nextPreview);
    } catch (error) {
      setPreview(null);
      setImportError(error instanceof Error ? error.message : String(error));
    } finally {
      event.target.value = "";
    }
  }

  async function handleImport() {
    if (!supabase || !userId || !preview) return;
    setImporting(true);
    setImportMessage(null);
    setImportError(null);
    try {
      const result = await importBackupFile(supabase, userId, preview.payload, importMode);
      setImportMessage(
        `导入完成：角色 ${result.imported.characters}、模板 ${result.imported.prompt_templates}、世界书 ${result.imported.worldbooks}、会话 ${result.imported.sessions}、消息 ${result.imported.messages}。`,
      );
      setPreview(null);
      await Promise.all([refreshStats(), refreshTrash()]);
    } catch (error) {
      setImportError(error instanceof Error ? error.message : String(error));
    } finally {
      setImporting(false);
    }
  }

  async function handleRestore(item: TrashListItem, restoreWorldbookEntries = false) {
    if (!supabase || !userId) return;
    setRestoringKey(`${item.entityType}:${item.entityId}:${restoreWorldbookEntries ? "all" : "one"}`);
    try {
      await restoreTrashItem(supabase, userId, item, { restoreWorldbookEntries });
      await Promise.all([refreshTrash(), refreshStats()]);
    } catch (error) {
      setTrashError(`恢复失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setRestoringKey(null);
    }
  }

  if (isGuestOrDemo || !userId) {
    return (
      <div className="page-container">
        <div className="neo-page-shell px-5 py-6 md:px-7 md:py-7">
          <div className="mb-6 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
            <Link to="/settings" className="btn-ghost text-xs">
              <ArrowLeft className="h-4 w-4" />
              返回设置
            </Link>
            <div>
              <h1 className="text-xl font-bold text-ink-900">数据管理</h1>
              <p className="text-sm text-ink-400 mt-1">登录后才能管理云端数据；本地模式下的浏览器数据仍建议你定期单独备份。</p>
            </div>
          </div>
          <ModeBadge />
        </div>
          <div className="card">
            <p className="text-sm text-ink-500 leading-relaxed">
            当前是网页本地模式 / 未登录状态。这里的云端数据管理功能只对当前登录用户自己的 Supabase 数据生效，也不会读取浏览器里的 API Key。
          </p>
        </div>
        </div>
      </div>
    );
  }

  return (
      <div className="page-container space-y-6">
        <div className="neo-page-shell space-y-6 px-5 py-6 md:px-7 md:py-7">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link to="/settings" className="btn-ghost text-xs">
            <ArrowLeft className="h-4 w-4" />
            返回设置
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50 text-amber-500">
                <Shield className="h-4 w-4" />
              </div>
              <h1 className="text-xl font-bold text-ink-900">数据保险箱</h1>
            </div>
            <p className="text-xs text-ink-400 mt-1">本地数据保护 · 备份恢复 · 回收站</p>
          </div>
        </div>
        <ModeBadge />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.3fr,0.7fr]">
        <section className="card space-y-4">
          <div className="flex items-center gap-2">
            <Download className="h-5 w-5 text-brand-500" />
            <h2 className="text-sm font-semibold text-ink-700">导出备份</h2>
          </div>
          <p className="text-sm text-ink-500 leading-relaxed">
            导出为本地 JSON 文件，不上传服务器。默认不包含 `context_runs`，也不会导出 API Key、localStorage 或任何身份信息。
          </p>
          {exportEstimate && (
            <div className="rounded-card border border-surface-100 bg-surface-50 px-4 py-3 text-xs text-ink-500 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              <span>角色：{exportEstimate.characters}</span>
              <span>角色版本：{exportEstimate.character_revisions}</span>
              <span>模板：{exportEstimate.prompt_templates}</span>
              <span>世界书：{exportEstimate.worldbooks}</span>
              <span>世界书条目：{exportEstimate.worldbook_entries}</span>
              <span>记忆：{exportEstimate.memories}</span>
              <span>会话：{exportEstimate.sessions}</span>
              <span>分支：{exportEstimate.branches}</span>
              <span>参与者：{exportEstimate.session_participants}</span>
              <span>消息：{exportEstimate.messages}</span>
              <span>消息版本：{exportEstimate.message_revisions}</span>
              <span>调试上下文：{exportEstimate.context_runs}</span>
            </div>
          )}
          {/* Storage Protection Status */}
          {storageProtection ? (
            <div className="rounded-card border border-surface-100 bg-surface-50 px-4 py-3">
              <h3 className="text-sm font-semibold text-ink-700 mb-2">本地数据保护状态</h3>
              <div className="grid gap-2 text-xs text-ink-500">
                <div className="flex justify-between">
                  <span>本地数据库</span>
                  <span className="font-medium text-ink-700">{storageProtection.indexedDbAvailable ? "IndexedDB 可用" : "不可用"}</span>
                </div>
                <div className="flex justify-between">
                  <span>持久化存储</span>
                  <span className={`font-medium ${storageProtection.persistenceGranted ? "text-emerald-600" : storageProtection.persistenceApiSupported ? "text-amber-600" : "text-ink-400"}`}>
                    {storageProtection.persistenceGranted
                      ? "已开启"
                      : storageProtection.persistenceApiSupported
                        ? "未开启"
                        : "浏览器不支持"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>上次本地备份</span>
                  <span className="font-medium text-ink-700">{storageProtection.lastBackupAt ? new Date(storageProtection.lastBackupAt).toLocaleString() : "尚未备份"}</span>
                </div>
              </div>
              {!storageProtection.persistenceGranted && storageProtection.persistenceApiSupported ? (
                <div className="mt-2 flex items-center gap-2">
                  <button
                    onClick={() => void handleRequestPersistence()}
                    disabled={persistRequesting}
                    className="btn-ghost text-xs text-brand-600 disabled:opacity-50"
                  >
                    {persistRequesting ? "请求中..." : "申请持久化存储"}
                  </button>
                  <span className="text-xs text-ink-400">向浏览器请求不自动清理本地数据</span>
                </div>
              ) : null}
              {!storageProtection.lastBackupAt && stats ? (
                <div className="mt-2 rounded-card border border-amber-100 bg-amber-light/20 px-3 py-2 text-xs text-amber-700">
                  你尚未导出过本地备份。建议定期导出，避免清除浏览器数据后无法恢复。
                </div>
              ) : null}
            </div>
          ) : null}

          <label className="flex items-start gap-3 rounded-card border border-amber-100 bg-amber-light/20 px-4 py-3">
            <input
              type="checkbox"
              checked={includeContextRuns}
              onChange={(event) => setIncludeContextRuns(event.target.checked)}
              className="mt-1"
            />
            <div>
              <p className="text-sm font-medium text-amber-800">包含调试上下文 `context_runs`</p>
              <p className="text-xs text-amber-700 mt-1 leading-relaxed">
                默认关闭。这里可能包含完整 System Prompt 和调试信息，常规备份不建议勾选。
              </p>
            </div>
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => void handleExport()} disabled={exporting || statsLoading} className="btn-primary px-6 py-3 text-sm font-semibold disabled:opacity-50 shadow-lg shadow-brand-200/30">
              <Download className="mr-1.5 h-4 w-4" />
              {exporting ? "导出处理中..." : "导出 JSON 备份"}
            </button>
            <button onClick={() => void refreshStats()} disabled={statsLoading} className="btn-ghost text-sm disabled:opacity-50">
              <RefreshCw className={`h-4 w-4 ${statsLoading ? "animate-spin" : ""}`} />
              刷新统计
            </button>
          </div>
          {(exportMessage || statsError) && (
            <p className={`text-sm ${statsError || exportMessage?.startsWith("导出失败") ? "text-rose-600" : "text-emerald-600"}`}>
              {statsError ?? exportMessage}
            </p>
          )}
        </section>

        <section className="card space-y-4">
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-emerald-600" />
            <h2 className="text-sm font-semibold text-ink-700">安全说明 / 数据统计</h2>
          </div>
          <div className="space-y-2 text-sm text-ink-500 leading-relaxed">
            <p>1. API Key 不导出、不导入、不写入备份记录。</p>
            <p>2. 导入时会强制归属当前登录用户，不会覆盖当前身份。</p>
            <p>3. 回收站直接读取各业务表的 `deleted_at`，不关闭 RLS。</p>
          </div>
          {stats && (
            <div className="rounded-card border border-surface-100 bg-surface-50 px-4 py-3 space-y-2 text-xs text-ink-500">
              <p>已软删除会话：{stats.deletedCounts.sessions}</p>
              <p>已软删除消息：{stats.deletedCounts.messages}</p>
              <p>已软删除角色：{stats.deletedCounts.characters}</p>
              <p>已软删除模板：{stats.deletedCounts.prompt_templates}</p>
              <p>已软删除世界书：{stats.deletedCounts.worldbooks}</p>
              <p>已软删除世界书条目：{stats.deletedCounts.worldbook_entries}</p>
              <p>已软删除记忆：{stats.deletedCounts.memories}</p>
              <p>最近本地备份记录：{stats.backupArtifacts.length}</p>
            </div>
          )}
        </section>
      </div>

      <section className="card space-y-4">
        <div className="flex items-center gap-2">
          <FileUp className="h-5 w-5 text-sky-600" />
          <h2 className="text-sm font-semibold text-ink-700">导入恢复</h2>
        </div>
        <p className="text-sm text-ink-500 leading-relaxed">
          先选文件，再预览，再导入。默认推荐“作为副本导入”，生成新 id，不覆盖现有数据。
        </p>
        <div className="flex items-center gap-2">
          <input ref={fileInputRef} type="file" accept="application/json" className="hidden" onChange={(event) => void handleFileSelected(event)} />
          <button onClick={() => fileInputRef.current?.click()} className="btn-secondary text-sm">
            选择备份文件
          </button>
          {preview && <span className="text-xs text-ink-400">{preview.fileName}</span>}
        </div>
        {importError && <p className="text-sm text-rose-600">{importError}</p>}
        {preview && (
          <div className="rounded-card border border-surface-100 bg-surface-50 px-4 py-4 space-y-4">
            <div className="text-sm text-ink-600 space-y-1">
              <p>Schema 版本：{preview.schemaVersion}</p>
              <p>应用名：{preview.appName}</p>
              <p>是否包含 `context_runs`：{preview.includesContextRuns ? "是" : "否"}</p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3 text-xs text-ink-500">
              <span>角色：{preview.counts.characters}</span>
              <span>模板：{preview.counts.prompt_templates}</span>
              <span>世界书：{preview.counts.worldbooks}</span>
              <span>世界书条目：{preview.counts.worldbook_entries}</span>
              <span>记忆：{preview.counts.memories}</span>
              <span>会话：{preview.counts.sessions}</span>
              <span>消息：{preview.counts.messages}</span>
              <span>消息版本：{preview.counts.message_revisions}</span>
              <span>角色版本：{preview.counts.character_revisions}</span>
            </div>
            <div className="space-y-2">
              <label className="flex items-start gap-3 rounded-card border border-brand-100 bg-white px-4 py-3">
                <input type="radio" checked={importMode === "copy"} onChange={() => setImportMode("copy")} className="mt-1" />
                <div>
                  <p className="text-sm font-medium text-ink-700">作为副本导入（推荐）</p>
                  <p className="text-xs text-ink-400 mt-1">生成新的 id，保留原数据不变，最稳妥。</p>
                </div>
              </label>
              <label className="flex items-start gap-3 rounded-card border border-surface-100 bg-white px-4 py-3">
                <input type="radio" checked={importMode === "skip_existing"} onChange={() => setImportMode("skip_existing")} className="mt-1" />
                <div>
                  <p className="text-sm font-medium text-ink-700">跳过已存在项目</p>
                  <p className="text-xs text-ink-400 mt-1">按名称或标题近似匹配顶层项目，命中后跳过该项目及其子数据。</p>
                </div>
              </label>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => void handleImport()} disabled={importing} className="btn-primary text-sm disabled:opacity-50">
                {importing ? "导入处理中..." : "开始导入"}
              </button>
              <button onClick={() => setPreview(null)} disabled={importing} className="btn-ghost text-sm disabled:opacity-50">
                清空预览
              </button>
            </div>
          </div>
        )}
        {(importMessage || importError) && (
          <p className={`text-sm ${importError ? "text-rose-600" : "text-emerald-600"}`}>{importError ?? importMessage}</p>
        )}
      </section>

      <section className="card space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Trash2 className="h-5 w-5 text-rose-500" />
            <h2 className="text-sm font-semibold text-ink-700">回收站</h2>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={trashFilter}
              onChange={(event) => {
                const nextFilter = event.target.value as TrashEntityType;
                setTrashFilter(nextFilter);
                void refreshTrash(nextFilter);
              }}
              className="rounded-input border border-surface-200 bg-surface-50 px-3 py-2 text-sm text-ink-700"
            >
              {trashFilterOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <button onClick={() => void refreshTrash()} disabled={trashLoading} className="btn-ghost text-sm disabled:opacity-50">
              <RefreshCw className="h-4 w-4" />
              刷新
            </button>
          </div>
        </div>
        {trashError && <p className="text-sm text-rose-600">{trashError}</p>}
        {trashLoading ? (
          <p className="text-sm text-ink-400">回收站加载中...</p>
        ) : trashItems.length === 0 ? (
          <p className="text-sm text-ink-400">当前筛选下暂无已软删除数据。</p>
        ) : (
          <div className="space-y-3">
            {trashItems.map((item) => {
              const baseKey = `${item.entityType}:${item.entityId}`;
              return (
                <div key={baseKey} className="rounded-card border border-surface-100 bg-surface-50 px-4 py-3">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div className="min-w-0">
                      <p className="text-xs uppercase tracking-wide text-ink-300">{item.entityType}</p>
                      <h3 className="text-sm font-semibold text-ink-700 mt-1 break-words">{item.title}</h3>
                      <p className="text-xs text-ink-400 mt-1">{item.description}</p>
                      <p className="text-xs text-ink-300 mt-1">删除时间：{new Date(item.deletedAt).toLocaleString()}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        onClick={() => void handleRestore(item, false)}
                        disabled={restoringKey === `${baseKey}:one` || restoringKey === `${baseKey}:all`}
                        className="btn-secondary text-xs disabled:opacity-50"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                        恢复
                      </button>
                      {item.entityType === "worldbooks" && (
                        <button
                          onClick={() => void handleRestore(item, true)}
                          disabled={restoringKey === `${baseKey}:one` || restoringKey === `${baseKey}:all`}
                          className="btn-ghost text-xs disabled:opacity-50"
                        >
                          <Database className="h-3.5 w-3.5" />
                          恢复并恢复条目
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
      </div>
    </div>
  );
}
