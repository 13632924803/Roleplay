import { useEffect, useState } from "react";
import { BookOpen, Plus, Trash2 } from "lucide-react";
import type { CharacterRow, WorldbookRow } from "../../types/database";
import type { CharacterCardData } from "../../utils/characterPrompt";
import { EMPTY_CARD, parseCharacterCard } from "../../utils/characterPrompt";
import { supabase } from "../../../auth/supabaseClient";
import * as Repo from "../../repositories/roleplayRepository";

interface CharacterEditorProps {
  character: CharacterRow | null;
  onSave: (name: string, card: CharacterCardData, tags: string[]) => Promise<void>;
  onClose: () => void;
}

interface FieldDef {
  key: keyof CharacterCardData;
  label: string;
  placeholder: string;
  rows?: number;
}

const FIELDS: FieldDef[] = [
  { key: "identity", label: "身份定位", placeholder: "例如：古风酒馆老板娘、赛博黑客、中世纪骑士..." },
  { key: "appearance", label: "外貌描述", placeholder: "外貌特征、穿着打扮、标志性外观...", rows: 3 },
  { key: "personality", label: "性格特质", placeholder: "核心性格、行为模式、情绪倾向...", rows: 3 },
  { key: "background", label: "背景故事", placeholder: "身世、经历、重要事件...", rows: 3 },
  { key: "speaking_style", label: "说话风格", placeholder: "语气、用词习惯、口头禅、口语化程度..." },
  { key: "relationship", label: "与用户关系", placeholder: "例如：青梅竹马、导师与学徒、雇主与侍从..." },
  { key: "relationship_stage", label: "当前关系阶段", placeholder: "例如：刚刚相识、互相信任、有所戒备..." },
  { key: "user_nickname", label: "称呼用户", placeholder: "角色如何称呼用户" },
  { key: "greeting", label: "开场白", placeholder: "角色首次对话的开场白...", rows: 3 },
  { key: "likes", label: "喜欢互动", placeholder: "角色喜欢的互动方式和内容" },
  { key: "forbidden_rules", label: "行为边界", placeholder: "禁止的行为、话题或表达方式...", rows: 2 },
];

