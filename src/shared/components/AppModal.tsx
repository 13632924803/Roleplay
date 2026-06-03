import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";

interface AppModalProps {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg" | "xl" | "wide";
  closeOnOverlayClick?: boolean;
  bodyClassName?: string;
  contentClassName?: string;
}

const sizeClasses = {
  sm: "max-w-none md:max-w-sm",
  md: "max-w-none md:max-w-lg",
  lg: "max-w-none md:max-w-2xl",
  xl: "max-w-none md:max-w-4xl",
  wide: "max-w-none md:max-w-[880px]",
};

export function AppModal({
  open,
  title,
  description,
  onClose,
  children,
  footer,
  size = "md",
  closeOnOverlayClick = true,
  bodyClassName = "",
  contentClassName = "",
}: AppModalProps) {
  useEffect(() => {
    if (!open) return;

    const body = document.body;
    const currentCount = Number(body.dataset.modalOpenCount ?? "0");
    body.dataset.modalOpenCount = String(currentCount + 1);
    body.classList.add("app-modal-open");

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      const nextCount = Math.max(0, Number(body.dataset.modalOpenCount ?? "1") - 1);
      if (nextCount === 0) {
        body.classList.remove("app-modal-open");
        delete body.dataset.modalOpenCount;
        return;
      }
      body.dataset.modalOpenCount = String(nextCount);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center px-3 py-3 md:px-8 md:py-10">
      {/* Overlay */}
      <div 
        className="theme-modal-overlay absolute inset-0 z-[100] fade-in"
        onClick={closeOnOverlayClick ? onClose : undefined}
      />
      
      {/* Modal */}
      <div
        className={`theme-modal-shell relative z-[110] my-auto flex w-[calc(100vw-24px)] flex-col self-center overflow-hidden rounded-[30px] modal-enter md:w-full md:rounded-[36px] ${sizeClasses[size]} ${bodyClassName}`}
        style={{
          maxHeight: "calc(100dvh - 24px)",
        }}
      >
        <div className="pointer-events-none absolute inset-0 opacity-80" style={{ background: "var(--surface-section-accent)" }} />
        {/* Header */}
        <div className="theme-modal-header relative z-[120] flex flex-shrink-0 items-start justify-between px-5 py-4 md:px-6 md:py-5">
          <div>
            <h2 className="text-lg font-semibold text-ink-900">{title}</h2>
            {description && (
              <p className="mt-0.5 text-sm text-ink-400">{description}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="theme-card-subtle flex h-9 w-9 shrink-0 items-center justify-center rounded-full p-0 text-ink-600 transition-all duration-[280ms] hover:-translate-y-0.5 hover:text-brand-600 active:translate-y-0"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        
        {/* Content */}
        <div className={`scrollbar-none mobile-modal-safe-content relative z-[110] flex-1 overflow-y-auto px-4 py-4 md:px-6 md:py-5 ${contentClassName}`}>
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div className="theme-modal-footer mobile-modal-safe-footer relative z-[120] sticky bottom-0 flex-shrink-0 rounded-b-[30px] px-4 py-3 md:rounded-b-[36px] md:px-6 md:py-4">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
