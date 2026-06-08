import { BookOpen, ChevronRight, Edit3, Plus, Search, Trash2, Upload } from "lucide-react";
import type { WorldbookEntryRow, WorldbookRow } from "../../types/database";

interface WorldbookListProps {
  worldbooks: WorldbookRow[];
  entries: WorldbookEntryRow[];
  loading: boolean;
  activeWorldbookId: string | null;
  onSelectWb: (id: string | null) => void;
  onCreateWb: () => void;
  onImportWb: () => void;
  onEditWb: (wb: WorldbookRow) => void;
  onDeleteWb: (wb: WorldbookRow) => void;
  onCreateEntry: () => void;
  onEditEntry: (e: WorldbookEntryRow) => void;
  onDeleteEntry: (e: WorldbookEntryRow) => void;
  onToggleEntry: (e: WorldbookEntryRow) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  entrySearch: string;
  onEntrySearchChange: (q: string) => void;
}

export function WorldbookList({
  worldbooks,
  entries,
  loading,
  activeWorldbookId,
  onSelectWb,
  onCreateWb,
  onImportWb,
  onEditWb,
  onDeleteWb,
  onCreateEntry,
  onEditEntry,
  onDeleteEntry,
  onToggleEntry,
  searchQuery,
  onSearchChange,
  entrySearch,
  onEntrySearchChange,
}: WorldbookListProps) {
  const activeWorldbook = worldbooks.find((item) => item.id === activeWorldbookId);

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-300" />
          <input type="text" value={searchQuery} onChange={(e) => onSearchChange(e.target.value)} placeholder="搜索世界书..." className="neo-input w-full rounded-input py-2.5 pl-9 pr-3 text-sm" />
        </div>
        <button onClick={onImportWb} className="neo-button flex items-center gap-1.5 rounded-[20px] px-4 py-2.5 text-xs text-ink-500">
          <Upload className="h-3.5 w-3.5" />
          导入
        </button>
        <button onClick={onCreateWb} className="neo-button-primary flex items-center gap-1.5 rounded-[20px] px-4 py-2.5 text-xs">
          <Plus className="h-3.5 w-3.5" />
          创建
        </button>
      </div>

      {loading ? (
        <p className="py-8 text-center text-xs text-ink-300">加载中...</p>
      ) : worldbooks.length === 0 ? (
        <div className="neo-panel-soft py-12 text-center">
          <p className="text-sm text-ink-400">暂无世界书</p>
          <p className="mt-1 text-xs text-ink-300">创建世界书来组织你的世界观条目。</p>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {worldbooks.map((worldbook) => (
            <div
              key={worldbook.id}
              onClick={() => onSelectWb(worldbook.id)}
              className={`neo-panel-soft group cursor-pointer rounded-[26px] p-4 transition-all ${
                activeWorldbookId === worldbook.id ? "ring-1 ring-brand-200/70 shadow-[0_16px_32px_rgba(96,165,250,0.12)]" : "hover:-translate-y-0.5"
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <div className="neo-panel-soft flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-[16px] text-sky-500">
                    <BookOpen className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-semibold text-ink-700">{worldbook.name}</h3>
                    {worldbook.description ? <p className="mt-0.5 truncate text-xs text-ink-300">{worldbook.description}</p> : null}
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      {worldbook.tags?.map((tag) => (
                        <span key={tag} className="neo-pill text-xs text-ink-500">
                          {tag}
                        </span>
                      ))}
                      <span className="neo-pill inline-flex items-center gap-1 text-[10px] text-ink-400">
                        <ChevronRight className="h-3 w-3" />
                        条目
                      </span>
                    </div>
                  </div>
                </div>
                <div className="ml-2 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100" onClick={(e) => e.stopPropagation()}>
                  <button onClick={() => onEditWb(worldbook)} className="neo-button flex h-8 w-8 items-center justify-center rounded-full text-ink-300 hover:text-brand-500">
                    <Edit3 className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={() => { onSelectWb(null); onDeleteWb(worldbook); }} className="neo-button flex h-8 w-8 items-center justify-center rounded-full text-ink-300 hover:text-rose-500">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {activeWorldbook ? (
        <div className="neo-panel-soft rounded-[28px] p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-ink-700">{activeWorldbook.name} · 条目</h3>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-300" />
                <input type="text" value={entrySearch} onChange={(e) => onEntrySearchChange(e.target.value)} placeholder="搜索条目..." className="neo-input w-44 rounded-input py-2 pl-7 pr-2 text-xs" />
              </div>
              <button onClick={onCreateEntry} className="neo-button-primary flex items-center gap-1 rounded-[18px] px-3 py-2 text-xs">
                <Plus className="h-3 w-3" />
                新条目
              </button>
            </div>
          </div>

          {entries.length === 0 ? (
            <p className="py-6 text-center text-xs text-ink-300">暂无条目，点击「新条目」创建。</p>
          ) : (
            <div className="space-y-2.5">
              {entries.map((entry) => (
                <div key={entry.id} className={`neo-panel-soft group flex items-start gap-3 rounded-[22px] p-3 ${!entry.enabled ? "opacity-50" : ""}`}>
                  <button onClick={() => onToggleEntry(entry)} className={`neo-button mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full ${entry.enabled ? "text-emerald-500" : "text-ink-300"}`}>
                    <span className="text-xs">{entry.enabled ? "✓" : ""}</span>
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h4 className="truncate text-sm font-medium text-ink-700">{entry.title}</h4>
                      <span className="neo-pill text-[10px] text-ink-500">P{entry.priority}</span>
                      {entry.category !== "general" ? <span className="neo-pill text-[10px] text-ink-400">{entry.category}</span> : null}
                    </div>
                    {entry.triggers && entry.triggers.length > 0 ? (
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {entry.triggers.map((trigger) => (
                          <span key={trigger} className="neo-pill bg-sky-50/80 text-[10px] text-sky-600">
                            {trigger}
                          </span>
                        ))}
                      </div>
                    ) : null}
                    <p className="mt-1 line-clamp-2 text-xs text-ink-300">{entry.content}</p>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <button onClick={() => onEditEntry(entry)} className="neo-button flex h-8 w-8 items-center justify-center rounded-full text-ink-300 hover:text-brand-500">
                      <Edit3 className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => onDeleteEntry(entry)} className="neo-button flex h-8 w-8 items-center justify-center rounded-full text-ink-300 hover:text-rose-500">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
