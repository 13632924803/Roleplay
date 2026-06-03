import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Cloud,
  Drama,
  Eye,
  MessageCircle,
  Send,
  Shield,
  Sparkles,
  Zap,
} from "lucide-react";
import { useAuth } from "../features/auth";
import { ModeBadge } from "../shared/components/ModeBadge";
import { mockProvider } from "../features/roleplay/providers/mockProvider";
import type { ChatMessage } from "../features/roleplay/providers/provider.types";
import { DEFAULT_PROVIDER_CONFIG } from "../features/roleplay/providers/provider.types";

export function DemoPage() {
  const { isGuestOrDemo } = useAuth();
  const [mockInput, setMockInput] = useState("");
  const [mockLoading, setMockLoading] = useState(false);
  const [mockMessages, setMockMessages] = useState<ChatMessage[]>([]);

  async function handleMockSend() {
    if (!mockInput.trim()) return;
    const userMessage: ChatMessage = { role: "user", content: mockInput.trim() };
    const nextMessages = [...mockMessages, userMessage];
    setMockMessages(nextMessages);
    setMockInput("");
    setMockLoading(true);

    try {
      const result = await mockProvider.chat(DEFAULT_PROVIDER_CONFIG as never, nextMessages);
      setMockMessages([...nextMessages, { role: "assistant", content: result.content }]);
    } catch {
      setMockMessages([
        ...nextMessages,
        { role: "assistant", content: "[本地预览] 当前无法生成预览回复，请稍后再试。" },
      ]);
    } finally {
      setMockLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 md:py-12">
      <div className="theme-status-warning card mb-8 border">
        <div className="mb-3 flex items-center gap-3">
          <div className="theme-status-warning flex h-10 w-10 items-center justify-center rounded-full border text-amber-600">
            <Eye className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-ink-900">网页本地预览</h1>
              <ModeBadge />
            </div>
            <p className="text-sm text-ink-400">这里只用于预览聊天界面与交互感受，不会消耗真实 API。</p>
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {[
            { icon: <Zap className="h-4 w-4" />, label: "本地预览回复", sub: "不消耗真实 API", tone: "text-amber-500" },
            { icon: <Shield className="h-4 w-4" />, label: "只做界面预览", sub: "不会展示托管密钥明文", tone: "text-emerald-500" },
            { icon: <Cloud className="h-4 w-4" />, label: "登录后可开同步", sub: "本地模式不是强制注册门槛", tone: "text-sky-500" },
          ].map(({ icon, label, sub, tone }) => (
            <div key={label} className="theme-card-subtle rounded-card p-3 text-center">
              <span className={tone}>{icon}</span>
              <p className="mt-1 text-xs font-medium text-ink-700">{label}</p>
              <p className="text-xs text-ink-400">{sub}</p>
            </div>
          ))}
        </div>
      </div>

      <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-ink-500">
        <MessageCircle className="h-4 w-4" />
        本地预览回复
      </h2>

      <div className="card mb-8">
        {mockMessages.length === 0 ? (
          <p className="py-6 text-center text-xs leading-relaxed text-ink-300">
            输入一段话，先预览界面和回复气质。
            <br />
            当前回复由本地预览 Provider 生成，不代表真实模型表现。
          </p>
        ) : (
          <div className="mb-4 max-h-80 space-y-3 overflow-y-auto">
            {mockMessages.map((message, index) => (
              <div
                key={`${message.role}-${index}`}
                className={`max-w-[85%] rounded-card p-3 ${
                  message.role === "user"
                    ? "theme-chat-user ml-auto text-right"
                    : "theme-chat-ai border"
                }`}
              >
                <p className="mb-0.5 text-xs text-ink-300">{message.role === "user" ? "你" : "本地预览"}</p>
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-inherit">{message.content}</p>
              </div>
            ))}
            {mockLoading ? (
              <div className="theme-chat-ai max-w-[85%] rounded-card border p-3">
                <p className="text-xs text-ink-300">本地预览正在生成...</p>
              </div>
            ) : null}
          </div>
        )}

        <div className="flex items-center gap-2">
          <input
            type="text"
            value={mockInput}
            onChange={(event) => setMockInput(event.target.value)}
            onKeyDown={(event) => event.key === "Enter" && void handleMockSend()}
            placeholder="输入任意内容预览本地回复..."
            className="neo-input flex-1 rounded-input px-3 py-2 text-sm"
          />
          <button
            onClick={() => void handleMockSend()}
            disabled={mockLoading || !mockInput.trim()}
            className="btn-primary text-sm disabled:opacity-50"
          >
            <Send className="h-4 w-4" />
            发送
          </button>
        </div>

        <p className="mt-2 text-center text-xs text-amber-700">
          这里的回复只用于本地预览，不代表真实模型能力，也不会生成正式云端数据。
        </p>
      </div>

      <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-ink-500">接下来你可以做什么</h2>
      <div className="mb-8 grid gap-4 md:grid-cols-2">
        <div className="card">
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink-700">
            <Drama className="h-4 w-4 text-brand-400" />
            继续使用网页本地模式
          </h3>
          <p className="text-xs leading-relaxed text-ink-400">
            你可以先在浏览器里体验聊天和界面。后续本地优先架构会把角色、模板、世界书、记忆和会话都接到本地数据库。
          </p>
        </div>
        <div className="card">
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink-700">
            <Sparkles className="h-4 w-4 text-brand-400" />
            登录后开启同步
          </h3>
          <p className="text-xs leading-relaxed text-ink-400">
            登录只是为了开启云端同步和多设备互通，不会在你注册或登录后静默上传本地数据。
          </p>
        </div>
      </div>

      {isGuestOrDemo ? (
        <div className="card text-center">
          <p className="mb-3 text-sm text-ink-500">
            想继续体验真实模型时，可以先配置本地 API，或者登录后使用托管加密凭据。
          </p>
          <div className="flex justify-center gap-3">
            <Link to="/settings" className="btn-secondary text-sm">
              去设置 API
            </Link>
            <Link to="/login" className="btn-primary text-sm">
              登录开启同步
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
