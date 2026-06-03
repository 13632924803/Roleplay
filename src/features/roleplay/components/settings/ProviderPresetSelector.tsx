import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  Key,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Trash2,
  Wifi,
  WifiOff,
  Zap,
} from "lucide-react";
import { useAuth } from "../../../auth";
import { AppModal } from "../../../../shared/components/AppModal";
import { ProviderStatusDot } from "./ProviderStatusDot";
import { ProviderConfigCard } from "./ProviderConfigCard";
import type {
  ApiConfigEntry,
  HostedConfigSyncInput,
} from "../../storage/apiProviderConfigStorage";
import {
  deleteConfig,
  getEnabledConfig,
  listConfigs,
  markUsed,
  removeHostedConfigMetadata,
  saveConfig,
  setEnabled,
  setTestResult,
  syncHostedConfig,
  updateConfig,
} from "../../storage/apiProviderConfigStorage";
import type { ApiKeyStorageMode, ProviderType, TestResult } from "../../providers/provider.types";
import { AVAILABLE_PROVIDERS } from "../../providers/provider.types";
import {
  getAllPresets,
  getBaseUrl,
  getDefaultModel,
  getPresetModels,
  getPresetName,
  isModelLegacy,
  isPresetUsable,
} from "../../providers/providerPresets";
import { buildConfigFromStorage, testProviderConnection } from "../../providers/providerGateway";
import {
  clearApiKey,
  getStorageModeDescription,
  getStorageModeLabel,
  hasStoredApiKey,
  loadApiKey,
  saveApiKeyLocalDevice,
  saveApiKeySession,
} from "../../storage/apiKeyStorage";
import {
  deleteHostedCredential,
  listHostedCredentials,
  loadHostedCredentialSelection,
  saveHostedCredential,
  saveHostedCredentialSelection,
  selectionFromCredential,
} from "../../services/hostedCredentialsService";
import type { ProviderCredentialRow } from "../../types/database";

const storageModes: ApiKeyStorageMode[] = ["session_only", "local_device", "hosted_encrypted"];

