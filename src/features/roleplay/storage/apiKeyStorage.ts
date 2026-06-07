import { logger } from "../../../shared/lib/logger";
import type { ApiKeyStorageMode, ProviderType } from "../providers/provider.types";

const STORAGE_PREFIX = "rp_tavern_";

interface StoredApiConfig {
  apiKey: string;
  provider: ProviderType;
  model: string;
  baseURL: string;
  storageMode: ApiKeyStorageMode;
  savedAt: string;
}

const sessionStore = new Map<string, StoredApiConfig>();

function storageKey(provider: ProviderType): string {
  return `${STORAGE_PREFIX}api_config_${provider}`;
}

export function saveApiKeySession(
  provider: ProviderType,
  apiKey: string,
  model: string,
  baseURL: string,
): void {
  sessionStore.set(storageKey(provider), {
    apiKey,
    provider,
    model,
    baseURL,
    storageMode: "session_only",
    savedAt: new Date().toISOString(),
  });
}

export function saveApiKeyLocalDevice(
  provider: ProviderType,
  apiKey: string,
  model: string,
  baseURL: string,
): void {
  const config: StoredApiConfig = {
    apiKey,
    provider,
    model,
    baseURL,
    storageMode: "local_device",
    savedAt: new Date().toISOString(),
  };

  try {
    localStorage.setItem(storageKey(provider), JSON.stringify(config));
  } catch (error) {
    logger.error("本地保存 API Key 失败", error);
    throw new Error("浏览器本地存储不可用，请改用“仅本次会话”保存。");
  }
}

export function loadApiKey(
  provider: ProviderType,
  storageMode: ApiKeyStorageMode,
): StoredApiConfig | null {
  const key = storageKey(provider);

  if (storageMode === "session_only") {
    return sessionStore.get(key) ?? null;
  }

  if (storageMode === "local_device") {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as StoredApiConfig;
      return parsed.storageMode === "local_device" ? parsed : null;
    } catch {
      return null;
    }
  }

  return null;
}

export function clearApiKey(
  provider: ProviderType,
  storageMode: ApiKeyStorageMode,
): void {
  const key = storageKey(provider);
  if (storageMode === "session_only") {
    sessionStore.delete(key);
    return;
  }
  if (storageMode === "local_device") {
    try {
      localStorage.removeItem(key);
    } catch {
      // ignore
    }
  }
}

export function getStorageModeLabel(mode: ApiKeyStorageMode): string {
  switch (mode) {
    case "session_only":
      return "仅本次会话";
    case "local_device":
      return "当前设备";
    case "hosted_encrypted":
      return "托管加密 / 跨设备同步";
  }
}

export function getStorageModeDescription(mode: ApiKeyStorageMode): string {
  switch (mode) {
    case "session_only":
      return "API Key 仅保存在当前网页会话中。关闭页面或刷新后可能需要重新填写，不会上传云端。";
    case "local_device":
      return "API Key 保存在当前浏览器本地，不会上传云端。清除浏览器网站数据或更换设备后需要重新配置。";
    case "hosted_encrypted":
      return "API Key 通过服务端加密后保存到云端凭据库。前端不会展示明文 Key，适合跨设备使用。";
  }
}

export function hasStoredApiKey(
  provider: ProviderType,
  storageMode: ApiKeyStorageMode,
): boolean {
  if (storageMode === "hosted_encrypted") return false;
  return loadApiKey(provider, storageMode) !== null;
}

export function listStoredConfigs(): StoredApiConfig[] {
  const result: StoredApiConfig[] = [];
  sessionStore.forEach((config) => result.push(config));

  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (!key?.startsWith(STORAGE_PREFIX)) continue;
    try {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const config = JSON.parse(raw) as StoredApiConfig;
      if (config.storageMode === "local_device") result.push(config);
    } catch {
      // skip bad entries
    }
  }

  return result;
}
