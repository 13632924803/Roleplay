import type { WorldbookEntryRow } from "../types/database";

export interface TriggeredEntry {
  entry: WorldbookEntryRow;
  matchedKeywords: string[];
  injected: boolean;
  skipReason?: string;
}

export interface SkippedEntry {
  entry: WorldbookEntryRow;
  reason: string;
}

export interface TriggerResult {
  triggered: TriggeredEntry[];
  skipped: SkippedEntry[];
}

type EntryWithKeywordAliases = WorldbookEntryRow & {
  keywords?: unknown;
  keyword?: unknown;
};

function normalizeForMatch(value: string, caseSensitive = false): string {
  const cased = caseSensitive ? value : value.toLowerCase();
  return cased
    .trim()
    .replace(/[\s\u3000]+/g, "")
    .replace(/[.,!?;:'"()[\]{}<>/\\|`~@#$%^&*_+=，。！？；：“”‘’（）【】《》、…—-]/g, "");
}

export function parseKeywords(raw: unknown): string[] {
  const values = Array.isArray(raw) ? raw : raw == null ? [] : [raw];
  const keywords = values.flatMap((value) =>
    String(value)
      .split(/[,，、\n\r;；]+/)
      .map((item) => item.trim())
      .filter(Boolean),
  );
  return [...new Set(keywords)];
}

export function getEntryKeywords(entry: WorldbookEntryRow): string[] {
  const withAliases = entry as EntryWithKeywordAliases;
  return parseKeywords(withAliases.triggers ?? withAliases.keywords ?? withAliases.keyword);
}

export function matchKeywords(input: string, keywordsRaw: unknown, caseSensitive = false): string[] {
  const normalizedInput = normalizeForMatch(input, caseSensitive);
  if (!normalizedInput) return [];

  return parseKeywords(keywordsRaw).filter((keyword) => {
    const normalizedKeyword = normalizeForMatch(keyword, caseSensitive);
    return normalizedKeyword.length > 0 && normalizedInput.includes(normalizedKeyword);
  });
}

export function triggerWorldbookEntries(
  entries: WorldbookEntryRow[],
  userMessage: string,
  recentMessages: string[],
  activeCharacterName: string | null,
  _activeSessionId: string | null,
  budgetAllocatedIds: Set<string>,
): TriggerResult {
  const triggered: TriggeredEntry[] = [];
  const skipped: SkippedEntry[] = [];
  const triggerText = [userMessage, ...recentMessages.slice(-8), activeCharacterName ?? ""]
    .filter(Boolean)
    .join(" ");

  for (const entry of entries) {
    if (!entry.enabled) {
      skipped.push({ entry, reason: "条目已禁用" });
      continue;
    }

    if (entry.scope === "character" && !activeCharacterName) {
      skipped.push({ entry, reason: "角色范围条目需要绑定角色" });
      continue;
    }

    const ext = (entry.extensions ?? {}) as Record<string, unknown>;
    const caseSensitive = ext.case_sensitive === true;
    let matchedKeywords: string[];
    if (ext.constant === true) {
      matchedKeywords = []; // constant: always triggered (still budget-limited)
    } else {
      const primary = matchKeywords(triggerText, getEntryKeywords(entry), caseSensitive);
      if (primary.length === 0) {
        skipped.push({ entry, reason: "无关键词命中" });
        continue;
      }
      if (ext.selective === true) {
        const secondary = matchKeywords(triggerText, ext.secondary_keys, caseSensitive);
        if (secondary.length === 0) {
          skipped.push({ entry, reason: "selective：次关键词未命中" });
          continue;
        }
        matchedKeywords = [...primary, ...secondary];
      } else {
        matchedKeywords = primary;
      }
    }

    const injected = budgetAllocatedIds.has(entry.id);
    if (!injected) {
      skipped.push({ entry, reason: `Token 预算超限（优先级 ${entry.priority}）` });
    }

    triggered.push({
      entry,
      matchedKeywords,
      injected,
      skipReason: injected ? undefined : "Token 预算超限",
    });
  }

  return { triggered, skipped };
}
