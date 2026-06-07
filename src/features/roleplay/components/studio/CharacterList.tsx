import { Archive, Edit3, Plus, Search, Star, Trash2, Upload, X } from "lucide-react";
import type { CharacterRow } from "../../types/database";
import { parseCharacterCard } from "../../utils/characterPrompt";

interface CharacterListProps {
  characters: CharacterRow[];
  loading: boolean;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  filterTag: string | null;
  onFilterTag: (t: string | null) => void;
  onEdit: (c: CharacterRow) => void;
  onDelete: (c: CharacterRow) => void;
  onArchive: (c: CharacterRow) => void;
  onToggleFavorite: (c: CharacterRow) => void;
  onCreate: () => void;
  onImport: () => void;
  onSelect?: (c: CharacterRow) => void;
  selectable?: boolean;
}

export function CharacterList({
  characters,
  loading,
  searchQuery,
  onSearchChange,
  filterTag,
  onFilterTag,
  onEdit,
  onDelete,
  onArchive,
  onToggleFavorite,
  onCreate,
  onImport,
  onSelect,
  selectable,
}: CharacterListProps) {
  const allTags = [...new Set(characters.flatMap((c) => c.tags ?? []))].sort();

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-300" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="搜索角色..."
            className="neo-input w-full rounded-input py-2.5 pl-9 pr-3 text-sm"
          />
        </div>
        <button onClick={onImport} className="neo-button flex items-center gap-1.5 rounded-[20px] px-4 py-2.5 text-xs text-ink-500">
          <Upload className="h-3.5 w-3.5" />
          导入
        </button>
        <button onClick={onCreate} className="neo-button-primary flex items-center gap-1.5 rounded-[20px] px-4 py-2.5 text-xs">
          <Plus className="h-3.5 w-3.5" />
          创建
        </button>
      </div>

      {allTags.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          {allTags.map((tag) => (
            <button
              key={tag}
              onClick={() => onFilterTag(filterTag === tag ? null : tag)}
              className={filterTag === tag ? "neo-button-pressed rounded-full px-3 py-1 text-xs text-brand-700" : "neo-button rounded-full px-3 py-1 text-xs text-ink-500"}
            >
              {tag}
            </button>
          ))}
          {filterTag ? (
            <button onClick={() => onFilterTag(null)} className="neo-button flex h-8 w-8 items-center justify-center rounded-full text-ink-400">
              <X className="h-3 w-3" />
            </button>
          ) : null}
        </div>
      ) : null}

      {loading ? (
        <p className="py-8 text-center text-xs text-ink-300">加载中...</p>
      ) : characters.length === 0 ? (
        <div className="neo-panel-soft py-12 text-center">
          <p className="text-sm text-ink-400">暂无角色</p>
          <p className="mt-1 text-xs text-ink-300">点击「创建」开始打造你的第一个角色。</p>
        </div>
      ) : (
        <div className="space-y-3">
          {characters.map((character) => {
            const card = parseCharacterCard(character);
            return (
              <div
                key={character.id}
                onClick={() => selectable && onSelect?.(character)}
                className={`neo-panel-soft group flex items-start gap-3 rounded-[26px] p-4 ${
                  selectable ? "cursor-pointer hover:-translate-y-0.5 hover:ring-1 hover:ring-brand-200/60" : ""
                } ${character.archived_at ? "opacity-50" : ""}`}
              >
                <div className="neo-panel-soft flex h-12 w-12 flex-shrink-0 items-center justify-center overflow-hidden rounded-[18px] text-lg text-brand-500">
                  {character.avatar_path?.startsWith("data:") ? (
                    <img src={character.avatar_path} alt={character.name} className="h-full w-full object-cover" />
                  ) : (
                    character.avatar_emoji || character.name[0]
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="truncate text-sm font-semibold text-ink-700">{character.name}</h3>
                    {character.is_favorite ? <Star className="h-3 w-3 flex-shrink-0 fill-amber-400 text-amber-400" /> : null}
                    {character.archived_at ? <span className="neo-pill bg-surface-100/80 text-[10px] text-ink-400">已归档</span> : null}
                  </div>
                  <p className="mt-0.5 line-clamp-2 text-xs text-ink-300">
                    {card.identity || card.personality || character.summary || "未填写角色设定"}
                  </p>
                  {character.tags && character.tags.length > 0 ? (
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {character.tags.map((tag) => (
                        <span key={tag} className="neo-pill text-xs text-ink-500">
                          {tag}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
                <div className="flex flex-shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                  <button onClick={(e) => { e.stopPropagation(); onToggleFavorite(character); }} className="neo-button flex h-8 w-8 items-center justify-center rounded-full text-ink-300 hover:text-amber-400" title="收藏">
                    <Star className={`h-3.5 w-3.5 ${character.is_favorite ? "fill-amber-400 text-amber-400" : ""}`} />
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); onEdit(character); }} className="neo-button flex h-8 w-8 items-center justify-center rounded-full text-ink-300 hover:text-brand-500" title="编辑">
                    <Edit3 className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); onArchive(character); }} className="neo-button flex h-8 w-8 items-center justify-center rounded-full text-ink-300 hover:text-amber-500" title="归档">
                    <Archive className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); onDelete(character); }} className="neo-button flex h-8 w-8 items-center justify-center rounded-full text-ink-300 hover:text-rose-500" title="删除">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
