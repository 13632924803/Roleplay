import type { ReactNode } from "react";
import { Link } from "react-router-dom";

interface FeatureCardProps {
  icon: ReactNode;
  title: string;
  description: string;
  to?: string;
  color?: "amber" | "sky" | "emerald" | "brand" | "rose" | "violet";
}

const colorMap = {
  amber: { bg: "theme-status-warning", text: "text-amber-500", hover: "hover:border-amber-200" },
  sky: { bg: "theme-status-info", text: "text-sky-500", hover: "hover:border-sky-200" },
  emerald: { bg: "theme-status-success", text: "text-emerald-500", hover: "hover:border-emerald-200" },
  brand: { bg: "theme-status-brand", text: "text-brand-500", hover: "hover:border-brand-200" },
  rose: { bg: "theme-status-danger", text: "text-rose-500", hover: "hover:border-rose-200" },
  violet: { bg: "theme-status-brand", text: "text-brand-600", hover: "hover:border-brand-300" },
};

export function FeatureCard({ icon, title, description, to, color = "amber" }: FeatureCardProps) {
  const c = colorMap[color];
  const content = (
    <div className="flex flex-col items-center p-4 text-center">
      <div className={`mb-2 flex h-10 w-10 items-center justify-center rounded-xl border ${c.bg} ${c.text}`}>
        {icon}
      </div>
      <span className="text-sm font-medium text-ink-700">{title}</span>
      <span className="mt-0.5 text-xs text-ink-300">{description}</span>
    </div>
  );

  if (to) {
    return (
      <Link to={to} className={`card-hover rounded-2xl transition-all ${c.hover}`}>
        {content}
      </Link>
    );
  }

  return (
    <div className="theme-card-subtle rounded-2xl">
      {content}
    </div>
  );
}
