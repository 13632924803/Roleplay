import type { CharacterRow } from "../types/database";

export interface CharacterCardData {
  identity: string;
  appearance: string;
  personality: string;
  background: string;
  speaking_style: string;
  relationship: string;
  relationship_stage: string;
  user_nickname: string;
  greeting: string;
  forbidden_rules: string;
  likes: string;
  extra_settings: Record<string, unknown>;
}

export function parseCharacterCard(c: CharacterRow): CharacterCardData {
  const j = (c.card_json ?? {}) as Record<string, unknown>;
  return {
    identity: String(j.identity ?? ""),
    appearance: String(j.appearance ?? ""),
    personality: String(j.personality ?? ""),
    background: String(j.background ?? ""),
    speaking_style: String(j.speaking_style ?? ""),
    relationship: String(j.relationship ?? ""),
    relationship_stage: String(j.relationship_stage ?? ""),
    user_nickname: String(j.user_nickname ?? ""),
    greeting: String(j.greeting ?? ""),
    forbidden_rules: String(j.forbidden_rules ?? ""),
    likes: String(j.likes ?? ""),
    extra_settings: (j.extra_settings as Record<string, unknown>) ?? {},
  };
}

export function packCharacterCard(data: CharacterCardData): Record<string, unknown> {
  return {
    identity: data.identity,
    appearance: data.appearance,
    personality: data.personality,
    background: data.background,
    speaking_style: data.speaking_style,
    relationship: data.relationship,
    relationship_stage: data.relationship_stage,
    user_nickname: data.user_nickname,
    greeting: data.greeting,
    forbidden_rules: data.forbidden_rules,
    likes: data.likes,
    extra_settings: data.extra_settings,
  };
}

export const EMPTY_CARD: CharacterCardData = {
  identity: "",
  appearance: "",
  personality: "",
  background: "",
  speaking_style: "",
  relationship: "",
  relationship_stage: "",
  user_nickname: "",
  greeting: "",
  forbidden_rules: "",
  likes: "",
  extra_settings: {},
};

export function getBoundWorldbookId(c: CharacterRow): string | null {
  const ex = (c.card_json as Record<string, unknown>)?.extra_settings as Record<string, unknown> | undefined;
  const bindings = ex?.bindings as Record<string, unknown> | undefined;
  const id = bindings?.worldbook_id;
  return typeof id === "string" && id ? id : null;
}

function getSillyTavern(c: CharacterRow): Record<string, unknown> | null {
  const ex = (c.card_json as Record<string, unknown>)?.extra_settings as Record<string, unknown> | undefined;
  const st = ex?.sillytavern as Record<string, unknown> | undefined;
  return st ?? null;
}

// Build the full role system prompt sent to the provider.
export function buildCharacterSystemPrompt(
  c: CharacterRow,
  templateContent?: string,
): string {
  const card = parseCharacterCard(c);

  // SillyTavern branch: imported cards are assembled the ST way; native cards
  // fall through to the existing Chinese structure below (behavior unchanged).
  const st = getSillyTavern(c);
  if (st) {
    const parts: string[] = [`你正在扮演「${c.name}」。保持角色，不要跳出。`];
    if (card.identity) parts.push(card.identity);
    if (card.personality) parts.push(`Personality: ${card.personality}`);
    if (card.background) parts.push(`Scenario: ${card.background}`);
    const sys = String(st.system_prompt ?? "").trim();
    if (sys) parts.push(sys);
    const example = String(st.mes_example ?? "").trim();
    if (example) parts.push(`Example dialogue:\n${example}`);
    const post = String(st.post_history_instructions ?? "").trim();
    if (post) parts.push(post);
    const body = parts.join("\n\n");
    if (!templateContent) return body;
    return `${templateContent
      .replace(/\{\{char\}\}/g, c.name)
      .replace(/\{\{user\}\}/g, card.user_nickname || "用户")}\n\n---\n${body}`;
  }

  const roleParts: string[] = [
    `你正在扮演「${c.name}」。`,
    "你必须始终保持角色设定回复，不要自称 AI、模型或服务商，也不要跳出角色。",
  ];

  if (card.identity) roleParts.push(`身份：${card.identity}`);
  if (card.personality) roleParts.push(`性格：${card.personality}`);
  if (card.appearance) roleParts.push(`外貌：${card.appearance}`);
  if (card.background) roleParts.push(`背景：${card.background}`);
  if (card.speaking_style) roleParts.push(`说话风格：${card.speaking_style}`);
  if (card.relationship) {
    roleParts.push(`与用户的关系：${card.relationship}`);
    if (card.relationship_stage) roleParts.push(`当前阶段：${card.relationship_stage}`);
  }
  if (card.user_nickname) roleParts.push(`称呼用户为：${card.user_nickname}`);
  if (card.likes) roleParts.push(`偏好：${card.likes}`);
  if (card.forbidden_rules) roleParts.push(`必须遵守：${card.forbidden_rules}`);

  const rolePrompt = roleParts.join("\n");

  if (!templateContent) return rolePrompt;

  const templateWithVars = templateContent
    .replace(/\{\{character_name\}\}/g, c.name)
    .replace(/\{\{user_name\}\}/g, card.user_nickname || "用户")
    .replace(/\{\{current_scene\}\}/g, "（当前场景 — 可在设置中编辑会话摘要来记录）")
    .replace(/\{\{relationship_stage\}\}/g, card.relationship_stage || "未设定")
    .replace(/\{\{speaking_style\}\}/g, card.speaking_style || "自然对话")
    .replace(/\{\{greeting\}\}/g, card.greeting || "");

  return `${templateWithVars}\n\n---\n角色基础设定：\n${rolePrompt}`;
}

export const SESSION_META_VERSION = 2;

export interface SessionMeta {
  _meta_version: number;
  _template_id?: string;
  _worldbook_ids?: string[];
  _memory_ids?: string[];
  _disabled_worldbook_ids?: string[];
  _disabled_memory_ids?: string[];
  _summary_enabled?: boolean;
}

export function parseSessionMeta(systemPrompt: string | null): SessionMeta {
  if (!systemPrompt) return { _meta_version: SESSION_META_VERSION };
  try {
    const parsed = JSON.parse(systemPrompt);
    if (parsed && typeof parsed === "object" && parsed._meta_version) {
      return parsed as SessionMeta;
    }
  } catch {
    // Old sessions may store a literal prompt here; phase 6 metadata starts fresh.
  }
  return { _meta_version: SESSION_META_VERSION };
}

export function buildSessionMeta(meta: SessionMeta): string {
  return JSON.stringify(meta);
}
