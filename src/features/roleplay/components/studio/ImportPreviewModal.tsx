import type { PreparedImport } from "../../import/types";

export function ImportPreviewModal({
  prepared,
  onConfirm,
  onClose,
}: {
  prepared: PreparedImport;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="neo-panel-soft flex h-14 w-14 flex-shrink-0 items-center justify-center overflow-hidden rounded-[18px] text-xl text-brand-500">
          {prepared.avatarDataUrl ? (
            <img src={prepared.avatarDataUrl} alt={prepared.name} className="h-full w-full object-cover" />
          ) : (
            prepared.name[0]
          )}
        </div>
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-ink-800">{prepared.name}</h3>
          <p className="text-xs text-ink-400">
            规范 {prepared.sourceSpec.toUpperCase()}
            {prepared.worldbook ? ` · 世界书 ${prepared.worldbook.entries.length} 条` : ""}
          </p>
        </div>
      </div>
      <p className="line-clamp-3 text-xs text-ink-400">{prepared.card.identity || "（无简介）"}</p>
      <div className="flex gap-2">
        <button onClick={onConfirm} className="neo-button-primary flex-1 rounded-[18px] px-4 py-2.5 text-sm">
          导入
        </button>
        <button onClick={onClose} className="neo-button rounded-[18px] px-4 py-2.5 text-sm text-ink-600">
          取消
        </button>
      </div>
    </div>
  );
}
