import type { ReactNode } from "react";

interface PageSectionProps {
  title: string;
  description?: string;
  icon?: ReactNode;
  children: ReactNode;
  /** Visual variant */
  variant?: "default" | "warm" | "info" | "highlight";
  /** Collapsible on mobile */
  collapsible?: boolean;
  className?: string;
}

export function PageSection({
  title,
  description,
  icon,
  children,
  variant = "default",
  className = "",
}: PageSectionProps) {
  const variantStyles = {
    default: "theme-card-subtle",
    warm: "theme-card-subtle theme-status-warning",
    info: "theme-card-subtle theme-status-info",
    highlight: "theme-card-subtle theme-status-brand",
  };

  return (
    <section className={`rounded-2xl p-5 ${variantStyles[variant]} ${className}`}>
      <div className="mb-3 flex items-center gap-2">
        {icon && (
          <div className="theme-card-subtle flex h-8 w-8 items-center justify-center rounded-lg text-brand-500">
            {icon}
          </div>
        )}
        <div>
          <h2 className="text-sm font-semibold text-ink-700">{title}</h2>
          {description && <p className="mt-0.5 text-xs text-ink-400">{description}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}
