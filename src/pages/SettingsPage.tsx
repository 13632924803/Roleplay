import { type ReactNode, useCallback, useState } from "react";
import { Link } from "react-router-dom";
import { Database, HardDrive, LogOut, Palette, Settings, Shield, Sparkles, User } from "lucide-react";
import { useAuth } from "../features/auth";
import { DataSyncPanel } from "../features/roleplay/components/settings/DataSyncPanel";
import { ProviderPresetSelector } from "../features/roleplay/components/settings/ProviderPresetSelector";
import { getEnabledConfig, listConfigs } from "../features/roleplay/storage/apiProviderConfigStorage";
import { getPresetName } from "../features/roleplay/providers/providerPresets";
import { getStorageModeLabel } from "../features/roleplay/storage/apiKeyStorage";
import { ModeBadge } from "../shared/components/ModeBadge";
import { useThemeInfo } from "../shared/theme/ThemeProvider";
import { THEME_OPTIONS, type ThemePreviewOption } from "../shared/theme/themes";

function getCurrentCredentialSummary() {
  const enabled = getEnabledConfig();
  if (!enabled) {
    return {
      title: "未启用 API",
      detail: "尚未启用可用的 Provider 配置。",
    };
  }

  const providerName = getPresetName(enabled.provider);
  const storageLabel = getStorageModeLabel(enabled.storageMode);
  const testLabel =
    enabled.testStatus === "ok"
      ? "已测试通过"
      : enabled.testStatus === "failed"
        ? "测试失败"
        : "未测试";

  return {
    title: `${providerName} / ${enabled.model || "未选择模型"}`,
    detail: `${storageLabel} · ${testLabel}${enabled.lastTestedAt ? ` · ${new Date(enabled.lastTestedAt).toLocaleString()}` : ""}`,
  };
}

function getVisibleCredentialSummary(isLoggedIn: boolean) {
  const enabled = getEnabledConfig();
  if (isLoggedIn || enabled?.storageMode !== "hosted_encrypted") {
    return getCurrentCredentialSummary();
  }

  const localEnabled = listConfigs().find(
    (config) => config.enabled && config.storageMode !== "hosted_encrypted",
  );

  if (!localEnabled) {
    return {
      title: "未启用 API",
      detail: "当前未登录，托管加密配置不会作为本地模式的可用配置展示。",
    };
  }

  const providerName = getPresetName(localEnabled.provider);
  const storageLabel = getStorageModeLabel(localEnabled.storageMode);
  const testLabel =
    localEnabled.testStatus === "ok"
      ? "已测试通过"
      : localEnabled.testStatus === "failed"
        ? "测试失败"
        : "未测试";

  return {
    title: `${providerName} / ${localEnabled.model || "未选择模型"}`,
    detail: `${storageLabel} · ${testLabel}${localEnabled.lastTestedAt ? ` · ${new Date(localEnabled.lastTestedAt).toLocaleString()}` : ""}`,
  };
}

function SectionCard({
  icon,
  title,
  description,
  status,
  to,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  status?: string;
  to?: string | null;
}) {
  const content = (
    <>
      <div className="neo-panel-soft flex h-10 w-10 flex-shrink-0 items-center justify-center text-ink-500">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-semibold text-ink-700">{title}</h3>
          {status ? (
            <span className="neo-pill px-2 py-0.5 text-[11px] text-ink-500">
              {status}
            </span>
          ) : null}
        </div>
        <p className="mt-1 text-xs leading-relaxed text-ink-400">{description}</p>
      </div>
    </>
  );

  if (to) {
    return (
      <Link
        to={to}
        className="neo-panel-soft flex items-start gap-4 rounded-[28px] p-5 transition-all duration-[240ms] hover:-translate-y-0.5 hover:ring-1 hover:ring-brand-200/60"
      >
        {content}
      </Link>
    );
  }

  return <div className="neo-panel-soft flex items-start gap-4 rounded-[28px] p-5">{content}</div>;
}

function ThemeCard({
  option,
  active,
  onSelect,
}: {
  option: ThemePreviewOption;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`theme-preview-card group relative flex flex-col gap-4 p-4 text-left transition-all duration-[240ms] ${
        active ? "ring-2 ring-brand-300/70" : "hover:-translate-y-0.5 hover:ring-1 hover:ring-brand-200/60"
      }`}
    >
      <div className={`${option.previewClassName} h-28 rounded-[22px] border border-white/30`}>
        <div className="flex h-full flex-col justify-between p-4">
          <div className="flex items-center justify-between">
            <span className="neo-pill text-[10px] text-brand-700">{option.accent}</span>
            {active ? (
              <span className="neo-pill text-[10px] text-emerald-600">当前启用</span>
            ) : null}
          </div>
          <div>
            <div className="h-3 w-24 rounded-full bg-white/60" />
            <div className="mt-2 h-2 w-36 rounded-full bg-white/45" />
            <div className="mt-1.5 h-2 w-28 rounded-full bg-white/35" />
          </div>
        </div>
      </div>
      <div>
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-ink-900">{option.name}</h3>
          <span className={`text-xs font-medium ${active ? "text-brand-600" : "text-ink-400 group-hover:text-brand-500"}`}>
            {active ? "已启用" : "点击切换"}
          </span>
        </div>
        <p className="mt-1 text-xs leading-relaxed text-ink-500">{option.description}</p>
      </div>
    </button>
  );
}

