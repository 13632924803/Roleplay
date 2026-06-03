export const ROLEPLAY_THEME_STORAGE_KEY = "roleplay-theme";

export const THEME_IDS = [
  "yunbai-glass",
  "xuanye-glass",
  "qinglan-mist",
  "zhijing-scroll",
] as const;

export type ThemeId = (typeof THEME_IDS)[number];

export interface ThemeOption {
  id: ThemeId;
  name: string;
  description: string;
  accent: string;
}

export interface ThemePreviewOption extends ThemeOption {
  previewClassName: string;
}

export const DEFAULT_THEME_ID: ThemeId = "yunbai-glass";

export const THEME_OPTIONS: ThemePreviewOption[] = [
  {
    id: "yunbai-glass",
    name: "云白琉璃",
    description: "默认蓝白玻璃拟态，清爽通用",
    accent: "蓝白",
    previewClassName: "theme-preview-yunbai-glass",
  },
  {
    id: "xuanye-glass",
    name: "玄夜琉璃",
    description: "深色玻璃，适合夜间沉浸",
    accent: "玄夜",
    previewClassName: "theme-preview-xuanye-glass",
  },
  {
    id: "qinglan-mist",
    name: "青岚云境",
    description: "青绿山水，清新自然",
    accent: "青岚",
    previewClassName: "theme-preview-qinglan-mist",
  },
  {
    id: "zhijing-scroll",
    name: "纸境长卷",
    description: "纸墨卷轴，古风书卷感",
    accent: "纸境",
    previewClassName: "theme-preview-zhijing-scroll",
  },
];

export function isThemeId(value: string | null | undefined): value is ThemeId {
  return THEME_IDS.includes(value as ThemeId);
}

export function getThemeOption(themeId: ThemeId): ThemePreviewOption {
  return THEME_OPTIONS.find((option) => option.id === themeId) ?? THEME_OPTIONS[0];
}

export function readStoredTheme(): ThemeId {
  if (typeof window === "undefined") return DEFAULT_THEME_ID;
  const stored = window.localStorage.getItem(ROLEPLAY_THEME_STORAGE_KEY);
  return isThemeId(stored) ? stored : DEFAULT_THEME_ID;
}

export function persistTheme(themeId: ThemeId) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(ROLEPLAY_THEME_STORAGE_KEY, themeId);
}

export function applyThemeToDocument(themeId: ThemeId) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.dataset.theme = themeId;
  root.style.colorScheme = themeId === "xuanye-glass" ? "dark" : "light";
}

applyThemeToDocument(readStoredTheme());
