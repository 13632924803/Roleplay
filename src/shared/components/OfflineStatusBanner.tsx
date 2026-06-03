import { useState, useEffect } from "react";
import { WifiOff } from "lucide-react";

export function OfflineStatusBanner() {
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    setIsOffline(!navigator.onLine);

    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  if (!isOffline) return null;

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 max-w-sm w-full mx-4">
      <div 
        className="theme-page-shell flex items-center gap-3 p-3"
        style={{ borderRadius: '16px' }}
      >
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50 text-amber-500">
          <WifiOff className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-ink-600">
            当前处于离线状态，本地数据仍可查看，AI 回复和云端同步需要联网。
          </p>
        </div>
      </div>
    </div>
  );
}
