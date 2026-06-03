import { useEffect, useState } from "react";
import type { MemoryRow } from "../../types/database";

interface MemoryEditorProps {
  memory: MemoryRow | null;
  types: { value: string; label: string }[];
  onSave: (content: string, type: string, title: string, salience: number) => Promise<void>;
  onClose: () => void;
}

export function MemoryEditor({ memory, types, onSave, onClose }: MemoryEditorProps) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [memType, setMemType] = useState("user_preference");
  const [salience, setSalience] = useState(50);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (memory) {
      setTitle(memory.title || "");
      setContent(memory.content);
      setMemType(memory.memory_type);
      setSalience(memory.salience);
      return;
    }

    setTitle("");
    setContent("");
    setMemType("user_preference");
    setSalience(50);
  }, [memory]);

  async function handleSave() {
    if (!content.trim()) return;
    setSaving(true);
    await onSave(content.trim(), memType, title.trim(), salience);
    setSaving(false);
    onClose();
  }

  return (
    <div className="space-y-5">
      <div>
        <label className="mb-1 block text-xs font-medium text-ink-500">标题</label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="例如：用户偏好慢节奏"
          className="neo-input w-full rounded-input px-3 py-2.5 text-sm"
        />
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-ink-500">类型</label>
        <select value={memType} onChange={(e) => setMemType(e.target.value)} className="neo-input w-full rounded-input px-3 py-2.5 text-sm">
          {types.map(({ value, label }) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-ink-500">内容 *</label>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="记忆内容..."
          rows={5}
          className="neo-input w-full rounded-input resize-y px-3 py-2.5 text-sm"
        />
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-ink-500">重要度（{salience}）</label>
        <input type="range" min={1} max={100} value={salience} onChange={(e) => setSalience(Number(e.target.value))} className="w-full accent-amber-500" />
        <p className="mt-1 text-xs text-ink-300">数值越高越优先注入，Token 紧张时低重要度可能被跳过。</p>
      </div>

      <div className="theme-editor-footer mobile-modal-safe-footer sticky bottom-0 z-10 -mx-1 mt-6 flex gap-2 rounded-[24px] px-1 py-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !content.trim()}
          className="neo-button-primary flex-1 rounded-[18px] px-4 py-2.5 text-sm disabled:opacity-50"
        >
          {saving ? "保存中..." : "保存记忆"}
        </button>
        <button type="button" onClick={onClose} className="neo-button rounded-[18px] px-4 py-2.5 text-sm text-ink-600">
          取消
        </button>
      </div>
    </div>
  );
}
