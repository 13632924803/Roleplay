import { useState } from "react";
import { BookOpen, Brain, FileText, Palette, Users } from "lucide-react";
import { useAuth } from "../features/auth";
import { AppModal } from "../shared/components/AppModal";
import { ModeBadge } from "../shared/components/ModeBadge";
import { CharacterList } from "../features/roleplay/components/studio/CharacterList";
import { CharacterEditor } from "../features/roleplay/components/studio/CharacterEditor";
import { MemoryEditor } from "../features/roleplay/components/studio/MemoryEditor";
import { MemoryList } from "../features/roleplay/components/studio/MemoryList";
import { TemplateEditor } from "../features/roleplay/components/studio/TemplateEditor";
import { TemplateList } from "../features/roleplay/components/studio/TemplateList";
import { WorldbookEntryEditor } from "../features/roleplay/components/studio/WorldbookEntryEditor";
import { WorldbookList } from "../features/roleplay/components/studio/WorldbookList";
import { useCharacters } from "../features/roleplay/hooks/useCharacters";
import { useMemories } from "../features/roleplay/hooks/useMemories";
import { useTemplates } from "../features/roleplay/hooks/useTemplates";
import { useWorldbooks } from "../features/roleplay/hooks/useWorldbooks";
import type {
  CharacterRow,
  MemoryRow,
  PromptTemplateRow,
  WorldbookEntryRow,
  WorldbookRow,
} from "../features/roleplay/types/database";

type Tab = "characters" | "templates" | "worldbooks" | "memories";

function WbNameModal({
  worldbook,
  onSave,
  onClose,
}: {
  worldbook: WorldbookRow | null;
  onSave: (name: string, desc: string) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(worldbook?.name ?? "");
  const [desc, setDesc] = useState(worldbook?.description ?? "");

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-ink-800">{worldbook ? "编辑世界书" : "创建世界书"}</h3>
      <input
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder="世界书名称"
        className="neo-input w-full rounded-input px-3 py-2.5 text-sm"
        autoFocus
      />
      <input
        value={desc}
        onChange={(event) => setDesc(event.target.value)}
        placeholder="描述（可选）"
        className="neo-input w-full rounded-input px-3 py-2.5 text-sm"
      />
      <div className="theme-editor-footer mobile-modal-safe-footer sticky bottom-0 z-10 -mx-1 mt-6 flex gap-2 rounded-[24px] px-1 py-2">
        <button
          type="button"
          onClick={() => {
            onSave(name, desc);
            onClose();
          }}
          disabled={!name.trim()}
          className="neo-button-primary flex-1 rounded-[18px] px-4 py-2.5 text-sm disabled:opacity-50"
        >
          保存
        </button>
        <button type="button" onClick={onClose} className="neo-button rounded-[18px] px-4 py-2.5 text-sm text-ink-600">
          取消
        </button>
      </div>
    </div>
  );
}