function SoftSelect({
  value,
  options,
  onChange,
  placeholder,
}: {
  value: string;
  options: Array<{ value: string; label: string; disabled?: boolean }>;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selected = options.find((option) => option.value === value);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className={`neo-input flex w-full items-center justify-between rounded-[22px] px-4 py-3 text-left text-sm text-ink-900 transition-all duration-[240ms] ${
          open ? "neo-button-pressed" : ""
        }`}
      >
        <span className="truncate">{selected?.label || placeholder || "请选择"}</span>
        <ChevronDown
          className={`h-4 w-4 flex-shrink-0 text-ink-400 transition-transform duration-[240ms] ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open ? (
        <div className="neo-panel absolute left-0 right-0 top-[calc(100%+10px)] z-30 max-h-72 overflow-y-auto rounded-[24px] p-2 scrollbar-none">
          <div className="space-y-1.5">
            {options.map((option) => (
              <button
                key={option.value}
                type="button"
                disabled={option.disabled}
                onClick={() => {
                  if (option.disabled) return;
                  onChange(option.value);
                  setOpen(false);
                }}
                className={`w-full rounded-[18px] px-4 py-3 text-left text-sm transition-all duration-[220ms] ${
                  value === option.value ? "neo-button-pressed text-brand-700" : "neo-button text-ink-600"
                } ${option.disabled ? "cursor-not-allowed opacity-50" : ""}`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

interface EditableConfigTarget {
  id: string;
  provider: ProviderType;
  storageMode: ApiKeyStorageMode;
  model: string;
  baseURL: string;
  label: string;
  credentialId?: string | null;
  isDefault?: boolean;
}

function toHostedSyncInput(credential: ProviderCredentialRow): HostedConfigSyncInput {
  return {
    credentialId: credential.id,
    label: credential.label,
    provider: credential.provider_type,
    model: credential.default_model || getDefaultModel(credential.provider_type),
    baseURL: credential.base_url || getBaseUrl(credential.provider_type),
    isDefault: credential.is_default,
  };
}

function dedupeHostedCredentials(credentials: ProviderCredentialRow[]): ProviderCredentialRow[] {
  const byId = new Map<string, ProviderCredentialRow>();
  [...credentials]
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
    .forEach((credential) => {
      if (!byId.has(credential.id)) {
        byId.set(credential.id, credential);
      }
    });
  return Array.from(byId.values());
}

export function ProviderPresetSelector() {
  const { isGuestOrDemo, user, loading } = useAuth();
  const userId = user?.id ?? null;
  const hostedAvailable = !isGuestOrDemo && !!userId;

  const [provider, setProvider] = useState<ProviderType>("deepseek");
  const [model, setModel] = useState("deepseek-v4-flash");
  const [baseURL, setBaseURL] = useState("https://api.deepseek.com/v1");
  const [apiKey, setApiKey] = useState("");
  const [storageMode, setStorageMode] = useState<ApiKeyStorageMode>("session_only");
  const [label, setLabel] = useState("");
  const [customModel, setCustomModel] = useState(false);
  const [customModelValue, setCustomModelValue] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [setDefault, setSetDefault] = useState(true);

  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResultState] = useState<TestResult | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [enablingId, setEnablingId] = useState<string | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);

  const [configs, setConfigs] = useState<ApiConfigEntry[]>([]);
  const [enabledConfig, setEnabledConfig] = useState<ApiConfigEntry | null>(null);
  const [hostedCredentials, setHostedCredentials] = useState<ProviderCredentialRow[]>([]);
  const [hostedLoading, setHostedLoading] = useState(false);
  const [hostedError, setHostedError] = useState<string | null>(null);
  const [selectedHostedId, setSelectedHostedId] = useState<string | null>(
    loadHostedCredentialSelection()?.credentialId ?? null,
  );

  const [editingTarget, setEditingTarget] = useState<EditableConfigTarget | null>(null);
  const [editProvider, setEditProvider] = useState<ProviderType>("deepseek");
  const [editModel, setEditModel] = useState("deepseek-v4-flash");
  const [editBaseURL, setEditBaseURL] = useState(getBaseUrl("deepseek"));
  const [editLabel, setEditLabel] = useState("");
  const [editCustomModel, setEditCustomModel] = useState(false);
  const [editCustomModelValue, setEditCustomModelValue] = useState("");
  const [editApiKey, setEditApiKey] = useState("");
  const [editSetDefault, setEditSetDefault] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [editMessage, setEditMessage] = useState<string | null>(null);

  const presets = getAllPresets();
  const preset = presets.find((item) => item.id === provider);
  const presetModels = getPresetModels(provider);
  const modelOptions = presetModels.length > 0 ? presetModels : [{ id: "__custom__", label: "手动输入模型" }];

  const providerOptions = useMemo(
    () =>
      AVAILABLE_PROVIDERS.map((item) => ({
        value: item.id,
        label: item.label,
        disabled: !item.enabled,
      })),
    [],
  );

  const modelSelectOptions = useMemo(
    () =>
      modelOptions.map((item) => ({
        value: item.id,
        label: `${item.label}${item.legacy ? "（旧）" : ""}${item.recommended ? " · 推荐" : ""}`,
      })),
    [modelOptions],
  );

  const editModelOptions = useMemo(() => {
    const models = getPresetModels(editProvider);
    const fallback = models.length > 0 ? models : [{ id: "__custom__", label: "手动输入模型" }];
    return fallback.map((item) => ({
      value: item.id,
      label: `${item.label}${item.legacy ? "（旧）" : ""}${item.recommended ? " · 推荐" : ""}`,
    }));
  }, [editProvider]);

  function refreshConfigs() {
    setConfigs(listConfigs());
    setEnabledConfig(getEnabledConfig());
  }

  async function refreshHostedCredentials() {
    if (!hostedAvailable) {
      setHostedCredentials([]);
      setHostedError(null);
      return;
    }

    setHostedLoading(true);
    setHostedError(null);
    try {
      const credentials = await listHostedCredentials();
      setHostedCredentials(credentials);
      const activeCredentials = credentials.filter((credential) => credential.status !== "deleted" && !credential.deleted_at);
      const activeCredentialIds = new Set(activeCredentials.map((credential) => credential.id));
      listConfigs()
        .filter(
          (config) =>
            config.storageMode === "hosted_encrypted" &&
            config.credentialId &&
            !activeCredentialIds.has(config.credentialId),
        )
        .forEach((config) => removeHostedConfigMetadata(config.credentialId as string));
      activeCredentials.forEach((credential) => syncHostedConfig(toHostedSyncInput(credential)));
      refreshConfigs();

      const preferred =
        credentials.find((credential) => credential.id === selectedHostedId && credential.status === "active" && !credential.deleted_at) ??
        credentials.find((credential) => credential.is_default && credential.status === "active" && !credential.deleted_at) ??
        credentials.find((credential) => credential.status === "active" && !credential.deleted_at) ??
        null;

      if (preferred) {
        setSelectedHostedId(preferred.id);
      }
    } catch (error) {
      setHostedError(error instanceof Error ? error.message : "托管凭据加载失败，请稍后重试。");
    } finally {
      setHostedLoading(false);
    }
  }

  useEffect(() => {
    refreshConfigs();
  }, []);

  useEffect(() => {
    if (!loading && hostedAvailable) {
      void refreshHostedCredentials();
    }
    if (!hostedAvailable) {
      setHostedCredentials([]);
      setHostedError(null);
    }
  }, [hostedAvailable, loading, userId]);

  useEffect(() => {
    if (storageMode !== "hosted_encrypted") {
      setSelectedHostedId(null);
    }
  }, [storageMode]);

  function handleProviderChange(nextProvider: ProviderType) {
    setProvider(nextProvider);
    setTestResultState(null);
    setMessage(null);

    const nextBase = getBaseUrl(nextProvider);
    const nextModel = getDefaultModel(nextProvider);
    setBaseURL(nextBase);
    setModel(nextModel);
    setCustomModel(false);
    setCustomModelValue("");

    const existing = configs.find((item) => item.provider === nextProvider && item.storageMode === storageMode);
    if (existing) {
      setModel(existing.model);
      if (existing.baseURL) setBaseURL(existing.baseURL);
      setLabel(existing.label);
    }

    if (storageMode !== "hosted_encrypted") {
      const stored = loadApiKey(nextProvider, storageMode);
      setApiKey(stored?.apiKey ?? "");
      if (stored) {
        setModel(stored.model);
        setBaseURL(stored.baseURL);
      }
    } else {
      setApiKey("");
    }
  }

  function handleModelChange(value: string) {
    if (value === "__custom__") {
      setCustomModel(true);
      setModel("");
      return;
    }
    setCustomModel(false);
    setModel(value);
  }

  function openEditor(target: EditableConfigTarget) {
    setEditingTarget(target);
    setEditProvider(target.provider);
    setEditLabel(target.label || "");
    setEditBaseURL(target.baseURL || getBaseUrl(target.provider));
    setEditSetDefault(!!target.isDefault);
    setEditMessage(null);
    setEditApiKey("");

    const knownModel = getPresetModels(target.provider).some((item) => item.id === target.model);
    if (knownModel) {
      setEditCustomModel(false);
      setEditModel(target.model);
      setEditCustomModelValue("");
    } else {
      setEditCustomModel(true);
      setEditModel("");
      setEditCustomModelValue(target.model);
    }
  }

  function closeEditor() {
    setEditingTarget(null);
    setEditMessage(null);
    setEditApiKey("");
    setEditSaving(false);
  }

  async function handleSave() {
    setMessage(null);
    setTestResultState(null);
    const finalModel = customModel ? customModelValue.trim() : model.trim();

    if (!finalModel) {
      setMessage("请选择或输入模型名称。");
      return;
    }

    if (storageMode === "hosted_encrypted") {
      if (!hostedAvailable) {
        setMessage("托管加密需要先登录。");
        return;
      }
      if (!apiKey.trim()) {
        setMessage("请输入 API Key。");
        return;
      }

      setSaving(true);
      try {
        const credential = await saveHostedCredential({
          label: label.trim() || `${preset?.name ?? String(provider)} 托管凭据`,
          provider_type: provider as Exclude<ProviderType, "mock">,
          base_url: baseURL.trim(),
          default_model: finalModel,
          api_key: apiKey.trim(),
          set_default: setDefault,
        });

        const synced = syncHostedConfig(toHostedSyncInput(credential));
        if (credential.is_default) {
          setEnabled(synced.id);
        }

        setSelectedHostedId(credential.id);
        saveHostedCredentialSelection(selectionFromCredential(credential));
        setApiKey("");
        setShowKey(false);
        refreshConfigs();
        await refreshHostedCredentials();
        setMessage("托管加密凭据已保存，前端不会再显示明文 API Key。");
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "保存托管凭据失败。");
      } finally {
        setSaving(false);
      }
      return;
    }

    if (!apiKey.trim()) {
      setMessage("请输入 API Key。");
      return;
    }

    if (storageMode === "local_device") {
      saveApiKeyLocalDevice(provider, apiKey.trim(), finalModel, baseURL.trim());
    } else {
      saveApiKeySession(provider, apiKey.trim(), finalModel, baseURL.trim());
    }

    const existing = configs.find((item) => item.provider === provider && item.storageMode === storageMode);
    if (existing) {
      updateConfig(existing.id, {
        provider,
        model: finalModel,
        baseURL: baseURL.trim(),
        label: label.trim() || getPresetName(provider),
      });
    } else {
      saveConfig({
        label: label.trim() || getPresetName(provider),
        provider,
        model: finalModel,
        baseURL: baseURL.trim(),
        storageMode,
      });
    }

    refreshConfigs();
    setMessage("配置已保存。");
  }

  async function handleSaveEdit() {
    if (!editingTarget) return;
    setEditSaving(true);
    setEditMessage(null);

    const finalModel = editCustomModel ? editCustomModelValue.trim() : editModel.trim();
    if (!finalModel) {
      setEditMessage("请选择或输入模型名称。");
      setEditSaving(false);
      return;
    }

    try {
      if (editingTarget.storageMode === "hosted_encrypted") {
        const credential = await saveHostedCredential({
          credential_id: editingTarget.credentialId ?? editingTarget.id,
          label: editLabel.trim() || `${getPresetName(editProvider)} 托管凭据`,
          provider_type: editProvider as Exclude<ProviderType, "mock">,
          base_url: editBaseURL.trim(),
          default_model: finalModel,
          api_key: editApiKey.trim() || undefined,
          set_default: editSetDefault,
        });

        const synced = syncHostedConfig(toHostedSyncInput(credential));
        if (credential.is_default) {
          setEnabled(synced.id);
        }
        if (selectedHostedId === credential.id || credential.is_default) {
          saveHostedCredentialSelection(selectionFromCredential(credential));
          setSelectedHostedId(credential.id);
        }

        refreshConfigs();
        await refreshHostedCredentials();
        closeEditor();
        setMessage("托管凭据已更新。");
        return;
      }

      const providerChanged = editingTarget.provider !== editProvider;
      const newApiKey = editApiKey.trim();
      if (providerChanged && !newApiKey) {
        setEditMessage("切换 Provider 时，请重新填写 API Key。");
        setEditSaving(false);
        return;
      }

      const stored = loadApiKey(editingTarget.provider, editingTarget.storageMode);
      const apiKeyToSave = newApiKey || stored?.apiKey || "";
      if (!apiKeyToSave) {
        setEditMessage("当前配置缺少 API Key，请输入新的 API Key。");
        setEditSaving(false);
        return;
      }

      if (editingTarget.storageMode === "local_device") {
        saveApiKeyLocalDevice(editProvider, apiKeyToSave, finalModel, editBaseURL.trim());
      } else {
        saveApiKeySession(editProvider, apiKeyToSave, finalModel, editBaseURL.trim());
      }

      if (providerChanged) {
        clearApiKey(editingTarget.provider, editingTarget.storageMode);
      }

      updateConfig(editingTarget.id, {
        provider: editProvider,
        label: editLabel.trim() || getPresetName(editProvider),
        model: finalModel,
        baseURL: editBaseURL.trim(),
      });

      refreshConfigs();
      closeEditor();
      setMessage("API 配置已更新。");
    } catch (error) {
      setEditMessage(error instanceof Error ? error.message : "保存失败，请稍后重试。");
      setEditSaving(false);
    }
  }

  async function handleTest() {
    setTesting(true);
    setMessage(null);
    setTestResultState(null);

    try {
      if (storageMode === "hosted_encrypted" && !selectedHostedId) {
        setTestResultState({
          ok: false,
          error: {
            type: "missing_key",
            title: "缺少托管凭据",
            status: 0,
            detail: "请先保存托管加密凭据，或在下方已保存托管凭据中选择当前使用项。",
            provider,
            retryable: false,
          },
        });
        return;
      }

      const finalModel = customModel ? customModelValue.trim() : model.trim();
      const config = buildConfigFromStorage(
        provider,
        storageMode === "hosted_encrypted" ? "" : apiKey.trim(),
        storageMode,
        finalModel,
        baseURL.trim(),
        selectedHostedId ?? null,
      );

      const result = await testProviderConnection(config);
      setTestResultState(result);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "测试失败，请稍后重试。");
    } finally {
      setTesting(false);
    }
  }

  async function handleEnable(id: string) {
    const config = configs.find((item) => item.id === id);
    if (!config) return;

    setEnablingId(id);
    try {
      setEnabled(id);
      markUsed(id);
      if (config.storageMode === "hosted_encrypted" && config.credentialId) {
        const credential = hostedCredentials.find((item) => item.id === config.credentialId);
        if (credential) {
          saveHostedCredentialSelection(selectionFromCredential(credential));
          setSelectedHostedId(credential.id);
        }
      }
      refreshConfigs();
      setMessage("已切换为当前启用配置。");
    } catch {
      setMessage("启用失败，请稍后重试。");
    } finally {
      setEnablingId(null);
    }
  }

  async function handleTestConfig(id: string) {
    const config = configs.find((item) => item.id === id);
    if (!config) return;

    setTestingId(id);
    try {
      let keyValue = "";
      if (config.storageMode === "hosted_encrypted") {
        if (!config.credentialId) {
          setTestResult(id, "failed", undefined, "缺少托管凭据 ID");
          refreshConfigs();
          return;
        }
      } else {
        const stored = loadApiKey(config.provider, config.storageMode);
        keyValue = stored?.apiKey ?? "";
      }

      const cfg = buildConfigFromStorage(
        config.provider,
        keyValue,
        config.storageMode,
        config.model,
        config.baseURL,
        config.credentialId,
      );

      const result = await testProviderConnection(cfg);
      setTestResult(id, result.ok ? "ok" : "failed", result.latencyMs, result.error?.detail);
      refreshConfigs();
    } catch (error) {
      setTestResult(id, "failed", undefined, error instanceof Error ? error.message : String(error));
      refreshConfigs();
    } finally {
      setTestingId(null);
    }
  }

  async function handleDelete(id: string) {
    const config = configs.find((item) => item.id === id);
    if (!config) return;
    if (!window.confirm(config.enabled ? "这是当前启用配置，删除后需要重新选择启用配置。确定删除吗？" : "确定删除这个 API 配置吗？")) {
      return;
    }

    if (config.storageMode !== "hosted_encrypted") {
      clearApiKey(config.provider, config.storageMode);
    }
    if (config.storageMode === "hosted_encrypted" && config.credentialId) {
      try {
        await deleteHostedCredential(config.credentialId);
      } catch {
        // ignore
      }
    }

    deleteConfig(id);
    refreshConfigs();
    setMessage("配置已删除。");
  }

  async function handleTestHostedCredential(credential: ProviderCredentialRow) {
    const mapped = hostedConfigByCredentialId.get(credential.id) ?? syncHostedConfig(toHostedSyncInput(credential));
    refreshConfigs();
    await handleTestConfig(mapped.id);
  }

  async function handleEnableHostedCredential(credential: ProviderCredentialRow) {
    const mapped = hostedConfigByCredentialId.get(credential.id) ?? syncHostedConfig(toHostedSyncInput(credential));
    await handleEnable(mapped.id);
  }

  async function handleDeleteHostedCredential(credential: ProviderCredentialRow) {
    if (!window.confirm("确定删除这份托管加密凭据吗？")) {
      return;
    }

    await deleteHostedCredential(credential.id);
    removeHostedConfigMetadata(credential.id);
    if (selectedHostedId === credential.id) {
      setSelectedHostedId(null);
    }
    await refreshHostedCredentials();
    refreshConfigs();
    setMessage("托管凭据已删除。");
  }

  function handleClearLocal() {
    clearApiKey(provider, storageMode);
    setApiKey("");
    setTestResultState(null);
    setMessage("当前浏览器中的本地 API 配置已清除。");
  }

  const legacyWarning =
    !customModel && isModelLegacy(provider, model)
      ? "当前模型名称已经过时，建议切换到新的推荐模型。"
      : null;
  const usable = isPresetUsable(provider);
  const notUsable = !usable && provider !== "mock";
  const visibleHostedCredentials = useMemo(
    () =>
      dedupeHostedCredentials(
        hostedCredentials.filter((item) => item.status !== "deleted" && !item.deleted_at),
      ),
    [hostedCredentials],
  );
  const deviceConfigs = useMemo(
    () => configs.filter((config) => config.storageMode !== "hosted_encrypted"),
    [configs],
  );
  const sessionConfigs = useMemo(
    () => deviceConfigs.filter((config) => config.storageMode === "session_only"),
    [deviceConfigs],
  );
  const localDeviceConfigs = useMemo(
    () => deviceConfigs.filter((config) => config.storageMode === "local_device"),
    [deviceConfigs],
  );
  const hostedConfigByCredentialId = useMemo(() => {
    const map = new Map<string, ApiConfigEntry>();
    configs
      .filter((config) => config.storageMode === "hosted_encrypted" && config.credentialId)
      .forEach((config) => {
        if (!config.credentialId || map.has(config.credentialId)) return;
        map.set(config.credentialId, config);
      });
    return map;
  }, [configs]);
  const showDeviceConfigDisclosure = hostedAvailable && deviceConfigs.length > 0;
  const currentHostedCredentialId =
    enabledConfig?.storageMode === "hosted_encrypted" ? enabledConfig.credentialId ?? selectedHostedId : selectedHostedId;
  const visibleEnabledConfig =
    !hostedAvailable && enabledConfig?.storageMode === "hosted_encrypted"
      ? deviceConfigs.find((config) => config.enabled) ?? null
      : enabledConfig;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <Key className="h-5 w-5 text-brand-500" />
        <h3 className="text-sm font-semibold text-ink-700">API Provider 配置</h3>
      </div>

      {visibleEnabledConfig ? (() => {
        const enabledConfig = visibleEnabledConfig;
        return (
        <div className="neo-panel-soft rounded-[28px] px-4 py-4">
          <div className="flex items-center gap-2">
            <Check className="h-4 w-4 text-brand-600" />
            <span className="text-sm font-medium text-brand-700">当前启用</span>
            <ProviderStatusDot status={visibleEnabledConfig.testStatus} />
          </div>
          <p className="mt-1 text-xs text-ink-500">
            {(enabledConfig.label || getPresetName(enabledConfig.provider))} · {enabledConfig.model || "未选择模型"} ·{" "}
            {getStorageModeLabel(enabledConfig.storageMode)}
          </p>
          {enabledConfig.lastTestedAt ? (
            <p className="text-[11px] text-ink-400">最近测试：{new Date(enabledConfig.lastTestedAt).toLocaleString()}</p>
          ) : null}
        </div>
        );
      })() : (
        <div className="rounded-[28px] border border-amber-100/80 bg-amber-light/20 px-4 py-3 shadow-[0_14px_40px_rgba(251,191,36,0.12)]">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-500" />
            <p className="text-xs text-amber-700">还没有启用任何 API 配置。先保存并启用一份配置，聊天页才能调用真实模型。</p>
          </div>
        </div>
      )}

      {hostedAvailable ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h4 className="text-sm font-semibold text-ink-700">当前账号 API 配置</h4>
              <p className="mt-1 text-xs text-ink-400">
                这些配置保存为托管加密凭据，登录同账号后可跨设备使用，不显示明文 API Key。
              </p>
            </div>
            <button
              type="button"
              onClick={() => void refreshHostedCredentials()}
              disabled={hostedLoading}
              className="neo-button flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs text-ink-600 disabled:opacity-50"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              刷新
            </button>
          </div>

          {hostedLoading ? (
            <div className="neo-panel-soft rounded-[24px] px-4 py-3 text-sm text-ink-500">
              正在加载当前账号 API 配置...
            </div>
          ) : hostedError ? (
            <div className="rounded-[20px] border border-rose-100/80 bg-rose-50/60 px-3 py-2 text-xs text-rose-600">
              {hostedError}
            </div>
          ) : visibleHostedCredentials.length === 0 ? (
            <div className="neo-panel-soft rounded-[24px] px-4 py-4 text-sm text-ink-500">
              当前账号还没有云端 API 配置。
            </div>
          ) : (
            <div className="space-y-3">
              {visibleHostedCredentials.map((cred) => {
                const mapped = hostedConfigByCredentialId.get(cred.id);
                const isEnabled = currentHostedCredentialId === cred.id || !!mapped?.enabled;
                const providerName = cred.provider_type === "deepseek" ? "DeepSeek" : getPresetName(cred.provider_type);
                const testStatus = mapped?.testStatus ?? "untested";
                const testTime = mapped?.lastTestedAt ? new Date(mapped.lastTestedAt).toLocaleString() : "未测试";
                const usedTime = mapped?.lastUsedAt || cred.last_used_at
                  ? new Date((mapped?.lastUsedAt || cred.last_used_at) as string).toLocaleString()
                  : "暂无记录";

                return (
                  <div
                    key={cred.id}
                    className={`${isEnabled ? "neo-button-pressed ring-1 ring-brand-200/60" : "neo-panel-soft"} rounded-[24px] px-4 py-4`}
                  >
                    <div className="flex flex-col gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h5 className="text-sm font-semibold text-ink-700">{cred.label || "未命名托管凭据"}</h5>
                          <ProviderStatusDot status={testStatus} showLabel />
                          {cred.is_default ? (
                            <span className="neo-pill bg-emerald-light px-2 py-0.5 text-[10px] text-emerald-700">默认</span>
                          ) : null}
                          {isEnabled ? (
                            <span className="neo-pill bg-brand-100/70 px-2 py-0.5 text-[10px] text-brand-700">已启用</span>
                          ) : null}
                        </div>
                        <p className="mt-1 text-xs text-ink-400">
                          {providerName} / {cred.default_model || "未设置模型"}
                        </p>
                        <p className="mt-1 text-[11px] text-ink-300">
                          最近测试：{testTime} · 最近使用：{usedTime}
                        </p>
                      </div>

                      <div className="grid gap-2 sm:grid-cols-2">
                        <button
                          type="button"
                          onClick={() =>
                            openEditor({
                              id: cred.id,
                              provider: cred.provider_type,
                              storageMode: "hosted_encrypted",
                              model: cred.default_model || getDefaultModel(cred.provider_type),
                              baseURL: cred.base_url || getBaseUrl(cred.provider_type),
                              label: cred.label || "",
                              credentialId: cred.id,
                              isDefault: cred.is_default,
                            })
                          }
                          className="neo-button rounded-[18px] px-3.5 py-2 text-xs text-ink-600"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          编辑
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleTestHostedCredential(cred)}
                          disabled={testingId === mapped?.id}
                          className="neo-button rounded-[18px] px-3.5 py-2 text-xs text-ink-600 disabled:opacity-50"
                        >
                          <Zap className="h-3.5 w-3.5" />
                          {testingId === mapped?.id ? "测试中..." : "测试连接"}
                        </button>
                        {isEnabled ? (
                          <div className="neo-pill flex items-center justify-center rounded-[18px] px-3.5 py-2 text-xs text-brand-700">
                            已启用
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => void handleEnableHostedCredential(cred)}
                            disabled={enablingId === mapped?.id}
                            className="neo-button-primary rounded-[18px] px-3.5 py-2 text-xs disabled:opacity-50"
                          >
                            <Check className="h-3.5 w-3.5" />
                            设为启用
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => void handleDeleteHostedCredential(cred)}
                          className="neo-button rounded-[18px] px-3.5 py-2 text-xs text-rose-600"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          删除
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <div>
            <h4 className="text-sm font-semibold text-ink-700">本设备 API 配置</h4>
            <p className="mt-1 text-xs text-ink-400">
              当前未登录，只能使用本设备配置。登录后可保存托管加密凭据，实现跨设备同步。
            </p>
          </div>
          {deviceConfigs.length === 0 ? (
            <div className="neo-panel-soft rounded-[24px] px-4 py-4 text-sm text-ink-500">
              当前设备还没有已保存的本地 API 配置。
            </div>
          ) : (
            deviceConfigs.map((config) => (
              <ProviderConfigCard
                key={config.id}
                config={config}
                testing={testingId === config.id}
                enabling={enablingId === config.id}
                onEdit={(id) => {
                  const target = deviceConfigs.find((item) => item.id === id);
                  if (!target) return;
                  openEditor({
                    id: target.id,
                    provider: target.provider,
                    storageMode: target.storageMode,
                    model: target.model,
                    baseURL: target.baseURL,
                    label: target.label,
                    credentialId: target.credentialId,
                    isDefault: target.enabled,
                  });
                }}
                onTest={() => void handleTestConfig(config.id)}
                onEnable={(id) => void handleEnable(id)}
                onDelete={(id) => void handleDelete(id)}
              />
            ))
          )}
        </div>
      )}

      <details className="group" open={configs.length === 0}>
        <summary className="cursor-pointer list-none">
          <div className="flex items-center gap-2 text-xs font-medium text-ink-500 group-open:hidden">
            <Plus className="h-3.5 w-3.5" />
            新增 API 配置
          </div>
        </summary>

        <div className="mt-4 space-y-5 border-t border-white/55 pt-5">
          <div>
            <label className="mb-2 block text-xs font-medium text-ink-500">凭据保存位置</label>
            <div className="space-y-2">
              {storageModes.map((mode) => {
                const disabled = mode === "hosted_encrypted" && !hostedAvailable;
                const localExisting = mode !== "hosted_encrypted" && hasStoredApiKey(provider, mode);

                return (
                  <label
                    key={mode}
                    className={`flex items-start gap-3 rounded-[24px] p-3.5 transition-all duration-[240ms] ${
                      storageMode === mode ? "neo-button-pressed ring-1 ring-brand-200/60" : "neo-panel-soft hover:-translate-y-0.5"
                    } ${disabled ? "opacity-60" : ""}`}
                  >
                    <input
                      type="radio"
                      name="storageMode"
                      value={mode}
                      checked={storageMode === mode}
                      disabled={disabled}
                      onChange={() => {
                        setStorageMode(mode);
                        setTestResultState(null);
                        setMessage(null);
                        if (mode === "hosted_encrypted") {
                          setApiKey("");
                        } else {
                          const existing = loadApiKey(provider, mode);
                          setApiKey(existing?.apiKey ?? "");
                          if (existing) {
                            setModel(existing.model);
                            setBaseURL(existing.baseURL);
                          }
                        }
                      }}
                      className="mt-0.5"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium text-ink-700">{getStorageModeLabel(mode)}</span>
                        {localExisting ? (
                          <span className="neo-pill bg-emerald-light text-[11px] text-emerald-700">已保存</span>
                        ) : null}
                        {disabled ? (
                          <span className="neo-pill bg-surface-100 text-[11px] text-ink-400">需要登录</span>
                        ) : null}
                      </div>
                      <p className="mt-1 text-xs text-ink-400">{getStorageModeDescription(mode)}</p>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-ink-500">Provider</label>
            <SoftSelect
              value={provider}
              onChange={(next) => handleProviderChange(next as ProviderType)}
              options={providerOptions}
              placeholder="选择 Provider"
            />
            {preset ? <p className="mt-1 text-xs text-ink-400">{preset.description}</p> : null}
            {notUsable ? (
              <div className="mt-2 rounded-[24px] border border-amber-100/80 bg-amber-light/20 px-3 py-2 text-xs text-amber-700 shadow-[0_10px_30px_rgba(251,191,36,0.12)]">
                {preset?.notes ?? "当前 Provider 还需要专用适配器，建议先通过 OpenRouter 或自定义 OpenAI Compatible 使用。"}
              </div>
            ) : null}
          </div>

          {usable || provider === "mock" ? (
            <>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-ink-500">模型</label>
                <SoftSelect
                  value={customModel ? "__custom__" : model}
                  onChange={handleModelChange}
                  options={modelSelectOptions}
                  placeholder="选择模型"
                />
                {modelOptions.length > 0 && !customModel ? (
                  <p className="mt-1 text-xs text-ink-400">{modelOptions.find((item) => item.id === model)?.description ?? ""}</p>
                ) : null}
                {legacyWarning ? <p className="mt-1 text-xs text-amber-600">{legacyWarning}</p> : null}
              </div>

              {customModel ? (
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-ink-500">自定义模型名称</label>
                  <input
                    type="text"
                    value={customModelValue}
                    onChange={(event) => setCustomModelValue(event.target.value)}
                    placeholder="输入模型 ID"
                    className="neo-input w-full rounded-input px-3 py-2.5 text-sm text-ink-900"
                  />
                </div>
              ) : null}

              <div>
                <label className="mb-1.5 block text-xs font-medium text-ink-500">Base URL</label>
                <input
                  type="text"
                  value={baseURL}
                  onChange={(event) => setBaseURL(event.target.value)}
                  placeholder={getBaseUrl(provider) || "https://api.example.com/v1"}
                  className="neo-input w-full rounded-input break-all px-3 py-2.5 font-mono text-sm text-ink-900"
                />
              </div>

              {storageMode === "hosted_encrypted" ? (
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-ink-500">凭据名称</label>
                  <input
                    type="text"
                    value={label}
                    onChange={(event) => setLabel(event.target.value)}
                    placeholder="例如：我的 DeepSeek 主账号"
                    className="neo-input w-full rounded-input px-3 py-2.5 text-sm text-ink-900"
                  />
                </div>
              ) : null}

              <div>
                <label className="mb-1.5 block text-xs font-medium text-ink-500">API Key</label>
                <div className="relative">
                  <input
                    type={showKey ? "text" : "password"}
                    value={apiKey}
                    onChange={(event) => {
                      setApiKey(event.target.value);
                      setMessage(null);
                      setTestResultState(null);
                    }}
                    placeholder={storageMode === "hosted_encrypted" ? "保存后前端不会再显示明文 Key" : "sk-..."}
                    className="neo-input w-full rounded-input px-3 py-2.5 pr-16 font-mono text-sm text-ink-900"
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey((current) => !current)}
                    className="neo-button absolute right-2 top-1/2 -translate-y-1/2 rounded-full px-2.5 py-1 text-xs text-ink-500"
                  >
                    {showKey ? "隐藏" : "显示"}
                  </button>
                </div>
              </div>

              {storageMode === "hosted_encrypted" ? (
                <label className="neo-panel-soft flex items-start gap-3 rounded-[24px] px-4 py-3.5">
                  <input
                    type="checkbox"
                    checked={setDefault}
                    onChange={(event) => setSetDefault(event.target.checked)}
                    className="mt-1"
                  />
                  <div>
                    <p className="text-sm font-medium text-ink-700">保存后设为默认托管凭据</p>
                    <p className="mt-1 text-xs text-ink-400">之后在已登录设备上可以更快选中它。</p>
                  </div>
                </label>
              ) : null}

              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => void handleSave()}
                  disabled={saving || (storageMode === "hosted_encrypted" && !hostedAvailable)}
                  className="neo-button flex items-center gap-1.5 rounded-full px-4 py-2.5 text-xs text-ink-700 disabled:opacity-50"
                >
                  <Save className="h-3.5 w-3.5" />
                  {storageMode === "hosted_encrypted" ? "保存到托管加密" : "保存配置"}
                </button>
                <button
                  onClick={() => void handleTest()}
                  disabled={testing}
                  className="neo-button-primary flex items-center gap-1.5 rounded-full px-4 py-2.5 text-xs disabled:opacity-50"
                >
                  <Zap className="h-3.5 w-3.5" />
                  {testing ? "测试中..." : "测试连接"}
                </button>
                {storageMode !== "hosted_encrypted" ? (
                  <button onClick={handleClearLocal} className="neo-button flex items-center gap-1.5 rounded-full px-4 py-2.5 text-xs text-rose-600">
                    <Trash2 className="h-3.5 w-3.5" />
                    清除本地配置
                  </button>
                ) : null}
              </div>

              {testResult ? (
                <div
                  className={`rounded-[24px] border p-3 shadow-[0_12px_34px_rgba(148,163,184,0.10)] ${
                    testResult.ok ? "border-emerald-100 bg-emerald-light/30" : "border-rose-100 bg-rose-light/30"
                  }`}
                >
                  <div className="mb-1 flex items-center gap-2">
                    {testResult.ok ? (
                      <>
                        <Wifi className="h-4 w-4 text-emerald-600" />
                        <span className="text-sm font-medium text-emerald-700">连接成功</span>
                      </>
                    ) : (
                      <>
                        <WifiOff className="h-4 w-4 text-rose-600" />
                        <span className="text-sm font-medium text-rose-700">连接失败</span>
                      </>
                    )}
                    {testResult.latencyMs != null ? (
                      <span className="ml-auto text-xs text-ink-400">{testResult.latencyMs}ms</span>
                    ) : null}
                  </div>
                  {testResult.ok ? (
                    <p className="text-xs text-emerald-700">测试成功不代表已经启用，请点击“设为启用”。</p>
                  ) : (
                    <p className="text-xs leading-relaxed text-rose-600">{testResult.error?.detail || "请检查配置后重试。"}</p>
                  )}
                </div>
              ) : null}

              {message ? (
                <p className={`text-sm ${message.includes("失败") ? "text-rose-600" : "text-emerald-600"}`}>{message}</p>
              ) : null}
            </>
          ) : null}

          {notUsable ? (
            <div className="rounded-[24px] border border-amber-100/80 bg-amber-light/20 px-4 py-3 text-xs text-amber-700 shadow-[0_10px_30px_rgba(251,191,36,0.12)]">
              当前 Provider 还需要专用适配器，建议先通过 OpenRouter 或自定义 OpenAI Compatible 中转，或等待后续接入。
            </div>
          ) : null}
        </div>
      </details>

      {showDeviceConfigDisclosure ? (
        <details className="group border-t border-white/55 pt-4">
          <summary className="cursor-pointer list-none">
            <div className="flex items-center gap-2 text-sm font-semibold text-ink-700">
              <ChevronDown className="h-4 w-4 transition-transform duration-[220ms] group-open:rotate-180" />
              本设备配置
            </div>
            <p className="mt-1 pl-6 text-xs text-ink-400">
              这些配置只保存在当前设备浏览器，不会同步到其他设备。
            </p>
          </summary>

          <div className="mt-3 space-y-3 pl-0.5">
            {localDeviceConfigs.length > 0 ? (
              <div className="space-y-3">
                {localDeviceConfigs.map((config) => (
                  <ProviderConfigCard
                    key={config.id}
                    config={config}
                    testing={testingId === config.id}
                    enabling={enablingId === config.id}
                    onEdit={(id) => {
                      const target = localDeviceConfigs.find((item) => item.id === id);
                      if (!target) return;
                      openEditor({
                        id: target.id,
                        provider: target.provider,
                        storageMode: target.storageMode,
                        model: target.model,
                        baseURL: target.baseURL,
                        label: target.label,
                        credentialId: target.credentialId,
                        isDefault: target.enabled,
                      });
                    }}
                    onTest={() => void handleTestConfig(config.id)}
                    onEnable={(id) => void handleEnable(id)}
                    onDelete={(id) => void handleDelete(id)}
                  />
                ))}
              </div>
            ) : null}

            {sessionConfigs.length > 0 ? (
              <div className="neo-panel-soft rounded-[24px] px-4 py-4 text-sm text-ink-600">
                当前还有 {sessionConfigs.length} 个仅本次会话有效的临时配置。关闭页面后，这些配置可能需要重新填写。
              </div>
            ) : null}

            {!hostedAvailable ? (
              <div className="neo-panel-soft rounded-[24px] px-4 py-4 text-sm text-ink-500">
                登录后可使用托管加密凭据，当前账号的云端 API 配置会显示在上方主列表中。
              </div>
            ) : null}

            {deviceConfigs.length === 0 ? (
              <div className="neo-panel-soft rounded-[24px] px-4 py-4 text-sm text-ink-500">
                当前设备还没有单独保存的本地 API 配置。
              </div>
            ) : null}
          </div>
        </details>
      ) : null}

      <AppModal
        open={!!editingTarget}
        title="编辑 API 配置"
        description="可修改名称、Provider、Base URL、模型和默认状态。API Key 留空表示保持原值不变。"
        onClose={closeEditor}
        size="lg"
      >
        {editingTarget ? (
          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-ink-500">配置名称</label>
              <input
                type="text"
                value={editLabel}
                onChange={(event) => setEditLabel(event.target.value)}
                placeholder="给这份配置起个名字"
                className="neo-input w-full rounded-input px-3 py-2.5 text-sm text-ink-900"
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-ink-500">Provider</label>
                <SoftSelect
                  value={editProvider}
                  onChange={(next) => {
                    const nextProvider = next as ProviderType;
                    setEditProvider(nextProvider);
                    setEditBaseURL(getBaseUrl(nextProvider));
                    const nextDefaultModel = getDefaultModel(nextProvider);
                    if (nextDefaultModel) {
                      setEditCustomModel(false);
                      setEditModel(nextDefaultModel);
                      setEditCustomModelValue("");
                    } else {
                      setEditCustomModel(true);
                      setEditModel("");
                    }
                  }}
                  options={providerOptions}
                  placeholder="选择 Provider"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-ink-500">存储模式</label>
                <div className="neo-input flex h-[50px] items-center rounded-[22px] px-4 text-sm text-ink-500">
                  {getStorageModeLabel(editingTarget.storageMode)}
                </div>
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-ink-500">模型</label>
              <SoftSelect
                value={editCustomModel ? "__custom__" : editModel}
                onChange={(value) => {
                  if (value === "__custom__") {
                    setEditCustomModel(true);
                    setEditModel("");
                    return;
                  }
                  setEditCustomModel(false);
                  setEditModel(value);
                }}
                options={editModelOptions}
                placeholder="选择模型"
              />
            </div>

            {editCustomModel ? (
              <div>
                <label className="mb-1.5 block text-xs font-medium text-ink-500">自定义模型</label>
                <input
                  type="text"
                  value={editCustomModelValue}
                  onChange={(event) => setEditCustomModelValue(event.target.value)}
                  placeholder="输入模型 ID"
                  className="neo-input w-full rounded-input px-3 py-2.5 text-sm text-ink-900"
                />
              </div>
            ) : null}

            <div>
              <label className="mb-1.5 block text-xs font-medium text-ink-500">Base URL</label>
              <input
                type="text"
                value={editBaseURL}
                onChange={(event) => setEditBaseURL(event.target.value)}
                className="neo-input w-full rounded-input px-3 py-2.5 text-sm text-ink-900"
              />
            </div>

            {editingTarget.storageMode === "hosted_encrypted" ? (
              <label className="neo-panel-soft flex items-start gap-3 rounded-[24px] px-4 py-3.5">
                <input
                  type="checkbox"
                  checked={editSetDefault}
                  onChange={(event) => setEditSetDefault(event.target.checked)}
                  className="mt-1"
                />
                <div>
                  <p className="text-sm font-medium text-ink-700">保存后设为默认托管凭据</p>
                  <p className="mt-1 text-xs text-ink-400">其他登录设备也会读取这份默认凭据。</p>
                </div>
              </label>
            ) : null}

            <div>
              <label className="mb-1.5 block text-xs font-medium text-ink-500">API Key</label>
              <input
                type="password"
                value={editApiKey}
                onChange={(event) => setEditApiKey(event.target.value)}
                placeholder="留空则保持原 Key 不变"
                className="neo-input w-full rounded-input px-3 py-2.5 text-sm text-ink-900"
              />
              <p className="mt-1 text-xs text-ink-400">
                {editingTarget.storageMode === "hosted_encrypted"
                  ? "托管凭据不会显示旧的明文 API Key；只有填写新 Key 时才会替换。"
                  : "本地模式下也不会回显旧的明文 Key；留空即可保持现状。"}
              </p>
            </div>

            {editMessage ? (
              <div className="rounded-[20px] border border-rose-100/80 bg-rose-50/60 px-3 py-2 text-xs text-rose-600">
                {editMessage}
              </div>
            ) : null}

            <div className="mobile-modal-safe-footer sticky bottom-0 -mx-1 flex gap-2 rounded-[24px] border border-white/55 bg-white/62 px-1 py-1.5 backdrop-blur-xl">
              <button
                type="button"
                onClick={() => void handleSaveEdit()}
                disabled={editSaving}
                className="neo-button-primary flex-1 rounded-[18px] px-4 py-2.5 text-sm disabled:opacity-50"
              >
                {editSaving ? "保存中..." : "保存修改"}
              </button>
              <button type="button" onClick={closeEditor} className="neo-button rounded-[18px] px-4 py-2.5 text-sm text-ink-600">
                取消
              </button>
            </div>
          </div>
        ) : null}
      </AppModal>
    </div>
  );
}
