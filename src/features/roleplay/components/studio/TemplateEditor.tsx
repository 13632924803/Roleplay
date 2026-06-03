import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { PromptTemplateRow } from "../../types/database";

interface TemplateEditorProps {
  template: PromptTemplateRow | null;
  categories: { value: string; label: string }[];
  onSave: (title: string, content: string, category: string, tags: string[], description: string) => Promise<void>;
  onClose: () => void;
}

const VARIABLES = [
  { key: "{{character_name}}", desc: "角色名称" },
  { key: "{{user_name}}", desc: "用户称呼" },
  { key: "{{current_scene}}", desc: "当前场景" },
  { key: "{{relationship_stage}}", desc: "关系阶段" },
  { key: "{{speaking_style}}", desc: "说话风格" },
  { key: "{{greeting}}", desc: "开场白" },
];

export function TemplateEditor({ template, categories, onSave, onClose }: TemplateEditorProps) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [category, setCategory] = useState("general");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (template) {
      setTitle(template.title);
      setContent(template.content);
      setCategory(template.category);
      setDescription(template.description ?? "");
      setTags(template.tags ?? []);
      return;
    }

    setTitle("");
    setContent("");
    setCategory("general");
    setDescription("");
    setTags([]);
  }, [template]);

  function addTag() {
    const trimmed = tagInput.trim();
    if (trimmed && !tags.includes(trimmed)) {
      setTags((prev) => [...prev, trimmed]);
    }
    setTagInput("");
  }

  function insertVariable(key: string) {
    setContent((prev) => `${prev} ${key} `.trim());
  }

  async function handleSave() {
    if (!title.trim() || !content.trim()) return;
    setSaving(true);
    await onSave(title.trim(), content.trim(), category, tags, description.trim());
    setSaving(false);
    onClose();
  }

  return (
    <div className="space-y-5">
      <div>
        <label className="mb-1 block text-xs font-medium text-ink-500">模板名称 *</label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="例如：沉浸式角色扮演"
          className="neo-input w-full rounded-input px-3 py-2.5 text-sm"
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-ink-500">分类</label>
          <select value={category} onChange={(e) => setCategory(e.target.value)} className="neo-input w-full rounded-input px-3 py-2.5 text-sm">
            {categories.map(({ value, label }) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-ink-500">描述</label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="模板用途说明"
            className="neo-input w-full rounded-input px-3 py-2.5 text-sm"
          />
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-ink-500">模板内容 *</label>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="编写提示词模板..."
          rows={9}
          className="neo-input w-full rounded-input resize-y px-3 py-2.5 font-mono text-sm"
        />
      </div>

      <div>
        <label className="mb-1.5 block text-xs font-medium text-ink-500">可用变量（点击插入）</label>
        <div className="flex flex-wrap gap-1.5">
          {VARIABLES.map(({ key, desc }) => (
            <button key={key} onClick={() => insertVariable(key)} className="neo-button rounded-full px-3 py-1.5 text-xs text-brand-600" title={desc}>
              {key}
            </button>
          ))}
        </div>
      </div>

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

      <div className="theme-editor-footer mobile-modal-safe-footer sticky bottom-0 z-10 -mx-1 mt-6 flex gap-2 rounded-[24px] px-1 py-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !title.trim() || !content.trim()}
          className="neo-button-primary flex-1 rounded-[18px] px-4 py-2.5 text-sm disabled:opacity-50"
        >
          {saving ? "保存中..." : template ? "保存修改" : "创建模板"}
        </button>
        <button type="button" onClick={onClose} className="neo-button rounded-[18px] px-4 py-2.5 text-sm text-ink-600">
          取消
        </button>
      </div>
    </div>
  );
}
