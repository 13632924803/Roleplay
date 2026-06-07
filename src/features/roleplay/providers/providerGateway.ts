import type {
  AppProblem,
  ChatMessage,
  ChatResult,
  ChatStreamChunk,
  ModelProviderConfig,
  ProviderAdapter,
  ProviderMeta,
  ProviderRuntimeMode,
  ProviderType,
  ProviderUsage,
  TestResult,
} from "./provider.types";
import { AVAILABLE_PROVIDERS, DEFAULT_PROVIDER_CONFIG } from "./provider.types";
import { deepseekProvider } from "./deepseekProvider";
import { mockProvider } from "./mockProvider";
import { openAICompatibleProvider } from "./openAICompatibleProvider";
import { configError } from "./providerErrors";
import { sendHostedProviderChat, sendHostedProviderChatStream, testHostedCredential } from "../services/hostedCredentialsService";
import { loadApiKey } from "../storage/apiKeyStorage";
import { getCompatibilityAdapterType } from "./providerPresets";
import { createStreamQueue } from "./streamQueue";

const adapters = new Map<ProviderType, ProviderAdapter>([
  ["mock", mockProvider],
  ["deepseek", deepseekProvider],
  ["openai_compatible", openAICompatibleProvider],
]);

function getAdapter(provider: ProviderType): ProviderAdapter {
  const adapterType = getCompatibilityAdapterType(provider);
  const adapter = adapters.get(adapterType);
  if (!adapter) throw new Error(`Unknown provider adapter: ${adapterType} (for preset ${provider})`);
  return adapter;
}

export function getAvailableProviders(): ProviderMeta[] {
  return AVAILABLE_PROVIDERS.filter((provider) => provider.enabled);
}

export function getProviderMeta(provider: ProviderType): ProviderMeta | undefined {
  return AVAILABLE_PROVIDERS.find((meta) => meta.id === provider);
}

export function resolveRuntimeMode(
  isGuestOrDemo: boolean,
  storageMode: ModelProviderConfig["apiKeyStorageMode"],
): ProviderRuntimeMode {
  if (isGuestOrDemo) return "demo_mock";
  if (storageMode === "session_only") return "byok_session";
  if (storageMode === "local_device") return "byok_local_device";
  return "hosted_encrypted";
}

export function buildConfig(overrides: {
  provider: ProviderType;
  model: string;
  baseURL: string;
  apiKey: string;
  credentialId?: string | null;
  storageMode: ModelProviderConfig["apiKeyStorageMode"];
  temperature?: number;
  maxTokens?: number;
  streamEnabled?: boolean;
}): ModelProviderConfig {
  return {
    ...DEFAULT_PROVIDER_CONFIG,
    provider: overrides.provider,
    model: overrides.model,
    baseURL: overrides.baseURL,
    apiKey: overrides.apiKey,
    credentialId: overrides.credentialId ?? null,
    apiKeyStorageMode: overrides.storageMode,
    temperature: overrides.temperature ?? DEFAULT_PROVIDER_CONFIG.temperature,
    maxTokens: overrides.maxTokens ?? DEFAULT_PROVIDER_CONFIG.maxTokens,
    streamEnabled: overrides.streamEnabled ?? true,
  };
}

export function buildConfigFromStorage(
  provider: ProviderType,
  apiKey: string,
  storageMode: ModelProviderConfig["apiKeyStorageMode"],
  model?: string,
  baseURL?: string,
  credentialId?: string | null,
): ModelProviderConfig {
  const meta = getProviderMeta(provider);
  return buildConfig({
    provider,
    model: model || meta?.defaultModel || "",
    baseURL: baseURL || meta?.defaultBaseURL || "",
    apiKey,
    credentialId,
    storageMode,
  });
}

export function tryLoadApiKey(
  provider: ProviderType,
  storageMode: ModelProviderConfig["apiKeyStorageMode"],
): string | null {
  if (provider === "mock") return "mock-no-key-needed";
  if (storageMode === "hosted_encrypted") return null;
  const stored = loadApiKey(provider, storageMode);
  return stored?.apiKey ?? null;
}

