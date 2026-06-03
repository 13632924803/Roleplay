import { ChevronLeft, ChevronRight } from "lucide-react";

interface SidebarCollapseButtonProps {
  collapsed: boolean;
  onToggle: () => void;
  side?: "left" | "right";
  ariaLabel?: string;
  floating?: boolean;
}

export function SidebarCollapseButton({
  collapsed,
  onToggle,
  side = "left",
  ariaLabel,
  floating = false,
}: SidebarCollapseButtonProps) {
  const showRightArrow = side === "left" ? collapsed : !collapsed;
  const resolvedLabel = ariaLabel || (collapsed ? "展开侧边栏" : "折叠侧边栏");

  const baseClasses = floating
    ? "theme-card-subtle relative z-20 flex h-9 w-9 items-center justify-center rounded-full text-ink-600 transition-all duration-[320ms] hover:-translate-y-0.5 hover:text-brand-600 active:translate-y-0"
    : "theme-card-subtle relative z-20 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl text-ink-600 transition-all duration-[320ms] hover:-translate-y-0.5 hover:text-brand-600 active:translate-y-0";

  return (
    <button
      type="button"
      onClick={onToggle}
      className={baseClasses}
      title={resolvedLabel}
      aria-label={resolvedLabel}
    >
      {showRightArrow ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
    </button>
  );
}
