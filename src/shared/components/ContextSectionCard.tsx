import type { ReactNode } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";

interface ContextSectionCardProps {
  title: string;
  icon: ReactNode;
  badge?: string;
  defaultOpen?: boolean;
  children: ReactNode;
  level?: 1 | 2 | 3;
  variant?: "default" | "active" | "muted" | "debug";
}

export function ContextSectionCard({
  title,
  icon,
  badge,
  defaultOpen = false,
  children,
  level = 1,
  variant = "default",
}: ContextSectionCardProps) {
  const [open, setOpen] = useState(defaultOpen);

  const levelStyles = {
    1: "neo-panel-soft",
    2: "neo-panel-soft",
    3: "neo-panel-soft",
  };

  const variantStyles = {
    default: "",
    active: "ring-1 ring-brand-200/60 shadow-[0_12px_32px_rgba(96,165,250,0.12)]",
    muted: "opacity-80",
    debug: "theme-section-accent",
  };

  return (
    <div className={`${levelStyles[level]} ${variantStyles[variant]} mb-3 p-2 last:mb-0`}>
      <button
        onClick={() => setOpen((value) => !value)}
        className={`flex min-h-[44px] w-full items-center gap-2 rounded-[18px] px-3 py-2.5 text-xs transition-all ${
          open ? "neo-button-pressed" : "neo-button"
        }`}
      >
        {open ? (
          <ChevronDown className="h-3 w-3 flex-shrink-0 text-sky-400" />
        ) : (
          <ChevronRight className="h-3 w-3 flex-shrink-0 text-sky-400" />
        )}
        <span className="flex-shrink-0 text-sky-500">{icon}</span>
        <span className="flex-1 text-left font-medium text-ink-700">{title}</span>
        {badge && (
          <span className="neo-pill bg-sky-50/80 px-2 py-0.5 text-[10px] text-sky-600">
            {badge}
          </span>
        )}
      </button>
      {open && <div className="px-3 pb-3 pt-3">{children}</div>}
    </div>
  );
}