export function validateConfig(config: ModelProviderConfig): AppProblem | null {
  if (config.provider === "mock") return null;
  if (config.apiKeyStorageMode === "hosted_encrypted") {
    if (!config.credentialId) return configError("请先在设置中心选择托管 API 凭据");
  } else if (!config.apiKey) {
    return configError("缺少 API Key");
  }
  if (config.provider === "openai_compatible" && !config.baseURL) {
    return configError("OpenAI Compatible 模式需要提供 Base URL");
  }
  if (!config.model) return configError("缺少 Model 名称");
  return null;
}

export async function testProviderConnection(config: ModelProviderConfig): Promise<TestResult> {
  const validationError = validateConfig(config);
  if (validationError) return { ok: false, error: validationError };
  if (config.apiKeyStorageMode === "hosted_encrypted" && config.credentialId) {
    return testHostedCredential(config.credentialId);
  }
  return getAdapter(config.provider).testConnection(config);
}

export async function sendProviderRequest(
  isGuestOrDemo: boolean,
  config: ModelProviderConfig,
  messages: ChatMessage[],
): Promise<ChatResult> {
  if (isGuestOrDemo) return mockProvider.chat(config, messages);
  const validationError = validateConfig(config);
  if (validationError) throw validationError;
  if (config.apiKeyStorageMode === "hosted_encrypted" && config.credentialId) {
    return sendHostedProviderChat({
      credential_id: config.credentialId,
      provider_type: config.provider as Exclude<ProviderType, "mock">,
      model: config.model,
      messages,
      temperature: config.temperature,
      max_tokens: config.maxTokens,
      stream: false,
      userId: config.userId,
    });
  }
  return getAdapter(config.provider).chat(config, messages);
}

export function sendProviderStreamRequest(
  isGuestOrDemo: boolean,
  config: ModelProviderConfig,
  messages: ChatMessage[],
  signal?: AbortSignal,
): AsyncIterable<ChatStreamChunk> {
  if (isGuestOrDemo) return mockProvider.chatStream(config, messages, signal);
  const validationError = validateConfig(config);
  if (validationError) {
    // eslint-disable-next-line require-yield -- intentional: async iterable that throws on iteration
    return (async function* () {
      throw validationError;
    })();
  }

  if (config.apiKeyStorageMode === "hosted_encrypted" && config.credentialId) {
    return (async function* () {
      const queue = createStreamQueue<ChatStreamChunk>();
      let hostedUsage: ProviderUsage | null = null;

      // Producer: hosted SSE callbacks feed the queue. No polling — the
      // consumer below is woken the moment a delta arrives.
      sendHostedProviderChatStream(
        {
          credential_id: config.credentialId as string,
          provider_type: config.provider as Exclude<ProviderType, "mock">,
          model: config.model,
          messages,
          temperature: config.temperature,
          max_tokens: config.maxTokens,
          userId: config.userId,
        },
        {
          onDelta: (text) => queue.push({ content: text, done: false }),
          onUsage: (usage) => {
            hostedUsage = usage;
          },
          onDone: () => queue.close(),
          onError: (error) => queue.fail(error),
        },
        signal,
      );

      // Consumer: yield deltas as they arrive. queue.fail() surfaces as a throw.
      for await (const chunk of queue.iterable) {
        yield chunk;
      }

      if (signal?.aborted) {
        yield { content: "", done: true };
        return;
      }

      const usage =
        hostedUsage ??
        {
          usageAvailable: false,
          usageUnavailableReason:
            "托管聊天服务未返回本次用量，请确认 hosted-provider-chat 已部署到最新版本。",
          rawUsage: null,
          sourceProvider: config.provider,
        };

      // Yield empty content chunk with usage, then final done
      yield {
        content: "",
        done: false,
        usage,
      };
      yield {
        content: "",
        done: true,
        usage,
      };
    })();
  }

  return getAdapter(config.provider).chatStream(config, messages, signal);
}
