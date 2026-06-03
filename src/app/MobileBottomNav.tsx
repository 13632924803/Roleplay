import { NavLink } from "react-router-dom";
import { Drama, Home, Palette, Settings } from "lucide-react";
import { useAuth, canAccessAdminPanel } from "../features/auth";

const tabs = [
  { to: "/", label: "首页", icon: Home },
  { to: "/roleplay", label: "聊天", icon: Drama },
  { to: "/studio", label: "工坊", icon: Palette },
  { to: "/settings", label: "设置", icon: Settings },
];

export function MobileBottomNav() {
  const { role } = useAuth();
  const showAdmin = canAccessAdminPanel(role);

  return (
    <nav className="mobile-bottom-nav-root pointer-events-none fixed inset-x-0 bottom-0 z-50 md:hidden">
      <div className="theme-mobile-nav-fade pointer-events-none absolute inset-x-0 bottom-0 h-24" />
      <div className="theme-nav-shell pointer-events-auto relative mx-3 mb-[calc(8px+env(safe-area-inset-bottom,0px))] rounded-[24px] px-2 py-1.5">
        <div className="flex items-center gap-1.5">
          {tabs.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) =>
                `neo-button flex min-h-[50px] flex-1 flex-col items-center justify-center gap-1 rounded-[17px] px-2 py-1.5 text-[11px] font-medium transition-all duration-[220ms] ${
                  isActive
                    ? "neo-button-pressed text-brand-600"
                    : "text-ink-300 hover:text-ink-500"
                }`
              }
            >
              <Icon className="h-5 w-5" />
              <span>{label}</span>
            </NavLink>
          ))}
          {showAdmin && (
            <NavLink
              to="/admin"
              className={({ isActive }) =>
                `neo-button flex min-h-[50px] flex-1 flex-col items-center justify-center gap-1 rounded-[17px] px-2 py-1.5 text-[11px] font-medium transition-all duration-[220ms] ${
                  isActive
                    ? "neo-button-pressed text-brand-600"
                    : "text-ink-300 hover:text-ink-500"
                }`
              }
            >
              <Settings className="h-5 w-5" />
              <span>后台</span>
            </NavLink>
          )}
        </div>
      </div>
    </nav>
  );
}
