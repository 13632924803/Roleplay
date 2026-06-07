import type { CharacterCardData } from "../utils/characterPrompt";

export type SourceSpec = "v1" | "v2" | "v3";

export interface STCharacterBookEntry {
  keys?: string[];
  content?: string;
  enabled?: boolean;
  insertion_order?: number;
  name?: string;
  comment?: string;
  // advanced fields (selective/secondary_keys/constant/position/use_regex/...) are
  // preserved via the card's raw blob but not interpreted in sub-project 1.
  [k: string]: unknown;
}

export interface STCharacterBook {
  name?: string;
  entries?: STCharacterBookEntry[];
  [k: string]: unknown;
}

export interface NormalizedCard {
  sourceSpec: SourceSpec;
  name: string;
  description: string;
  personality: string;
  scenario: string;
  first_mes: string;
  mes_example: string;
  system_prompt?: string;
  post_history_instructions?: string;
  alternate_greetings?: string[];
  creator_notes?: string;
  tags?: string[];
  creator?: string;
  character_version?: string;
  nickname?: string;
  character_book?: STCharacterBook;
  extensions?: Record<string, unknown>;
  raw: unknown;
}

export interface PreparedEntry {
  title: string;
  content: string;
  triggers: string[];
  priority: number;
}

export interface PreparedImport {
  sourceSpec: SourceSpec;
  name: string;
  card: CharacterCardData;
  tags: string[];
  avatarDataUrl: string | null;
  worldbook: { name: string; entries: PreparedEntry[] } | null;
}