function ThemeComingSoonCard() {
  return (
    <div className="theme-preview-card relative flex flex-col gap-4 p-4 opacity-80">
      <div className="h-28 rounded-[22px] border border-dashed border-brand-200/70 bg-[linear-gradient(135deg,rgba(255,255,255,0.55),rgba(255,255,255,0.18))]">
        <div className="flex h-full items-center justify-center">
          <div className="text-center">
            <Sparkles className="mx-auto h-5 w-5 text-brand-500" />
            <p className="mt-2 text-xs font-medium text-brand-600">自定义主题</p>
            <p className="mt-1 text-[11px] text-ink-400">敬请期待</p>
          </div>
        </div>
      </div>
      <div>
        <h3 className="text-sm font-semibold text-ink-900">自定义主题</h3>
        <p className="mt-1 text-xs leading-relaxed text-ink-500">
          未来会开放更细粒度的配色、背景、纹理和字号配置。
        </p>
      </div>
    </div>
  );
}

export function SettingsPage() {
  const { isGuestOrDemo, user, signOut } = useAuth();
  const { theme, setTheme, activeTheme } = useThemeInfo();
  const currentCredential = getVisibleCredentialSummary(!!user);
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);
  const [signOutBusy, setSignOutBusy] = useState(false);

  const handleSignOut = useCallback(async () => {
    setSignOutBusy(true);
    try {
      await signOut();
    } catch {
      // signOut handles errors internally
    } finally {
      setSignOutBusy(false);
      setShowSignOutConfirm(false);
    }
  }, [signOut]);

  return (
    <div className="page-container px-7 py-8 md:px-10 md:py-10">
      <div className="mb-8 flex items-center gap-3">
        <div className="neo-panel-soft flex h-11 w-11 items-center justify-center text-ink-500">
          <Settings className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-[28px] font-bold tracking-tight text-ink-900">设置中心</h1>
          <p className="mt-1 text-sm text-ink-400">
            管理 API 配置、数据同步、主题外观和本地使用偏好。
          </p>
        </div>
        <ModeBadge />
      </div>

      <section className="mb-8">
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-ink-400">
          当前状态
        </h3>
        <div className="grid gap-4 md:grid-cols-3">
          <div className="theme-page-shell rounded-[32px] px-5 py-5">
            <p className="text-xs text-ink-400">当前客户端</p>
            <p className="mt-1 text-base font-semibold text-ink-800">网页模式</p>
          </div>
          <div className="theme-page-shell rounded-[32px] px-5 py-5">
            <p className="text-xs text-ink-400">数据保存位置</p>
            <p className="mt-1 text-base font-semibold text-ink-800">
              {user ? "云端同步" : "本地数据模式"}
            </p>
          </div>
          <div className="theme-page-shell rounded-[32px] px-5 py-5">
            <p className="text-xs text-ink-400">API 配置</p>
            <p className="mt-1 truncate text-base font-semibold text-ink-800">
              {currentCredential.title}
            </p>
            <p className="mt-1 text-[11px] text-ink-300">{currentCredential.detail}</p>
          </div>
        </div>
      </section>

      <section className="mb-8">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-ink-400">
              主题 / 外观
            </h3>
            <p className="mt-1 text-sm text-ink-500">
              当前主题：{activeTheme.name}
            </p>
          </div>
          <div className="neo-pill text-xs text-brand-600">即时生效 · 自动记住</div>
        </div>

        <div className="mb-4 theme-section-accent rounded-[30px] p-5">
          <div className="flex items-start gap-4">
            <div className="neo-panel-soft flex h-11 w-11 items-center justify-center text-brand-500">
              <Palette className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-ink-800">{activeTheme.name}</p>
              <p className="mt-1 text-sm leading-relaxed text-ink-500">
                {activeTheme.description}。切换后首页、聊天、工坊、设置、帮助中心、侧边栏、底部导航、弹窗和输入控件会同步更新。
              </p>
            </div>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-5 md:grid-cols-2">
          {THEME_OPTIONS.map((option) => (
            <ThemeCard
              key={option.id}
              option={option}
              active={theme === option.id}
              onSelect={() => setTheme(option.id)}
            />
          ))}
          <ThemeComingSoonCard />
        </div>
      </section>

      <section className="mb-8">
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-ink-400">
          API 与模型
        </h3>
        <ProviderPresetSelector />
      </section>

      <section className="mb-8">
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-ink-400">
          数据与同步
        </h3>
        <div className="space-y-4">
          <DataSyncPanel userId={user?.id ?? null} isLoggedIn={!!user} />
          <SectionCard
            icon={<Database className="h-5 w-5" />}
            title="数据管理"
            description="导出备份、导入恢复和回收站。导出内容不会包含 API Key。"
            status="可用"
            to="/settings/data"
          />
        </div>
      </section>

      <section className="mb-8">
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-ink-400">
          存储与账号
        </h3>
        <div className="space-y-3">
          <SectionCard
            icon={<HardDrive className="h-5 w-5" />}
            title="本地存储说明"
            description="数据保存在浏览器 IndexedDB 中。清除站点数据或更换设备后可能丢失，建议定期备份。"
            status="风险已说明"
          />
          {user ? (
            <div className="neo-panel-soft flex flex-col gap-4 rounded-[28px] p-5">
              <div className="flex items-start gap-4">
                <div className="neo-panel-soft flex h-10 w-10 flex-shrink-0 items-center justify-center text-ink-500">
                  <User className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-semibold text-ink-700">账号</h3>
                    <span className="neo-pill px-2 py-0.5 text-[11px] text-emerald-600">
                      已登录
                    </span>
                  </div>
                  <p className="mt-1 truncate text-xs text-ink-400">{user.email}</p>
                  <p className="mt-1 text-xs leading-relaxed text-ink-400">
                    退出后会回到网页本地模式，本地浏览器中的角色、会话和设定不会被删除。
                  </p>
                </div>
              </div>

              {!showSignOutConfirm ? (
                <button
                  onClick={() => setShowSignOutConfirm(true)}
                  className="neo-button flex items-center justify-center gap-2 self-start px-5 py-2.5 text-xs font-medium text-rose-600 hover:text-rose-700"
                >
                  <LogOut className="h-4 w-4" />
                  退出登录
                </button>
              ) : (
                <div className="theme-status-danger neo-panel space-y-3 rounded-[20px] border p-4">
                  <p className="text-sm font-medium text-ink-800">确认退出登录？</p>
                  <p className="text-xs leading-relaxed text-ink-500">
                    退出后将停止使用当前云端账号，但本地浏览器中的角色、会话、世界书和记忆不会被清除。
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setShowSignOutConfirm(false)}
                      disabled={signOutBusy}
                      className="neo-button flex-1 px-4 py-2 text-xs font-medium text-ink-600"
                    >
                      取消
                    </button>
                    <button
                      onClick={handleSignOut}
                      disabled={signOutBusy}
                      className="neo-button-danger flex flex-1 items-center justify-center gap-1.5 px-4 py-2 text-xs font-semibold"
                    >
                      {signOutBusy ? "退出中..." : "确认退出"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <Link
              to="/login"
              className="neo-panel-soft flex items-start gap-4 rounded-[28px] p-5 transition-all duration-[240ms] hover:-translate-y-0.5 hover:ring-1 hover:ring-brand-200/60"
            >
              <div className="neo-panel-soft flex h-10 w-10 flex-shrink-0 items-center justify-center text-ink-500">
                <User className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-semibold text-ink-700">账号</h3>
                  <span className="neo-pill px-2 py-0.5 text-[11px] text-ink-500">
                    未登录
                  </span>
                </div>
                <p className="mt-1 text-xs leading-relaxed text-ink-400">
                  登录后可开启云端同步和托管加密凭据，跨设备继续角色扮演。
                </p>
              </div>
            </Link>
          )}
          <SectionCard
            icon={<Shield className="h-5 w-5" />}
            title="安全与隐私"
            description="API Key 不会进入导出和同步数据。后续也可扩展到与用户设置同步主题偏好。"
            status="已整理"
          />
        </div>
      </section>

      <details className="mb-6 text-xs text-ink-400">
        <summary className="cursor-pointer font-medium text-ink-500 hover:text-ink-600">
          暂未推出的功能
        </summary>
        <p className="mt-2">
          自定义主题编辑器、更多主题包和账号级主题同步会在后续版本继续补齐。
        </p>
      </details>

      {isGuestOrDemo ? (
        <div className="theme-status-warning mb-20 rounded-[24px] border px-4 py-3 text-xs text-amber-700 md:mb-0">
          当前处于网页本地模式。登录后可以开启云端同步与托管加密凭据。
        </div>
      ) : null}
    </div>
  );
}
