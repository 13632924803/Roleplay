import type { NormalizedCard } from "./types";
import { EMPTY_CARD, type CharacterCardData } from "../utils/characterPrompt";

/** Map a NormalizedCard into { name, CharacterCardData, tags }. Hybrid: structured
 *  fill for editing + lossless ST preservation under extra_settings.sillytavern. */
export function mapCard(n: NormalizedCard): { name: string; card: CharacterCardData; tags: string[] } {
  const card: CharacterCardData = {
    ...EMPTY_CARD,
    identity: n.description,
    personality: n.personality,
    background: n.scenario,
    greeting: n.first_mes,
    user_nickname: "",
    extra_settings: {
      sillytavern: {
        sourceSpec: n.sourceSpec,
        raw: n.raw,
        system_prompt: n.system_prompt ?? "",
        post_history_instructions: n.post_history_instructions ?? "",
        mes_example: n.mes_example ?? "",
        alternate_greetings: n.alternate_greetings ?? [],
        creator: n.creator ?? "",
        character_version: n.character_version ?? "",
        nickname: n.nickname ?? "",
        creator_notes: n.creator_notes ?? "",
      },
      bindings: { worldbook_id: null as string | null },
    },
  };
  return { name: n.name || "未命名角色", card, tags: n.tags ?? [] };
}
