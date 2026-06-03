import { useState, useEffect } from "react";
import { RefreshCw, X } from "lucide-react";

export function PwaUpdatePrompt() {
  const [showUpdate, setShowUpdate] = useState(false);
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    const handleUpdateFound = () => {
      const reg = navigator.serviceWorker.controller;
      if (reg) {
        setShowUpdate(true);
        setRegistration(reg as unknown as ServiceWorkerRegistration);
      }
    };

    // Listen for update events from vite-plugin-pwa
    window.addEventListener("sw:updated", handleUpdateFound);
    
    // Also check for pending updates
    navigator.serviceWorker.ready.then((reg) => {
      if (reg.waiting) {
        setShowUpdate(true);
        setRegistration(reg);
      }
    });

    return () => {
      window.removeEventListener("sw:updated", handleUpdateFound);
    };
  }, []);

  const handleUpdate = () => {
    if (registration?.waiting) {
      registration.waiting.postMessage({ type: "SKIP_WAITING" });
      window.location.reload();
    }
    setShowUpdate(false);
  };

  if (!showUpdate) return null;

  return (
    <div className="mobile-bottom-nav-floating-offset md:bottom-4 fixed left-1/2 z-50 mx-4 w-full max-w-sm -translate-x-1/2">
      <div 
        className="theme-page-shell flex items-center gap-3 p-4"
        style={{ borderRadius: '20px' }}
      >
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-500">
          <RefreshCw className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-ink-900">发现新版本</p>
          <p className="text-xs text-ink-400">刷新后即可使用最新功能</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowUpdate(false)}
            className="neo-button px-3 py-1.5 text-xs text-ink-500"
            style={{ borderRadius: '10px' }}
          >
            稍后
          </button>
          <button
            onClick={handleUpdate}
            className="btn-primary px-3 py-1.5 text-xs"
            style={{ borderRadius: '10px' }}
          >
            立即更新
          </button>
        </div>
        <button
          onClick={() => setShowUpdate(false)}
          className="absolute top-2 right-2 p-1 text-ink-300 hover:text-ink-500"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
