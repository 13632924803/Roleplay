import { Suspense, lazy } from "react";
import { Routes, Route } from "react-router-dom";
import { AppShell } from "./AppShell";
import { ErrorBoundary } from "../shared/components/ErrorBoundary";

const LandingPage = lazy(() =>
  import("../pages/LandingPage").then((m) => ({ default: m.LandingPage })),
);
const DemoPage = lazy(() => import("../pages/DemoPage").then((m) => ({ default: m.DemoPage })));
const LoginPage = lazy(() => import("../pages/LoginPage").then((m) => ({ default: m.LoginPage })));
const ChatRoomPage = lazy(() =>
  import("../pages/ChatRoomPage").then((m) => ({ default: m.ChatRoomPage })),
);
const StudioPage = lazy(() =>
  import("../pages/StudioPage").then((m) => ({ default: m.StudioPage })),
);
const SettingsPage = lazy(() =>
  import("../pages/SettingsPage").then((m) => ({ default: m.SettingsPage })),
);
const DataManagementPage = lazy(() =>
  import("../pages/DataManagementPage").then((m) => ({ default: m.DataManagementPage })),
);
const AdminPage = lazy(() => import("../pages/AdminPage").then((m) => ({ default: m.AdminPage })));
const HelpCenterPage = lazy(() =>
  import("../pages/HelpCenterPage").then((m) => ({ default: m.HelpCenterPage })),
);
const NotFoundPage = lazy(() =>
  import("../pages/NotFoundPage").then((m) => ({ default: m.NotFoundPage })),
);

function PageLoader() {
  return (
    <div className="flex h-full items-center justify-center py-20">
      <p className="text-sm text-ink-300">页面加载中...</p>
    </div>
  );
}

export function AppRouter() {
  return (
    <ErrorBoundary label="route">
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="/" element={<LandingPage />} />
            <Route path="/demo" element={<DemoPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/roleplay" element={<ChatRoomPage />} />
            <Route path="/studio" element={<StudioPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/settings/data" element={<DataManagementPage />} />
            <Route path="/admin" element={<AdminPage />} />
            <Route path="/help" element={<HelpCenterPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </Suspense>
    </ErrorBoundary>
  );
}
