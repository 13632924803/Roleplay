import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Brain, ChevronLeft, ChevronRight, Copy, Edit3, MoreHorizontal, RotateCcw, Trash2 } from "lucide-react";
import type { ChatMessage } from "../../providers/provider.types";
import type { MessageRevisionRow } from "../../types/database";

interface MessageBubbleProps {
  message: ChatMessage;
  index: number;
  onCopy?: () => void;
  onDelete?: () => void;
  onRegenerate?: () => void;
  onEdit?: () => void;
  onExtractMemory?: () => void;
  isStreaming?: boolean;
  revisionCount?: number;
  revisions?: MessageRevisionRow[];
  onLoadRevisions?: () => Promise<MessageRevisionRow[]> | void;
}

export function MessageBubble({
  message,
  onCopy,
  onDelete,
  onRegenerate,
  onEdit,
  onExtractMemory,
  isStreaming,
  revisionCount = 0,
  revisions,
  onLoadRevisions,
}: MessageBubbleProps) {
  const isUser = message.role === "user";
  const isSystem = message.role === "system";
  const [selectedVersionIndex, setSelectedVersionIndex] = useState(0);
  const [loadingRevisions, setLoadingRevisions] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMobileMenuOpen(false);
      }
    }
    if (mobileMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [mobileMenuOpen]);

  const loadedVersions = useMemo(() => {
    const sorted = [...(revisions ?? [])].sort((a, b) => a.revision_no - b.revision_no);
    return [...sorted.map((revision) => revision.content_text), message.content];
  }, [message.content, revisions]);

  const hasLoadedRevisions = revisions !== undefined;
  const totalVersions = hasLoadedRevisions ? loadedVersions.length : Math.max(1, revisionCount + 1);
  const hasVersions = !isSystem && !isStreaming && totalVersions > 1;
  const safeVersionIndex = Math.min(selectedVersionIndex, totalVersions - 1);
  const displayedContent =
    hasLoadedRevisions && safeVersionIndex < loadedVersions.length
      ? loadedVersions[safeVersionIndex]
      : message.content;
  const atFirst = safeVersionIndex <= 0;
  const atLast = safeVersionIndex >= totalVersions - 1;

  useEffect(() => {
    setSelectedVersionIndex(Math.max(0, totalVersions - 1));
  }, [message.content, revisionCount, totalVersions]);

  async function moveVersion(delta: number) {
    const nextIndex = Math.max(0, Math.min(totalVersions - 1, safeVersionIndex + delta));
    if (nextIndex === safeVersionIndex || loadingRevisions) return;

    if (!hasLoadedRevisions && onLoadRevisions) {
      setLoadingRevisions(true);
      try {
        await onLoadRevisions();
      } catch (error) {
        console.warn("[Chat] message revision lazy load failed:", error);
      } finally {
        setLoadingRevisions(false);
      }
    }

    setSelectedVersionIndex(nextIndex);
  }

  if (isSystem) {
    return (
      <div className="flex justify-center py-2">
        <span className="rounded-full bg-surface-100 px-3 py-1 text-xs italic text-ink-300">
          {message.content}
        </span>
      </div>
    );
  }

  return (
    <div className={`group mb-4 flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`relative max-w-[82%] px-4 py-3 ${
          isUser
            ? "theme-chat-user rounded-[24px] rounded-br-lg"
            : "theme-chat-ai rounded-[24px] rounded-bl-lg"
        }`}
      >
        <p className={`mb-0.5 text-xs ${isUser ? "text-brand-100" : "text-ink-300"}`}>
          {isUser ? "你" : "AI"}
          {isStreaming && !isUser && (
            <span className="ml-1.5 inline-block h-3 w-1.5 animate-pulse rounded-full bg-brand-400 align-middle" />
          )}
          {hasVersions && (
            <span className="ml-1 text-[10px] opacity-70">
              {safeVersionIndex + 1} / {totalVersions}
            </span>
          )}
        </p>

        <p className={`break-words whitespace-pre-wrap text-sm leading-relaxed ${isUser ? "text-white" : "text-ink-700"}`}>
          {displayedContent}
          {isStreaming && !isUser && (
            <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse rounded-sm bg-ink-400 align-text-bottom" />
          )}
        </p>

        {!isStreaming && (
          <>
            {/* Desktop: hover-based action bar */}
            <div
              className={`mt-2 hidden items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 md:flex ${
                isUser ? "justify-end" : "justify-start"
              }`}
            >
              {hasVersions && (
                <div className={`mr-1 flex items-center gap-0.5 ${isUser ? "text-white/70" : "text-ink-400"}`}>
                  <VersionButton
                    direction="left"
                    disabled={atFirst || loadingRevisions}
                    isUser={isUser}
                    onClick={() => void moveVersion(-1)}
                  />
                  <span className="min-w-[2.75rem] select-none text-center text-[10px] leading-none">
                    {safeVersionIndex + 1} / {totalVersions}
                  </span>
                  <VersionButton
                    direction="right"
                    disabled={atLast || loadingRevisions}
                    isUser={isUser}
                    onClick={() => void moveVersion(1)}
                  />
                </div>
              )}

              <ActionBtn icon={<Copy className="h-3 w-3" />} title="复制" onClick={onCopy} isUser={isUser} />
              {!isUser && onRegenerate && (
                <ActionBtn icon={<RotateCcw className="h-3 w-3" />} title="重新生成" onClick={onRegenerate} isUser={isUser} />
              )}
              {isUser && onEdit && (
                <ActionBtn icon={<Edit3 className="h-3 w-3" />} title="编辑" onClick={onEdit} isUser={isUser} />
              )}
              {onExtractMemory && (
                <ActionBtn icon={<Brain className="h-3 w-3" />} title="提炼记忆" onClick={onExtractMemory} isUser={isUser} />
              )}
              <ActionBtn icon={<Trash2 className="h-3 w-3" />} title="删除" onClick={onDelete} isUser={isUser} />
            </div>

            {/* Mobile: version arrows + "⋯" menu button */}
            <div className={`mt-2 flex items-center gap-1 md:hidden ${isUser ? "justify-end" : "justify-start"}`}>
              {hasVersions && (
                <div className={`mr-1 flex items-center gap-0.5 ${isUser ? "text-white/70" : "text-ink-400"}`}>
                  <VersionButton
                    direction="left"
                    disabled={atFirst || loadingRevisions}
                    isUser={isUser}
                    onClick={() => void moveVersion(-1)}
                  />
                  <span className="min-w-[2.75rem] select-none text-center text-[10px] leading-none">
                    {safeVersionIndex + 1} / {totalVersions}
                  </span>
                  <VersionButton
                    direction="right"
                    disabled={atLast || loadingRevisions}
                    isUser={isUser}
                    onClick={() => void moveVersion(1)}
                  />
                </div>
              )}
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setMobileMenuOpen((v) => !v); }}
                className={`rounded p-1 transition-colors ${
                  isUser
                    ? "text-white/60 hover:bg-white/10 hover:text-white"
                    : "text-ink-300 hover:bg-surface-100 hover:text-ink-500"
                }`}
              >
                <MoreHorizontal className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Mobile menu popover */}
            {mobileMenuOpen && (
              <div
                ref={menuRef}
                className={`theme-panel absolute z-40 mt-1 w-44 rounded-2xl py-1.5 md:hidden ${
                  isUser ? "right-0" : "left-0"
                }`}
                style={{ top: "100%" }}
              >
                {hasVersions && (
                  <>
                    <div className="flex items-center justify-between px-3 py-1.5">
                      <span className="text-[11px] text-ink-400">版本切换</span>
                      <span className="text-[10px] text-ink-300">{safeVersionIndex + 1} / {totalVersions}</span>
                    </div>
                    <div className="flex items-center justify-center gap-2 px-3 py-1">
                      <VersionButton
                        direction="left"
                        disabled={atFirst || loadingRevisions}
                        isUser={false}
                        onClick={() => void moveVersion(-1)}
                      />
                      <span className="text-[10px] text-ink-400">上一版 / 下一版</span>
                      <VersionButton
                        direction="right"
                        disabled={atLast || loadingRevisions}
                        isUser={false}
                        onClick={() => void moveVersion(1)}
                      />
                    </div>
                    <div className="my-1 border-t border-surface-100" />
                  </>
                )}
                <MobileMenuItem icon={<Copy className="h-3.5 w-3.5" />} label="复制" onClick={() => { onCopy?.(); setMobileMenuOpen(false); }} />
                {isUser && onEdit && (
                  <MobileMenuItem icon={<Edit3 className="h-3.5 w-3.5" />} label="编辑" onClick={() => { onEdit(); setMobileMenuOpen(false); }} />
                )}
                {!isUser && onRegenerate && (
                  <MobileMenuItem icon={<RotateCcw className="h-3.5 w-3.5" />} label="重新生成" onClick={() => { onRegenerate(); setMobileMenuOpen(false); }} />
                )}
                {onExtractMemory && (
                  <MobileMenuItem icon={<Brain className="h-3.5 w-3.5" />} label="提炼记忆" onClick={() => { onExtractMemory(); setMobileMenuOpen(false); }} />
                )}
                <MobileMenuItem icon={<Trash2 className="h-3.5 w-3.5" />} label="删除" onClick={() => { onDelete?.(); setMobileMenuOpen(false); }} />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function VersionButton({
  direction,
  disabled,
  isUser,
  onClick,
}: {
  direction: "left" | "right";
  disabled: boolean;
  isUser: boolean;
  onClick: () => void;
}) {
  const Icon = direction === "left" ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={direction === "left" ? "上一版" : "下一版"}
      className={`rounded p-0.5 transition-colors ${
        disabled
          ? isUser
            ? "cursor-default text-white/30"
            : "cursor-default text-ink-200"
          : isUser
            ? "text-white/70 hover:bg-white/10 hover:text-white"
            : "text-ink-400 hover:bg-surface-100 hover:text-ink-600"
      }`}
    >
      <Icon className="h-3.5 w-3.5" />
    </button>
  );
}

function ActionBtn({
  icon,
  title,
  onClick,
  isUser,
}: {
  icon: ReactNode;
  title: string;
  onClick?: () => void;
  isUser: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`rounded p-1 transition-colors ${
        isUser
          ? "text-white/60 hover:bg-white/10 hover:text-white"
          : "text-ink-300 hover:bg-surface-100 hover:text-ink-500"
      }`}
    >
      {icon}
    </button>
  );
}

function MobileMenuItem({
  icon,
  label,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-ink-600 transition-colors hover:bg-surface-50"
    >
      <span className="flex-shrink-0 text-ink-400">{icon}</span>
      <span>{label}</span>
    </button>
  );
}
