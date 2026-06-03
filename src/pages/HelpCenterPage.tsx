import { useCallback, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  ArchiveRestore,
  BookOpen,
  Brain,
  ChevronDown,
  Cloud,
  Database,
  ExternalLink,
  Github,
  HelpCircle,
  KeyRound,
  MessageCircle,
  Palette,
  ReceiptText,
  RefreshCw,
  Settings,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Zap,
} from "lucide-react";

const GITHUB_REPOSITORY_URL = "https://github.com/DAIDAIMUYU/Roleplay.git";

interface NavSection {
  id: string;
  label: string;
  icon: ReactNode;
}

const navSections: NavSection[] = [
  { id: "welcome", label: "欢迎", icon: <Sparkles className="h-4 w-4" /> },
  { id: "quickstart", label: "三分钟开始", icon: <Zap className="h-4 w-4" /> },
  { id: "api", label: "API 配置", icon: <KeyRound className="h-4 w-4" /> },
  { id: "studio", label: "创建角色", icon: <Palette className="h-4 w-4" /> },
  { id: "chat", label: "聊天房间", icon: <MessageCircle className="h-4 w-4" /> },
  { id: "world-memory", label: "世界书与记忆", icon: <Brain className="h-4 w-4" /> },
  { id: "local-cloud", label: "本地与云端", icon: <Cloud className="h-4 w-4" /> },
  { id: "mobile", label: "移动端 / PWA", icon: <Smartphone className="h-4 w-4" /> },
  { id: "faq", label: "常见问题", icon: <HelpCircle className="h-4 w-4" /> },
  { id: "troubleshooting", label: "故障排查", icon: <AlertTriangle className="h-4 w-4" /> },
];

function SectionBlock({
  id,
  title,
  icon,
  children,
}: {
  id: string;
  title: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <section id={id} className="max-w-full scroll-mt-6">
      <div className="neo-panel max-w-full p-4 md:p-6">
        <div className="mb-4 flex items-center gap-3">
          <div className="neo-panel-soft flex h-10 w-10 flex-shrink-0 items-center justify-center text-brand-500">
            {icon}
          </div>
          <h2 className="min-w-0 break-words text-base font-bold text-ink-900 md:text-lg">{title}</h2>
        </div>
        <div className="max-w-full space-y-3 break-words text-sm leading-relaxed text-ink-600">{children}</div>
      </div>
    </section>
  );
}

function QuickEntry({ to, icon, label }: { to: string; icon: ReactNode; label: string }) {
  return (
    <Link
      to={to}
      className="neo-button flex min-w-0 items-center gap-2 px-4 py-2.5 text-xs font-medium text-ink-600 transition-all hover:-translate-y-0.5 hover:text-brand-600"
    >
      <span className="flex-shrink-0 text-ink-400">{icon}</span>
      <span className="truncate">{label}</span>
    </Link>
  );
}

function StepCard({
  step,
  title,
  description,
  actionLabel,
  actionTo,
}: {
  step: number;
  title: string;
  description: string;
  actionLabel: string;
  actionTo: string;
}) {
  return (
    <div className="neo-panel-soft flex max-w-full flex-col p-4 transition-all hover:-translate-y-0.5 hover:shadow-lg hover:shadow-blue-100/25 md:p-5">
      <div className="mb-3 flex items-center gap-3">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-brand-50 text-sm font-bold text-brand-500">
          {step}
        </div>
        <h3 className="min-w-0 break-words text-sm font-semibold text-ink-900">{title}</h3>
      </div>
      <p className="mb-4 flex-1 text-xs leading-relaxed text-ink-500">{description}</p>
      <Link
        to={actionTo}
        className="neo-button inline-flex max-w-full items-center gap-1.5 self-start px-4 py-2 text-xs font-medium text-brand-600 hover:text-brand-700"
      >
        <span className="truncate">{actionLabel}</span>
        <ExternalLink className="h-3 w-3 flex-shrink-0" />
      </Link>
    </div>
  );
}

function InfoCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="neo-panel-soft max-w-full p-4">
      <h4 className="break-words text-sm font-semibold text-ink-800">{title}</h4>
      <div className="mt-1.5 break-words text-xs leading-relaxed text-ink-500">{children}</div>
    </div>
  );
}

function FaqItem({ question, children }: { question: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="neo-panel-soft max-w-full overflow-hidden transition-all duration-[240ms]">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between gap-3 p-4 text-left"
      >
        <span className="min-w-0 break-words text-sm font-medium text-ink-700">{question}</span>
        <ChevronDown
          className={`h-4 w-4 flex-shrink-0 text-ink-400 transition-transform duration-[240ms] ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>
      {open && <div className="break-words px-4 pb-4 text-sm leading-relaxed text-ink-500">{children}</div>}
    </div>
  );
}

export function HelpCenterPage() {
  const [activeSection, setActiveSection] = useState("welcome");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const scrollToSection = useCallback((id: string) => {
    setActiveSection(id);
    setMobileNavOpen(false);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  return (
    <div className="relative max-w-full overflow-x-hidden">
      <div className="theme-orb-1 -right-24 -top-24 h-96 w-96" />
      <div className="theme-orb-2 -bottom-32 -left-32 h-80 w-80" />
      <div className="theme-orb-3 right-1/4 top-1/3 h-48 w-48" />

      <div className="page-container-wide relative max-w-full px-4 py-6 sm:px-5 md:px-8 md:py-10">
        <header className="mb-6 max-w-full md:mb-8">
          <div className="neo-pill mb-3 inline-flex items-center gap-2 bg-brand-50/80 text-sm text-brand-600">
            <BookOpen className="h-4 w-4" />
            帮助中心
          </div>
          <h1 className="break-words text-2xl font-bold leading-tight text-ink-900 md:text-4xl">
            从零开始使用 Roleplay Tavern
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-ink-500 md:text-base">
            这里面向普通用户：先理解数据保存在哪里，再完成 API、角色和会话三步，就能开始 AI 角色扮演。
          </p>
        </header>

        <div className="neo-panel-soft mb-5 max-w-full rounded-[24px] px-4 py-3 text-sm leading-relaxed text-ink-500 md:mb-6">
          快速记住：不登录也能本地使用；真实 AI 回复需要配置 API；角色先在创作工坊创建；登录只是为了云端同步和跨设备托管凭据。
        </div>

        <div className="mb-6 grid max-w-full grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center md:mb-8">
          <QuickEntry to="/settings" icon={<KeyRound className="h-4 w-4" />} label="配置 API" />
          <QuickEntry to="/studio" icon={<Palette className="h-4 w-4" />} label="创建角色" />
          <QuickEntry to="/roleplay" icon={<MessageCircle className="h-4 w-4" />} label="进入聊天" />
          <QuickEntry to="/settings/data" icon={<Database className="h-4 w-4" />} label="数据管理" />
          <a
            href={GITHUB_REPOSITORY_URL}
            target="_blank"
            rel="noreferrer"
            className="neo-button col-span-2 flex min-w-0 items-center gap-2 px-4 py-2.5 text-xs font-medium text-ink-600 transition-all hover:-translate-y-0.5 hover:text-brand-600 sm:col-span-1"
          >
            <Github className="h-4 w-4 flex-shrink-0 text-ink-400" />
            <span className="truncate">GitHub 项目</span>
          </a>
        </div>

        <div className="flex max-w-full flex-col gap-5 lg:flex-row lg:gap-6">
          <aside className="hidden w-56 flex-shrink-0 lg:block">
            <nav className="neo-surface sticky top-8 space-y-1 p-3" style={{ borderRadius: "24px" }}>
              <p className="mb-2 px-3 pt-1 text-xs font-semibold uppercase tracking-[0.14em] text-ink-400">
                目录
              </p>
              {navSections.map(({ id, label, icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => scrollToSection(id)}
                  className={`flex w-full items-center gap-2.5 rounded-[14px] px-3 py-2.5 text-left text-sm font-medium transition-all duration-[200ms] ${
                    activeSection === id
                      ? "neo-button-pressed text-brand-700"
                      : "neo-button text-ink-500 hover:text-ink-700"
                  }`}
                >
                  {icon}
                  <span className="truncate">{label}</span>
                </button>
              ))}
            </nav>
          </aside>

          <div className="max-w-full lg:hidden">
            <button
              type="button"
              onClick={() => setMobileNavOpen((value) => !value)}
              className="neo-button mb-2 flex w-full items-center justify-between px-4 py-2.5 text-sm font-medium text-ink-600"
            >
              <span className="flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-brand-400" />
                目录导航
              </span>
              <ChevronDown
                className={`h-4 w-4 text-ink-400 transition-transform duration-[240ms] ${
                  mobileNavOpen ? "rotate-180" : ""
                }`}
              />
            </button>
            {mobileNavOpen && (
              <div className="neo-panel-soft scrollbar-none flex max-w-full gap-2 overflow-x-auto p-3">
                {navSections.map(({ id, label }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => scrollToSection(id)}
                    className={`neo-pill flex-shrink-0 whitespace-nowrap text-xs transition-all ${
                      activeSection === id ? "bg-brand-50 text-brand-700" : "text-ink-500 hover:text-ink-700"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <main className="min-w-0 max-w-full flex-1 space-y-5 md:space-y-6">
            <SectionBlock id="welcome" title="欢迎使用 Roleplay Tavern" icon={<Sparkles className="h-5 w-5" />}>
              <p>
                Roleplay Tavern 是一个本地优先的 AI 角色酒馆。它适合写角色卡、整理世界观、保存长期记忆，并和角色进行连续对话。
              </p>
              <div className="grid gap-3 md:grid-cols-3">
                <InfoCard title="不登录也能用">
                  数据保存在当前浏览器本地数据库中。刷新或关闭浏览器后通常仍会保留，但清除网站数据会导致丢失。
                </InfoCard>
                <InfoCard title="配置 API 才有真实回复">
                  你需要使用自己的 DeepSeek 或 OpenAI-compatible API Key。没有 API 时可以先熟悉本地创建流程。
                </InfoCard>
                <InfoCard title="云端同步是可选项">
                  登录后可以手动同步角色、会话、世界书和记忆。系统不会强迫注册，也不会静默上传本地数据。
                </InfoCard>
              </div>
            </SectionBlock>

            <SectionBlock id="quickstart" title="三分钟快速开始" icon={<Zap className="h-5 w-5" />}>
              <div className="grid gap-4 md:grid-cols-3">
                <StepCard
                  step={1}
                  title="配置 API"
                  description="进入设置中心，选择 Provider，填入 API Key，选择模型并测试连接。测试通过后再设为启用。"
                  actionLabel="去设置中心"
                  actionTo="/settings"
                />
                <StepCard
                  step={2}
                  title="创建角色"
                  description="进入创作工坊，创建角色卡。至少填写角色名称、身份定位、性格和说话风格。"
                  actionLabel="去创作工坊"
                  actionTo="/studio"
                />
                <StepCard
                  step={3}
                  title="新建会话"
                  description="进入聊天房间，点击新建会话，选择一个角色。创建成功后输入框会变为可用。"
                  actionLabel="去聊天房间"
                  actionTo="/roleplay"
                />
              </div>
            </SectionBlock>

            <SectionBlock id="api" title="API 配置说明" icon={<KeyRound className="h-5 w-5" />}>
              <p>设置中心的 API 区域负责保存 Provider、Base URL、模型和凭据模式。测试成功不等于启用，需要点击“设为启用”。</p>
              <div className="grid gap-3 md:grid-cols-3">
                <InfoCard title="session_only">
                  API Key 只保存在当前网页会话中。关闭页面或刷新后可能需要重新填写，不会上传云端。
                </InfoCard>
                <InfoCard title="local_device">
                  API Key 保存在当前浏览器本地。它不会跨设备同步，手机看不到电脑上的本地设备配置是正常现象。
                </InfoCard>
                <InfoCard title="hosted_encrypted">
                  登录后可用。API Key 在服务端加密保存，前端不显示明文，适合多设备使用。
                </InfoCard>
              </div>
              <ul className="list-disc space-y-1.5 pl-5">
                <li>编辑已保存配置时，API Key 留空表示不修改旧 Key。</li>
                <li>导出备份不会包含 API Key、密文、IV 或 Secrets。</li>
                <li>如果 API 测试失败，请先检查 Provider、Base URL、模型名和账号余额。</li>
              </ul>
            </SectionBlock>

            <SectionBlock id="studio" title="创建角色" icon={<Palette className="h-5 w-5" />}>
              <p>角色卡越清楚，模型越容易稳定扮演。第一次创建时，建议先填核心信息，不必一次写得很复杂。</p>
              <div className="grid gap-3 md:grid-cols-2">
                <InfoCard title="角色名称与身份定位">写清楚角色是谁，例如“古风酒馆老板娘”“赛博黑客”“中世纪骑士”。</InfoCard>
                <InfoCard title="性格与说话风格">描述角色的语气、称呼、行为边界和常见反应。</InfoCard>
                <InfoCard title="开场白">让第一句对话自然开始，帮助用户快速进入场景。</InfoCard>
                <InfoCard title="标签与关系阶段">用于管理和筛选，也能帮助你组织不同类型的角色。</InfoCard>
              </div>
            </SectionBlock>

            <SectionBlock id="chat" title="聊天房间" icon={<MessageCircle className="h-5 w-5" />}>
              <p>聊天房间用于创建会话、发送消息、查看上下文控制台和用量信息。</p>
              <ul className="list-disc space-y-1.5 pl-5">
                <li>没有会话时，先点击“新建会话”并选择角色。</li>
                <li>右侧上下文控制台会显示角色设定、模板、世界书、记忆、摘要、最终 System Prompt 和上下文窗口。</li>
                <li>用量与费用只做统计和估算，不会限制发送；实际扣费以 Provider 官方账单为准。</li>
                <li>上下文接近模型窗口上限时，建议减少注入内容或使用压缩摘要。</li>
              </ul>
            </SectionBlock>

            <SectionBlock id="world-memory" title="世界书、记忆与摘要" icon={<Brain className="h-5 w-5" />}>
              <div className="grid gap-3 md:grid-cols-3">
                <InfoCard title="世界书">
                  适合放世界观、地点、组织、人物关系等背景设定。关键词命中后才会注入上下文。
                </InfoCard>
                <InfoCard title="记忆">
                  适合放长期事实、用户偏好、角色关系进展。AI 提炼出的候选记忆需要确认后才会启用。
                </InfoCard>
                <InfoCard title="摘要">
                  适合长会话压缩，把早期对话整理成更短的上下文，减少模型窗口压力。
                </InfoCard>
              </div>
            </SectionBlock>

            <SectionBlock id="local-cloud" title="本地模式与云端同步" icon={<Cloud className="h-5 w-5" />}>
              <p>本地模式和云端同步是两个独立概念：登录不是强制的，同步也不会静默覆盖。</p>
              <div className="grid gap-3 md:grid-cols-2">
                <InfoCard title="本地模式">
                  角色、会话、世界书、记忆和设置保存在当前浏览器。更换设备后不会自动带走，需要导出备份或登录后同步。
                </InfoCard>
                <InfoCard title="云端同步">
                  登录后可手动上传本地数据到云端，也可下载云端数据到本地镜像。冲突时应优先保守处理，不建议直接覆盖。
                </InfoCard>
              </div>
              <Link to="/settings/data" className="neo-button-primary inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold">
                <ArchiveRestore className="h-4 w-4" />
                打开数据管理
              </Link>
            </SectionBlock>

            <SectionBlock id="mobile" title="移动端 / PWA 使用" icon={<Smartphone className="h-5 w-5" />}>
              <ul className="list-disc space-y-1.5 pl-5">
                <li>手机浏览器访问仍然属于“网页模式”，不是独立移动 App。</li>
                <li>底部导航固定在屏幕底部，可快速进入首页、聊天、工坊和设置。</li>
                <li>当前不主动弹出安装提示卡片；如需添加到主屏幕，请使用浏览器菜单或系统分享菜单。</li>
                <li>如果移动端页面没有更新，可能是 PWA 缓存旧版本，可以清理站点数据或重新添加到主屏幕。</li>
              </ul>
            </SectionBlock>

            <SectionBlock id="faq" title="常见问题" icon={<HelpCircle className="h-5 w-5" />}>
              <div className="space-y-2">
                <FaqItem question="为什么没有 AI 回复？">
                  通常是还没有启用 API 配置。请进入设置中心配置 Provider、API Key 和模型，测试通过后点击“设为启用”。
                </FaqItem>
                <FaqItem question="为什么手机看不到电脑配置的 API？">
                  如果电脑使用的是 local_device，它只保存在电脑浏览器本地。想跨设备使用，请登录并保存为 hosted_encrypted 托管加密凭据。
                </FaqItem>
                <FaqItem question="为什么需要先创建角色？">
                  聊天会话需要角色设定作为扮演基础。没有角色也可以创建空白会话，但角色卡能显著提升回复稳定性。
                </FaqItem>
                <FaqItem question="缓存命中是什么？">
                  DeepSeek 会对稳定的请求前缀产生缓存命中。命中 token 的输入成本更低，具体费用以官方账单为准。
                </FaqItem>
                <FaqItem question="上下文满了怎么办？">
                  可以减少模板、世界书或记忆注入，也可以使用摘要压缩，把较早聊天整理成更短的上下文。
                </FaqItem>
                <FaqItem question="数据会不会丢？">
                  本地数据依赖当前浏览器站点数据。清除网站数据、无痕模式关闭、换设备都可能导致丢失。建议定期导出备份。
                </FaqItem>
              </div>
            </SectionBlock>

            <SectionBlock id="troubleshooting" title="故障排查" icon={<AlertTriangle className="h-5 w-5" />}>
              <div className="grid gap-3 md:grid-cols-2">
                <InfoCard title="页面没更新">
                  等待部署完成后强刷；PWA 用户可清理浏览器站点数据，或删除主屏幕图标后重新添加。
                </InfoCard>
                <InfoCard title="API 测试失败">
                  检查 API Key、Base URL、模型、余额和网络。错误信息里不会显示 API Key 明文。
                </InfoCard>
                <InfoCard title="托管凭据没显示">
                  确认已经登录同一个账号，并在设置中心刷新“当前账号 API 配置”。
                </InfoCard>
                <InfoCard title="移动端按钮被挡">
                  请先确认使用最新版本；如果仍异常，清理 PWA 缓存后重开页面。
                </InfoCard>
              </div>
              <div className="neo-panel-soft mt-3 flex max-w-full flex-col items-start gap-3 p-4 sm:flex-row sm:items-center">
                <ShieldCheck className="h-5 w-5 flex-shrink-0 text-emerald-500" />
                <p className="flex-1 text-xs leading-relaxed text-ink-500">
                  仍然无法解决时，可以在 GitHub 提交问题，并附上页面、设备、浏览器和复现步骤。
                </p>
                <a
                  href={GITHUB_REPOSITORY_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="neo-button inline-flex max-w-full items-center gap-2 px-4 py-2 text-xs font-medium text-brand-600"
                >
                  <Github className="h-4 w-4 flex-shrink-0" />
                  <span className="truncate">项目仓库</span>
                </a>
              </div>
            </SectionBlock>
          </main>
        </div>

        <footer className="mt-10 pb-8 text-center md:pb-0">
          <div className="mb-3 flex max-w-full flex-wrap justify-center gap-2 text-xs">
            <span className="neo-pill text-ink-500">
              <Settings className="mr-1 h-3.5 w-3.5" />
              网页模式
            </span>
            <span className="neo-pill text-ink-500">
              <ReceiptText className="mr-1 h-3.5 w-3.5" />
              用量仅统计与估算
            </span>
            <span className="neo-pill text-ink-500">
              <RefreshCw className="mr-1 h-3.5 w-3.5" />
              PWA 可手动更新
            </span>
          </div>
          <p className="text-xs text-ink-300">桌面模式与移动 App 暂未推出。</p>
        </footer>
      </div>
    </div>
  );
}
