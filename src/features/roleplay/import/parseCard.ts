import type { NormalizedCard, SourceSpec, STCharacterBook } from "./types";

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}
function strArr(v: unknown): string[] | undefined {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : undefined;
}

function fromData(data: Record<string, unknown>, spec: SourceSpec, raw: unknown): NormalizedCard {
  return {
    sourceSpec: spec,
    name: str(data.name),
    description: str(data.description),
    personality: str(data.personality),
    scenario: str(data.scenario),
    first_mes: str(data.first_mes),
    mes_example: str(data.mes_example),
    system_prompt: str(data.system_prompt) || undefined,
    post_history_instructions: str(data.post_history_instructions) || undefined,
    alternate_greetings: strArr(data.alternate_greetings),
    creator_notes: str(data.creator_notes) || undefined,
    tags: strArr(data.tags),
    creator: str(data.creator) || undefined,
    character_version: str(data.character_version) || undefined,
    nickname: str(data.nickname) || undefined,
    character_book: (data.character_book as STCharacterBook) ?? undefined,
    extensions: (data.extensions as Record<string, unknown>) ?? undefined,
    raw,
  };
}

/** Parse a card JSON string (V1 flat / V2 / V3) into a NormalizedCard. */
export function parseCard(jsonText: string): NormalizedCard {
  let obj: unknown;
  try {
    obj = JSON.parse(jsonText);
  } catch {
    throw new Error("角色卡不是有效的 JSON。");
  }
  if (!obj || typeof obj !== "object") throw new Error("角色卡格式无效。");
  const o = obj as Record<string, unknown>;

  if (o.spec === "chara_card_v3" && o.data && typeof o.data === "object") {
    return fromData(o.data as Record<string, unknown>, "v3", obj);
  }
  if (o.spec === "chara_card_v2" && o.data && typeof o.data === "object") {
    return fromData(o.data as Record<string, unknown>, "v2", obj);
  }
  // V1: flat object — require name + (first_mes | description) to look like a card.
  if (typeof o.name === "string" && (typeof o.first_mes === "string" || typeof o.description === "string")) {
    return fromData(o, "v1", obj);
  }
  throw new Error("无法识别的角色卡：缺少 spec 或必要字段。");
}
