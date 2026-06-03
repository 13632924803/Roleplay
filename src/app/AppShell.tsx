import { Outlet } from "react-router-dom";
import { useIsMobile } from "../shared/hooks/useMediaQuery";
import { DesktopSidebar } from "./DesktopSidebar";
import { MobileBottomNav } from "./MobileBottomNav";
import { PwaUpdatePrompt } from "../shared/components/PwaUpdatePrompt";
import { OfflineStatusBanner } from "../shared/components/OfflineStatusBanner";

export function AppShell() {
  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <div className="flex min-h-dvh flex-col overflow-x-hidden">
        <main className="app-scrollbar-clean mobile-bottom-nav-spacer flex-1 overflow-y-auto md:pb-0">
          <Outlet />
        </main>
        <MobileBottomNav />
        <PwaUpdatePrompt />
        <OfflineStatusBanner />
      </div>
    );
  }

  return (
    <div className="flex h-dvh gap-3 overflow-hidden p-3">
      <DesktopSidebar />
      <main className="app-scrollbar-clean theme-page-shell min-w-0 flex-1 overflow-y-auto rounded-[44px]">
        <Outlet />
      </main>
      <PwaUpdatePrompt />
      <OfflineStatusBanner />
    </div>
  );
}