export function CharacterEditor({ character, onSave, onClose }: CharacterEditorProps) {
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [card, setCard] = useState<CharacterCardData>(EMPTY_CARD);
  const [saving, setSaving] = useState(false);
  const [boundWbIds, setBoundWbIds] = useState<string[]>([]);
  const [availableWbs, setAvailableWbs] = useState<WorldbookRow[]>([]);

  useEffect(() => {
    if (character) {
      setName(character.name);
      setEmoji(character.avatar_emoji || "");
      setTags(character.tags ?? []);
      const parsed = parseCharacterCard(character);
      setCard(parsed);
      setBoundWbIds((parsed.extra_settings?.bound_worldbook_ids as string[]) ?? []);
      return;
    }

    setName("");
    setEmoji("");
    setTags([]);
    setCard(EMPTY_CARD);
    setBoundWbIds([]);
  }, [character]);

  useEffect(() => {
    if (!supabase || !character?.user_id) {
      setAvailableWbs([]);
      return;
    }

    const loadWorldbooks = async () => {
      const rows = await Repo.listWorldbooks(supabase!, character.user_id);
      setAvailableWbs(rows);
    };

    void loadWorldbooks();
  }, [character]);

  function updateCardField(key: keyof CharacterCardData, value: string) {
    setCard((prev) => ({ ...prev, [key]: value }));
  }

  function toggleWb(wbId: string) {
    setBoundWbIds((prev) => (prev.includes(wbId) ? prev.filter((id) => id !== wbId) : [...prev, wbId]));
  }

  function addTag() {
    const trimmed = tagInput.trim();
    if (trimmed && !tags.includes(trimmed)) {
      setTags((prev) => [...prev, trimmed]);
    }
    setTagInput("");
  }

  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true);
    await onSave(
      name.trim(),
      {
        ...card,
        extra_settings: {
          ...card.extra_settings,
          bound_worldbook_ids: boundWbIds,
        },
      },
      tags,
    );
    setSaving(false);
    onClose();
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-3 md:grid-cols-[1fr_104px]">
        <div>
          <label className="mb-1 block text-xs font-medium text-ink-500">角色名称 *</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="输入角色名称"
            className="neo-input w-full rounded-input px-3 py-2.5 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-ink-500">Emoji</label>
          <input
            type="text"
            value={emoji}
            onChange={(e) => setEmoji(e.target.value)}
            placeholder="🦋"
            maxLength={4}
            className="neo-input w-full rounded-input px-3 py-2.5 text-center text-sm"
          />
        </div>
      </div>

      {FIELDS.map(({ key, label, placeholder, rows }) => (
        <div key={key}>
          <label className="mb-1 block text-xs font-medium text-ink-500">{label}</label>
          {rows && rows > 1 ? (
            <textarea
              value={(card[key] as string) || ""}
              onChange={(e) => updateCardField(key, e.target.value)}
              placeholder={placeholder}
              rows={rows}
              className="neo-input w-full rounded-input resize-y px-3 py-2.5 text-sm"
            />
          ) : (
            <input
              type="text"
              value={(card[key] as string) || ""}
              onChange={(e) => updateCardField(key, e.target.value)}
              placeholder={placeholder}
              className="neo-input w-full rounded-input px-3 py-2.5 text-sm"
            />
          )}
        </div>
      ))}

      <div>
        <label className="mb-1 block text-xs font-medium text-ink-500">标签</label>
        <div className="flex gap-2">
          <input
            type="text"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addTag();
              }
            }}
            placeholder="输入后回车添加"
            className="neo-input flex-1 rounded-input px-3 py-2.5 text-sm"
          />
          <button type="button" onClick={addTag} className="neo-button flex items-center gap-1 rounded-[18px] px-3 py-2 text-xs text-ink-600">
            <Plus className="h-3 w-3" />
            添加
          </button>
        </div>
        {tags.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {tags.map((tag) => (
              <span key={tag} className="neo-pill theme-pill-brand inline-flex items-center gap-1 text-xs">
                {tag}
                <button type="button" onClick={() => setTags(tags.filter((item) => item !== tag))} className="p-0.5 hover:text-rose-500">
                  <Trash2 className="h-2.5 w-2.5" />
                </button>
              </span>
            ))}
          </div>
        ) : null}
      </div>

      {availableWbs.length > 0 ? (
        <div>
          <label className="mb-2 block text-xs font-medium text-ink-500">关联世界书</label>
          <div className="scrollbar-none max-h-40 space-y-2 overflow-y-auto">
            {availableWbs.map((wb) => (
              <label key={wb.id} className="neo-panel-soft flex cursor-pointer items-center gap-2.5 px-3 py-2.5 transition-all hover:-translate-y-0.5">
                <input type="checkbox" checked={boundWbIds.includes(wb.id)} onChange={() => toggleWb(wb.id)} className="rounded" />
                <BookOpen className="h-3.5 w-3.5 text-sky-500" />
                <span className="flex-1 truncate text-sm text-ink-700">{wb.name}</span>
              </label>
            ))}
          </div>
          <p className="mt-1 text-xs text-ink-300">勾选的世界书会在聊天时参与上下文命中。</p>
        </div>
      ) : null}

      <div className="theme-editor-footer mobile-modal-safe-footer sticky bottom-0 z-10 -mx-1 mt-6 flex gap-2 rounded-[24px] px-1 py-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !name.trim()}
          className="neo-button-primary flex-1 rounded-[18px] px-4 py-2.5 text-sm disabled:opacity-50"
        >
          {saving ? "保存中..." : character ? "保存修改" : "创建角色"}
        </button>
        <button type="button" onClick={onClose} className="neo-button rounded-[18px] px-4 py-2.5 text-sm text-ink-600">
          取消
        </button>
      </div>
    </div>
  );
}
