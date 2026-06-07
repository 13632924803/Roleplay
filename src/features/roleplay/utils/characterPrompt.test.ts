import { describe, it, expect } from "vitest";
import {
  parseCharacterCard,
  packCharacterCard,
  buildCharacterSystemPrompt,
  parseSessionMeta,
  buildSessionMeta,
  SESSION_META_VERSION,
  EMPTY_CARD,
  getBoundWorldbookId,
} from "./characterPrompt";
import type { CharacterRow } from "../types/database";

function char(card: Record<string, unknown>, name = "阿狸"): CharacterRow {
  return {
    id: "c",
    user_id: "u",
    name,
    slug: null,
    summary: null,
    card_json: card,
    avatar_path: null,
    avatar_emoji: null,
    tags: [],
    visibility: "private",
    is_favorite: false,
    archived_at: null,
    deleted_at: null,
    created_at: "",
    updated_at: "",
  };
}

describe("parse/pack card", () => {
  it("round-trips known fields", () => {
    const packed = packCharacterCard({ ...EMPTY_CARD, identity: "狐娘", personality: "傲娇" });
    expect(parseCharacterCard(char(packed)).identity).toBe("狐娘");
  });
  it("defaults missing fields to empty string", () => {
    expect(parseCharacterCard(char({})).personality).toBe("");
  });
});

describe("buildCharacterSystemPrompt", () => {
  it("includes name and non-empty fields", () => {
    const p = buildCharacterSystemPrompt(char({ identity: "狐娘", personality: "傲娇" }));
    expect(p).toContain("阿狸");
    expect(p).toContain("身份：狐娘");
    expect(p).toContain("性格：傲娇");
  });
  it("substitutes template vars and appends base setting", () => {
    const p = buildCharacterSystemPrompt(char({ user_nickname: "主人" }), "你好 {{user_name}}");
    expect(p).toContain("你好 主人");
    expect(p).toContain("角色基础设定");
  });
});

describe("session meta", () => {
  it("round-trips", () => {
    const meta = buildSessionMeta({ _meta_version: SESSION_META_VERSION, _template_id: "t1" });
    expect(parseSessionMeta(meta)._template_id).toBe("t1");
  });
  it("returns fresh meta for legacy/non-json prompt", () => {
    expect(parseSessionMeta("一段旧的纯文本提示词")._meta_version).toBe(SESSION_META_VERSION);
  });
});

describe("SillyTavern branch", () => {
  it("builds an ST-style prompt when sillytavern data is present", () => {
    const c = char({
      extra_settings: {
        sillytavern: {
          sourceSpec: "v2",
          raw: {},
          system_prompt: "Be concise.",
          post_history_instructions: "Stay in character.",
        },
      },
      identity: "a fox spirit",
      personality: "tsundere",
      background: "a quiet tavern",
    });
    const p = buildCharacterSystemPrompt(c);
    expect(p).toContain("a fox spirit");
    expect(p).toContain("Be concise.");
    expect(p).toContain("Stay in character.");
  });
  it("reads the bound worldbook id", () => {
    const c = char({ extra_settings: { bindings: { worldbook_id: "wb-1" } } });
    expect(getBoundWorldbookId(c)).toBe("wb-1");
    expect(getBoundWorldbookId(char({}))).toBeNull();
  });
});
