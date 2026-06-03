import { useState, useCallback } from "react";
import { NavLink, Link } from "react-router-dom";
import { CircleUser, Drama, Home, Palette, Settings, Shield, User } from "lucide-react";
import { useAuth, canAccessAdminPanel } from "../features/auth";
import { ModeBadge } from "../shared/components/ModeBadge";
import { SidebarCollapseButton } from "../shared/components/SidebarCollapseButton";
import { usePersistentCollapsedState } from "../shared/hooks/usePersistentCollapsedState";

const navItems = [
  { to: "/", label: "酒馆首页", icon: <Home className="h-5 w-5" /> },
  { to: "/roleplay", label: "聊天房间", icon: <Drama className="h-5 w-5" /> },
  { to: "/studio", label: "创作工坊", icon: <Palette className="h-5 w-5" /> },
  { to: "/settings", label: "设置中心", icon: <Settings className="h-5 w-5" /> },
];

export function DesktopSidebar() {
  const { isOwner, isAdmin, isGuestOrDemo, role, user, signOut } = useAuth();
  const showAdmin = canAccessAdminPanel(role);
  const [collapsed, toggleCollapsed] = usePersistentCollapsedState("roleplay.sidebar.collapsed", false);
  const [signOutConfirm, setSignOutConfirm] = useState(false);
  const [signOutBusy, setSignOutBusy] = useState(false);

  const handleSignOut = useCallback(async () => {
    setSignOutBusy(true);
    try {
      await signOut();
    } catch {
      // signOut handles internally
    } finally {
      setSignOutBusy(false);
      setSignOutConfirm(false);
    }
  }, [signOut]);

  const accountLabel = isGuestOrDemo ? "网页本地模式" : isOwner ? "站主" : isAdmin ? "管理员" : "云端账号";
  const compactAccountTitle = user?.email ? `${accountLabel}：${user.email}` : accountLabel;

  return (
    <aside
      className={`theme-sidebar-shell relative flex h-full flex-shrink-0 flex-col overflow-hidden transition-all duration-[320ms] ${collapsed ? "w-16" : "w-60"}`}
      style={{ borderRadius: "28px" }}
    >
      <div className={`relative z-20 px-3 py-5 ${collapsed ? "flex flex-col items-center gap-3" : ""}`}>
        {collapsed ? (
          <>
            <Link
              to="/"
              className="flex h-9 w-9 items-center justify-center rounded-[14px]"
              title="角色酒馆"
              aria-label="角色酒馆"
            >
              <span className="theme-logo-badge flex h-full w-full items-center justify-center rounded-[14px]">
                <Drama className="h-4 w-4 text-white" />
              </span>
            </Link>
            <SidebarCollapseButton collapsed={collapsed} onToggle={toggleCollapsed} side="left" />
          </>
        ) : (
          <div className="flex items-center justify-between gap-3 px-1">
            <Link to="/" className="flex min-w-0 items-center gap-2.5">
              <div className="theme-logo-badge flex h-9 w-9 items-center justify-center rounded-[14px]">
                <Drama className="h-4 w-4 text-white" />
              </div>
              <span className="truncate text-base font-semibold text-ink-900">角色酒馆</span>
            </Link>
            <SidebarCollapseButton collapsed={collapsed} onToggle={toggleCollapsed} side="left" />
          </div>
        )}
      </div>

      <nav className="scrollbar-none relative z-10 flex-1 space-y-2 overflow-y-auto px-2.5 pb-2 pt-2">
        {navItems.map(({ to, label, icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            className={({ isActive }) =>
              `neo-button flex h-11 items-center gap-3 px-3 text-sm font-medium transition-all duration-150 ${
                isActive ? "neo-button-pressed text-brand-700" : "text-ink-500 hover:text-ink-700"
              } ${collapsed ? "justify-center" : "justify-start"}`
            }
            style={{ borderRadius: "16px" }}
            title={collapsed ? label : undefined}
            aria-label={collapsed ? label : undefined}
          >
            {icon}
            {!collapsed && <span>{label}</span>}
          </NavLink>
        ))}

        {showAdmin && (
          <NavLink
            to="/admin"
            className={({ isActive }) =>
              `neo-button flex h-11 items-center gap-3 px-3 text-sm font-medium transition-all duration-150 ${
                isActive ? "neo-button-pressed text-brand-700" : "text-ink-500 hover:text-ink-700"
              } ${collapsed ? "justify-center" : "justify-start"}`
            }
            style={{ borderRadius: "16px" }}
            title={collapsed ? "管理后台" : undefined}
            aria-label={collapsed ? "管理后台" : undefined}
          >
            <Shield className="h-5 w-5" />
            {!collapsed && <span>管理后台</span>}
          </NavLink>
        )}
      </nav>

      <div
        className={`relative z-10 border-t px-3 py-4 ${collapsed ? "flex justify-center" : ""}`}
        style={{ borderColor: "var(--border-soft)" }}
      >
        {collapsed ? (
          <div
            className="neo-surface-soft flex h-10 w-10 items-center justify-center rounded-[16px]"
            title={compactAccountTitle}
            aria-label={compactAccountTitle}
          >
            {user ? (
              <CircleUser className="h-4.5 w-4.5 text-ink-500" />
            ) : (
              <User className="h-4.5 w-4.5 text-ink-500" />
            )}
          </div>
        ) : (
          <div className="neo-surface-soft flex flex-col gap-2.5 rounded-[20px] p-3.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-ink-400">{accountLabel}</span>
              <ModeBadge />
            </div>
            {user ? (
              <>
                <p className="truncate text-[11px] text-ink-500" title={user.email ?? undefined}>
                  {user.email}
                </p>
                {!signOutConfirm ? (
                  <button
                    type="button"
                    onClick={() => setSignOutConfirm(true)}
                    className="neo-button flex items-center justify-center gap-1.5 px-3 py-1.5 text-[11px] font-medium text-rose-500 hover:text-rose-600"
                  >
                    退出登录
                  </button>
                ) : (
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => setSignOutConfirm(false)}
                      disabled={signOutBusy}
                      className="neo-button flex-1 px-2 py-1.5 text-[11px] font-medium text-ink-500"
                    >
                      取消
                    </button>
                    <button
                      type="button"
                      onClick={handleSignOut}
                      disabled={signOutBusy}
                      className="neo-button-danger flex flex-1 items-center justify-center px-2 py-1.5 text-[11px] font-semibold"
                    >
                      {signOutBusy ? "..." : "确认退出"}
                    </button>
                  </div>
                )}
              </>
            ) : (
              <>
                {isGuestOrDemo && (
                  <p className="text-xs leading-relaxed text-ink-400">
                    未登录时仍可继续使用本地模式。登录仅用于开启云端同步和多设备互通。
                  </p>
                )}
                <Link
                  to="/login"
                  className="neo-button flex items-center justify-center gap-1.5 px-3 py-1.5 text-[11px] font-medium text-brand-600 hover:text-brand-700"
                >
                  <User className="h-3.5 w-3.5" />
                  登录 / 注册
                </Link>
              </>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}
