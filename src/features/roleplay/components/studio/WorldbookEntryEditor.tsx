import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { WorldbookEntryRow, WorldbookRow } from "../../types/database";

interface WorldbookEntryEditorProps {
  entry: WorldbookEntryRow | null;
  worldbook: WorldbookRow;
  onSave: (title: string, content: string, triggers: string[], priority: number, category: string) => Promise<void>;
  onClose: () => void;
}

const CATEGORIES = ["general", "location", "character", "faction", "item", "event", "rule", "term"];

export function WorldbookEntryEditor({ entry, worldbook, onSave, onClose }: WorldbookEntryEditorProps) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [triggers, setTriggers] = useState<string[]>([]);
  const [triggerInput, setTriggerInput] = useState("");
  const [priority, setPriority] = useState(100);
  const [category, setCategory] = useState("general");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (entry) {
      setTitle(entry.title);
      setContent(entry.content);
      setTriggers(entry.triggers ?? []);
      setPriority(entry.priority);
      setCategory(entry.category);
      return;
    }

    setTitle("");
    setContent("");
    setTriggers([]);
    setPriority(100);
    setCategory("general");
  }, [entry]);

  function addTrigger() {
    const trimmed = triggerInput.trim();
    if (trimmed && !triggers.includes(trimmed)) {
      setTriggers((prev) => [...prev, trimmed]);
    }
    setTriggerInput("");
  }

  async function handleSave() {
    if (!title.trim() || !content.trim()) return;
    setSaving(true);
    await onSave(title.trim(), content.trim(), triggers, priority, category);
    setSaving(false);
    onClose();
  }

  return (
    <div className="space-y-5">
      <div className="neo-panel-soft px-4 py-3">
        <p className="text-xs font-medium text-ink-500">当前世界书</p>
        <p className="mt-1 text-sm font-semibold text-ink-700">{worldbook.name}</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-ink-500">条目名称 *</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="例如：蝶屋"
            className="neo-input w-full rounded-input px-3 py-2.5 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-ink-500">分类</label>
          <select value={category} onChange={(e) => setCategory(e.target.value)} className="neo-input w-full rounded-input px-3 py-2.5 text-sm">
            {CATEGORIES.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-ink-500">内容 *</label>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="世界书条目内容..."
          rows={6}
          className="neo-input w-full rounded-input resize-y px-3 py-2.5 text-sm"
        />
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-ink-500">触发关键词</label>
        <div className="flex gap-2">
          <input
            type="text"
            value={triggerInput}
            onChange={(e) => setTriggerInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addTrigger();
              }
            }}
            placeholder="输入后回车添加"
            className="neo-input flex-1 rounded-input px-3 py-2.5 text-sm"
          />
          <button type="button" onClick={addTrigger} className="neo-button flex items-center gap-1 rounded-[18px] px-3 py-2 text-xs text-ink-600">
            <Plus className="h-3 w-3" />
            添加
          </button>
        </div>
        {triggers.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {triggers.map((trigger) => (
              <span key={trigger} className="neo-pill theme-pill-info inline-flex items-center gap-1 text-xs">
                {trigger}
                <button type="button" onClick={() => setTriggers(triggers.filter((item) => item !== trigger))} className="p-0.5 hover:text-rose-500">
                  <Trash2 className="h-2.5 w-2.5" />
                </button>
              </span>
            ))}
          </div>
        ) : null}
        <p className="mt-1 text-xs text-ink-300">用户消息中出现任一关键词时触发该条目。</p>
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-ink-500">优先级（{priority}）</label>
        <input type="range" min={1} max={200} value={priority} onChange={(e) => setPriority(Number(e.target.value))} className="w-full accent-sky-500" />
        <p className="mt-1 text-xs text-ink-300">数值越高越优先注入，Token 预算紧张时低优先级可能被跳过。</p>
      </div>

      <div className="theme-editor-footer mobile-modal-safe-footer sticky bottom-0 z-10 -mx-1 mt-6 flex gap-2 rounded-[24px] px-1 py-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !title.trim() || !content.trim()}
          className="neo-button-primary flex-1 rounded-[18px] px-4 py-2.5 text-sm disabled:opacity-50"
        >
          {saving ? "保存中..." : "保存条目"}
        </button>
        <button type="button" onClick={onClose} className="neo-button rounded-[18px] px-4 py-2.5 text-sm text-ink-600">
          取消
        </button>
      </div>
    </div>
  );
}
