import { Link } from "react-router-dom";
import {
  BookOpen,
  Brain,
  Cloud,
  Database,
  Drama,
  ExternalLink,
  FileText,
  Github,
  HardDrive,
  HelpCircle,
  History,
  KeyRound,
  MessageCircle,
  Palette,
  ShieldAlert,
  Sparkles,
  Upload,
} from "lucide-react";
import { useAuth } from "../features/auth";
import { ModeBadge } from "../shared/components/ModeBadge";
import { FeatureCard } from "../shared/components/FeatureCard";
import { ProductPreviewCard } from "../shared/components/ProductPreviewCard";
import { getEnabledConfig } from "../features/roleplay/storage/apiProviderConfigStorage";
import { getPresetName } from "../features/roleplay/providers/providerPresets";
import { getStorageModeLabel } from "../features/roleplay/storage/apiKeyStorage";

function getApiSummary() {
  const enabled = getEnabledConfig();
  if (!enabled) return { title: "未配置 API", status: "untested" as const };
  return {
    title: `${getPresetName(enabled.provider)} / ${enabled.model}`,
    status: enabled.testStatus,
  };
}

export function LandingPage() {
  const { user } = useAuth();
  const api = getApiSummary();

  return (
    <div className="relative overflow-hidden">
      {/* Background decorations */}
      <div className="theme-orb-1 -right-24 -top-24 h-96 w-96" />
      <div className="theme-orb-2 -bottom-32 -left-32 h-80 w-80" />
      <div className="theme-orb-3 left-1/2 top-1/2 h-64 w-64 -translate-x-1/2 -translate-y-1/2" />
      <div className="theme-orb-4 right-1/4 top-1/4 h-48 w-48" />
      
      <div className="page-container relative px-7 py-8 md:px-10 md:py-10">

      {/* ─── Hero ─── */}
      <div className="mb-10 text-center">
        <div className="neo-pill mb-2 inline-flex items-center gap-2 bg-brand-50/80 text-sm text-brand-600">
          <Drama className="h-4 w-4" />
          角色酒馆
          <span className="mx-1 text-brand-300">·</span>
          <ModeBadge />
        </div>
        <h1 className="mt-4 text-3xl font-bold leading-tight text-ink-900 md:text-5xl">
          本地优先的<br className="md:hidden" /> AI 角色酒馆
        </h1>
        <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-ink-400 md:text-base">
          创建角色、配置世界书与记忆，在当前浏览器保存你的角色扮演数据。<br className="hidden md:block" />
          不登录也能本地使用；需要真实 AI 回复时，先配置自己的 Provider API。
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <Link to="/roleplay" className="btn-primary px-8 py-3 text-base font-semibold shadow-lg shadow-brand-200/50">
            <Sparkles className="mr-1.5 h-5 w-5" />
            开始本地使用
          </Link>
          <Link to="/settings" className="btn-secondary px-6 py-3 text-sm">
            <KeyRound className="mr-1.5 h-4 w-4" />
            配置 API
          </Link>
          <Link to="/help" className="btn-secondary px-6 py-3 text-sm">
            <FileText className="mr-1.5 h-4 w-4" />
            帮助中心
          </Link>
          {!user && (
            <Link to="/login" className="btn-ghost px-6 py-3 text-sm">
              <Cloud className="mr-1.5 h-4 w-4" />
              登录开启同步
            </Link>
          )}
        </div>
      </div>

      {/* ─── How to Start ─── */}
      <div className="mb-10">
        <h2 className="mb-2 text-center text-lg font-bold text-ink-900">第一次使用，按这三步走</h2>
        <p className="mb-6 text-center text-sm text-ink-400">先准备 API 和角色，再进入聊天室创建会话。</p>

        <div className="grid gap-4 md:grid-cols-3">
          {/* Step 1 */}
          <div className="neo-panel-soft group relative p-5 transition-all hover:-translate-y-0.5 hover:border-brand-200/70 hover:shadow-lg hover:shadow-blue-100/30">
            <div className="mb-3 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-50 text-brand-500">
                <KeyRound className="h-5 w-5" />
              </div>
              <div>
                <span className="text-xs font-medium text-brand-500">步骤 1</span>
                <h3 className="text-sm font-semibold text-ink-900">配置 API</h3>
              </div>
            </div>
            <p className="mb-4 text-xs leading-relaxed text-ink-400">
              点「配置 API」进入设置中心，选择 DeepSeek 或 OpenAI-compatible Provider，填入自己的 API Key 并测试连接。
            </p>
            <Link to="/settings" className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-600 hover:text-brand-700">
              去配置 API
              <ExternalLink className="h-3 w-3" />
            </Link>
          </div>

          {/* Step 2 */}
          <div className="neo-panel-soft group relative p-5 transition-all hover:-translate-y-0.5 hover:border-brand-200/70 hover:shadow-lg hover:shadow-blue-100/30">
            <div className="mb-3 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-sky-50 text-sky-500">
                <Palette className="h-5 w-5" />
              </div>
              <div>
                <span className="text-xs font-medium text-sky-500">步骤 2</span>
                <h3 className="text-sm font-semibold text-ink-900">创建角色</h3>
              </div>
            </div>
            <p className="mb-4 text-xs leading-relaxed text-ink-400">
              点「去创作工坊」创建角色卡，填写角色名称、身份定位、说话风格和开场设定。
            </p>
            <Link to="/studio" className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-600 hover:text-brand-700">
              去创作工坊
              <ExternalLink className="h-3 w-3" />
            </Link>
          </div>

          {/* Step 3 */}
          <div className="neo-panel-soft group relative p-5 transition-all hover:-translate-y-0.5 hover:border-brand-200/70 hover:shadow-lg hover:shadow-blue-100/30">
            <div className="mb-3 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-50 text-emerald-500">
                <MessageCircle className="h-5 w-5" />
              </div>
              <div>
                <span className="text-xs font-medium text-emerald-500">步骤 3</span>
                <h3 className="text-sm font-semibold text-ink-900">开始聊天</h3>
              </div>
            </div>
            <p className="mb-4 text-xs leading-relaxed text-ink-400">
              点「去聊天室」，选择刚创建的角色并新建会话。没有 API 时只能本地预览，配置后即可获得真实模型回复。
            </p>
            <Link to="/roleplay" className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-600 hover:text-brand-700">
              去聊天室
              <ExternalLink className="h-3 w-3" />
            </Link>
          </div>
        </div>
      </div>

      {/* ─── Need Help ─── */}
      <div className="neo-panel mb-10 bg-gradient-to-r from-brand-50/40 to-amber-light/30 p-5">
        <div className="mb-4 flex items-center gap-2">
          <HelpCircle className="h-5 w-5 text-brand-400" />
          <h3 className="text-sm font-semibold text-ink-900">需要帮助？</h3>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Link to="/settings/data" className="neo-button flex items-center gap-2 p-3 text-xs text-ink-600 hover:text-brand-600">
            <Upload className="h-4 w-4 text-ink-400" />
            数据备份与恢复
          </Link>
          <Link to="/settings" className="neo-button flex items-center gap-2 p-3 text-xs text-ink-600 hover:text-brand-600">
            <KeyRound className="h-4 w-4 text-ink-400" />
            API 配置说明
          </Link>
          <a href="https://github.com/DAIDAIMUYU/Roleplay.git" target="_blank" rel="noreferrer" className="neo-button flex items-center gap-2 p-3 text-xs text-ink-600 hover:text-brand-600">
            <Github className="h-4 w-4 text-ink-400" />
            GitHub 项目
          </a>
          <Link to="/help" className="neo-button flex items-center gap-2 p-3 text-xs text-ink-600 hover:text-brand-600">
            <FileText className="h-4 w-4 text-ink-400" />
            帮助中心
          </Link>
        </div>
      </div>

      {/* ─── Product Preview + Quick Status ─── */}
      <div className="mb-10 grid gap-6 lg:grid-cols-[1fr_1fr]">
        <ProductPreviewCard />

        <div className="space-y-3">
          {/* Compact status cards */}
          <div className="neo-panel-soft p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Database className="h-4 w-4 text-ink-300" />
                <span className="text-xs font-medium text-ink-500">数据模式</span>
              </div>
              <span className="neo-pill bg-surface-100/80 text-xs text-ink-600">
                {user ? "云端同步" : "本地优先"}
              </span>
            </div>
            <p className="mt-1.5 text-xs text-ink-400">
              {user
                ? "数据保存在云端，当前设备保留本地镜像。"
                : "数据保存在当前浏览器，刷新/重启后通常保留。"}
            </p>
          </div>

          <div className="neo-panel-soft p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <KeyRound className="h-4 w-4 text-ink-300" />
                <span className="text-xs font-medium text-ink-500">API 状态</span>
              </div>
              <span className="inline-flex items-center gap-1.5">
                <span className={`inline-block h-2 w-2 rounded-full ${
                  api.status === "ok" ? "bg-emerald-500" : api.status === "failed" ? "bg-rose-500" : "bg-ink-300"
                }`} />
                <span className="text-xs text-ink-500">{api.title}</span>
              </span>
            </div>
            <p className="mt-1.5 text-xs text-ink-400">
              {api.status === "untested" ? "未启用 API 时不会调用真实模型；进入设置中心配置后再开始聊天。" : getStorageModeLabel(getEnabledConfig()?.storageMode || "session_only")}
            </p>
          </div>

          <div className="neo-panel-soft p-4">
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-amber-400" />
              <span className="text-xs font-medium text-ink-500">数据保护提示</span>
            </div>
            <p className="mt-1.5 text-xs leading-relaxed text-ink-400">
              本地数据建议定期导出备份。清除浏览器数据、换设备或无痕模式可能导致数据丢失。
            </p>
            <div className="mt-2 flex gap-2">
              <Link to="/settings/data" className="text-xs font-medium text-brand-600 hover:text-brand-700">
                去备份 →
              </Link>
              <Link to="/settings" className="text-xs text-ink-400 hover:text-ink-500">
                同步中心 →
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* ─── Feature Cards ─── */}
      <div className="mb-10">
        <h2 className="mb-4 text-center text-sm font-semibold uppercase tracking-wide text-ink-400">核心能力</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <FeatureCard icon={<Sparkles className="h-5 w-5" />} title="AI 聊天" description="多 Provider · 角色扮演" to="/roleplay" color="amber" />
          <FeatureCard icon={<HardDrive className="h-5 w-5" />} title="创作工坊" description="角色 · 模板 · 世界书" to="/studio" color="sky" />
          <FeatureCard icon={<BookOpen className="h-5 w-5" />} title="世界书" description="世界观设定 · 关键词" to="/studio" color="violet" />
          <FeatureCard icon={<Brain className="h-5 w-5" />} title="记忆系统" description="AI 提炼 · 自动注入" to="/studio" color="emerald" />
          <FeatureCard icon={<History className="h-5 w-5" />} title="版本历史" description="编辑消息 · 版本切换" to="/roleplay" color="rose" />
          <FeatureCard icon={<Upload className="h-5 w-5" />} title="数据备份" description="导出备份 · 导入恢复" to="/settings/data" color="brand" />
          <FeatureCard icon={<Cloud className="h-5 w-5" />} title="云端同步" description="多设备 · 手动同步" to="/settings" color="sky" />
          <FeatureCard icon={<KeyRound className="h-5 w-5" />} title="Provider 预设" description="DeepSeek · OpenAI 等" to="/settings" color="amber" />
        </div>
      </div>

      {/* ─── Page Footer ─── */}
      <div className="text-center">
        <p className="text-xs text-ink-300">
          当前客户端：网页模式 · 桌面模式与移动 App 暂未推出
        </p>
      </div>
      </div>
    </div>
  );
}