export function StudioPage() {
  const { isGuestOrDemo, user } = useAuth();
  const [tab, setTab] = useState<Tab>("characters");

  const chars = useCharacters(user?.id, isGuestOrDemo);
  const tmpls = useTemplates(user?.id, isGuestOrDemo);
  const wbs = useWorldbooks(user?.id, isGuestOrDemo);
  const mems = useMemories(user?.id, isGuestOrDemo);

  const [editingChar, setEditingChar] = useState<CharacterRow | null>(null);
  const [showCharEditor, setShowCharEditor] = useState(false);
  const [editingTpl, setEditingTpl] = useState<PromptTemplateRow | null>(null);
  const [showTplEditor, setShowTplEditor] = useState(false);
  const [editingEntry, setEditingEntry] = useState<WorldbookEntryRow | null>(null);
  const [showEntryEditor, setShowEntryEditor] = useState(false);
  const [showWbModal, setShowWbModal] = useState(false);
  const [editingWb, setEditingWb] = useState<WorldbookRow | null>(null);
  const [editingMem, setEditingMem] = useState<MemoryRow | null>(null);
  const [showMemEditor, setShowMemEditor] = useState(false);

  const tabs: { key: Tab; label: string; icon: React.ReactNode; count: number }[] = [
    { key: "characters", label: "角色卡", icon: <Users className="h-4 w-4" />, count: chars.filtered.length },
    { key: "templates", label: "提示词", icon: <FileText className="h-4 w-4" />, count: tmpls.filtered.length },
    { key: "worldbooks", label: "世界书", icon: <BookOpen className="h-4 w-4" />, count: wbs.filteredWbs.length },
    { key: "memories", label: "记忆库", icon: <Brain className="h-4 w-4" />, count: mems.filtered.length },
  ];

  const activeWb = wbs.worldbooks.find((worldbook) => worldbook.id === wbs.activeWorldbookId) ?? null;

  return (
    <div className="page-container">
      <div className="neo-page-shell px-5 py-6 md:px-7 md:py-7">
        <div className="mb-6 flex items-center gap-3">
          <div className="neo-panel-soft flex h-10 w-10 items-center justify-center text-sky-500">
            <Palette className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-ink-900">创作工坊</h1>
            <p className="text-sm text-ink-400">管理角色卡、提示词、世界书和记忆。</p>
          </div>
          <ModeBadge />
        </div>

        <div className="theme-nav-shell scrollbar-none mb-6 flex gap-2 overflow-x-auto rounded-[24px] p-2">
          {tabs.map(({ key, label, icon, count }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex h-11 items-center gap-2 whitespace-nowrap px-4 text-sm font-medium transition-all ${
                tab === key ? "neo-button-pressed text-brand-700" : "neo-button text-ink-400 hover:text-ink-600"
              }`}
            >
              {icon}
              {label}
              <span className="neo-pill px-1.5 py-0.5 text-xs text-ink-500">{count}</span>
            </button>
          ))}
        </div>

        {tab === "characters" ? (
          <CharacterList
            characters={chars.filtered}
            loading={chars.loading}
            searchQuery={chars.searchQuery}
            onSearchChange={chars.setSearchQuery}
            filterTag={chars.filterTag}
            onFilterTag={chars.setFilterTag}
            onEdit={(character) => {
              setEditingChar(character);
              setShowCharEditor(true);
            }}
            onDelete={(character) => {
              if (
                confirm(
                  `删除角色“${character.name}”？\n\n这会软删除 / 归档角色：历史会话和消息会保留，但该角色会从创作工坊和新建会话选择中隐藏。`,
                )
              ) {
                void chars.remove(character.id);
              }
            }}
            onArchive={(character) => {
              void chars.archive(character.id);
            }}
            onToggleFavorite={(character) => {
              void chars.toggleFavorite(character.id, character.is_favorite);
            }}
            onCreate={() => {
              setEditingChar(null);
              setShowCharEditor(true);
            }}
          />
        ) : null}

        {tab === "templates" ? (
          <TemplateList
            templates={tmpls.filtered}
            loading={tmpls.loading}
            searchQuery={tmpls.searchQuery}
            onSearchChange={tmpls.setSearchQuery}
            filterCategory={tmpls.filterCategory}
            onFilterCategory={tmpls.setFilterCategory}
            filterTag={tmpls.filterTag}
            onFilterTag={tmpls.setFilterTag}
            onEdit={(template) => {
              setEditingTpl(template);
              setShowTplEditor(true);
            }}
            onDelete={(template) => {
              if (confirm(`删除模板“${template.title}”？`)) {
                void tmpls.remove(template.id);
              }
            }}
            onToggleFavorite={(template) => {
              void tmpls.toggleFavorite(template.id, template.is_favorite);
            }}
            onCreate={() => {
              setEditingTpl(null);
              setShowTplEditor(true);
            }}
            categories={tmpls.categories}
          />
        ) : null}

        {tab === "worldbooks" ? (
          <WorldbookList
            worldbooks={wbs.filteredWbs}
            entries={wbs.filteredEntries}
            loading={wbs.loading}
            activeWorldbookId={wbs.activeWorldbookId}
            onSelectWb={wbs.setActiveWorldbookId}
            onCreateWb={() => {
              setEditingWb(null);
              setShowWbModal(true);
            }}
            onEditWb={(worldbook) => {
              setEditingWb(worldbook);
              setShowWbModal(true);
            }}
            onDeleteWb={(worldbook) => {
              if (confirm(`删除世界书“${worldbook.name}”及其所有条目？`)) {
                void wbs.deleteWb(worldbook.id);
              }
            }}
            onCreateEntry={() => {
              setEditingEntry(null);
              setShowEntryEditor(true);
            }}
            onEditEntry={(entry) => {
              setEditingEntry(entry);
              setShowEntryEditor(true);
            }}
            onDeleteEntry={(entry) => {
              if (confirm(`删除条目“${entry.title}”？`)) {
                void wbs.deleteEntry(entry.id);
              }
            }}
            onToggleEntry={(entry) => {
              void wbs.toggleEntryEnabled(entry.id, entry.enabled);
            }}
            searchQuery={wbs.searchQuery}
            onSearchChange={wbs.setSearchQuery}
            entrySearch={wbs.entrySearch}
            onEntrySearchChange={wbs.setEntrySearch}
          />
        ) : null}

        {tab === "memories" ? (
          <MemoryList
            memories={mems.filtered}
            loading={mems.loading}
            types={mems.types}
            searchQuery={mems.searchQuery}
            onSearchChange={mems.setSearchQuery}
            filterType={mems.filterType}
            onFilterType={mems.setFilterType}
            onEdit={(memory) => {
              setEditingMem(memory);
              setShowMemEditor(true);
            }}
            onDelete={(memory) => {
              if (confirm("删除这条记忆？")) {
                void mems.remove(memory.id);
              }
            }}
            onToggle={(memory) => {
              void mems.toggleStatus(memory.id, memory.status);
            }}
            onCreate={() => {
              setEditingMem(null);
              setShowMemEditor(true);
            }}
          />
        ) : null}

        {showCharEditor ? (
          <AppModal
            open={showCharEditor}
            title={editingChar ? "编辑角色" : "创建角色"}
            description="设置角色的身份、性格、说话风格和基础规则。"
            onClose={() => {
              setShowCharEditor(false);
              setEditingChar(null);
            }}
            size="wide"
          >
            <CharacterEditor
              character={editingChar}
              onClose={() => {
                setShowCharEditor(false);
                setEditingChar(null);
              }}
              onSave={async (name, card, tags) => {
                if (editingChar) {
                  await chars.update(editingChar.id, name, card, tags);
                  return;
                }
                await chars.create(name, card, tags);
              }}
            />
          </AppModal>
        ) : null}

        {showTplEditor ? (
          <AppModal
            open={showTplEditor}
            title={editingTpl ? "编辑提示词模板" : "创建提示词模板"}
            description="设置提示词模板的内容和分类。"
            onClose={() => {
              setShowTplEditor(false);
              setEditingTpl(null);
            }}
            size="lg"
          >
            <TemplateEditor
              template={editingTpl}
              categories={tmpls.categories}
              onClose={() => {
                setShowTplEditor(false);
                setEditingTpl(null);
              }}
              onSave={async (title, content, category, tags, description) => {
                if (editingTpl) {
                  await tmpls.update(editingTpl.id, title, content, category, tags, description);
                  return;
                }
                await tmpls.create(title, content, category, tags, description);
              }}
            />
          </AppModal>
        ) : null}

        {showWbModal ? (
          <AppModal
            open={showWbModal}
            title={editingWb ? "编辑世界书" : "创建世界书"}
            description="设置世界书的名称和描述。"
            onClose={() => {
              setShowWbModal(false);
              setEditingWb(null);
            }}
            size="sm"
          >
            <WbNameModal
              worldbook={editingWb}
              onClose={() => {
                setShowWbModal(false);
                setEditingWb(null);
              }}
              onSave={(name, desc) => {
                if (editingWb) {
                  void wbs.updateWb(editingWb.id, name, desc);
                  return;
                }
                void wbs.createWb(name, desc);
              }}
            />
          </AppModal>
        ) : null}

        {showEntryEditor && activeWb ? (
          <AppModal
            open={showEntryEditor}
            title={editingEntry ? "编辑世界书条目" : "创建世界书条目"}
            description={`在世界书“${activeWb.name}”中添加条目。`}
            onClose={() => {
              setShowEntryEditor(false);
              setEditingEntry(null);
            }}
            size="lg"
          >
            <WorldbookEntryEditor
              entry={editingEntry}
              worldbook={activeWb}
              onClose={() => {
                setShowEntryEditor(false);
                setEditingEntry(null);
              }}
              onSave={async (title, content, triggers, priority, category) => {
                if (editingEntry) {
                  await wbs.updateEntry(editingEntry.id, title, content, triggers, priority, undefined, category);
                  return;
                }
                await wbs.createEntry(activeWb.id, title, content, triggers, priority, category);
              }}
            />
          </AppModal>
        ) : null}

        {showMemEditor ? (
          <AppModal
            open={showMemEditor}
            title={editingMem ? "编辑记忆" : "创建记忆"}
            description="设置记忆的内容、类型和重要度。"
            onClose={() => {
              setShowMemEditor(false);
              setEditingMem(null);
            }}
            size="md"
          >
            <MemoryEditor
              memory={editingMem}
              types={mems.types}
              onClose={() => {
                setShowMemEditor(false);
                setEditingMem(null);
              }}
              onSave={async (content, type, title, salience) => {
                if (editingMem) {
                  await mems.update(editingMem.id, content, type, title, salience);
                  return;
                }
                await mems.create(content, type, title, salience);
              }}
            />
          </AppModal>
        ) : null}
      </div>
    </div>
  );
}
