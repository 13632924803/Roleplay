import type {
  CharacterRow,
  SessionRow,
  MessageRow,
  MessageRevisionRow,
  PromptTemplateRow,
  WorldbookEntryRow,
  WorldbookRow,
  MemoryRow,
  ModelPresetRow,
  ContextRunRow,
  BranchRow,
  Visibility,
} from "./database";

// Re-export database row types
export type {
  CharacterRow,
  SessionRow,
  MessageRow,
  MessageRevisionRow,
  PromptTemplateRow,
  WorldbookEntryRow,
  WorldbookRow,
  MemoryRow,
  ModelPresetRow,
  ContextRunRow,
  BranchRow,
  Visibility,
};

// Input types for create/update operations (omit server-generated fields)

export type CreateCharacter = Pick<CharacterRow, "name" | "card_json"> &
  Partial<
    Pick<
      CharacterRow,
      | "summary"
      | "slug"
      | "avatar_path"
      | "avatar_emoji"
      | "tags"
      | "visibility"
      | "is_favorite"
    >
  >;

export type UpdateCharacter = Partial<CreateCharacter> & {
  archived_at?: string | null;
  deleted_at?: string | null;
};

export type CreateSession = Pick<SessionRow, "title"> &
  Partial<
    Pick<
      SessionRow,
      | "mode"
      | "primary_character_id"
      | "current_scene"
      | "story_summary"
      | "system_prompt"
      | "visibility"
      | "tags"
    >
  >;

export type UpdateSession = Partial<CreateSession> & {
  status?: "active" | "archived" | "deleted";
  archived_at?: string | null;
  deleted_at?: string | null;
  last_message_at?: string | null;
};

export type CreateMessage = Pick<
  MessageRow,
  "session_id" | "branch_id" | "content_text" | "role"
> &
  Partial<
    Pick<
      MessageRow,
      | "character_id"
      | "sender_name"
      | "content_json"
      | "parent_id"
      | "edited_from_id"
      | "token_count"
      | "hidden"
    >
  >;

export type CreatePromptTemplate = Pick<PromptTemplateRow, "title" | "content"> &
  Partial<
    Pick<
      PromptTemplateRow,
      "category" | "description" | "tags" | "visibility" | "is_favorite"
    >
  >;

export type UpdatePromptTemplate = Partial<CreatePromptTemplate>;

export type CreateWorldbook = Pick<WorldbookRow, "name"> &
  Partial<Pick<WorldbookRow, "scope" | "description" | "tags" | "visibility">>;

export type CreateWorldbookEntry = Pick<
  WorldbookEntryRow,
  "worldbook_id" | "title" | "content"
> &
  Partial<
    Pick<
      WorldbookEntryRow,
      "category" | "triggers" | "priority" | "enabled" | "scope" | "token_estimate" | "extensions"
    >
  >;

export type UpdateWorldbookEntry = Partial<CreateWorldbookEntry>;

export type CreateMemory = Pick<MemoryRow, "content"> &
  Partial<
    Pick<
      MemoryRow,
      | "session_id"
      | "character_id"
      | "memory_type"
      | "title"
      | "source_message_id"
      | "salience"
      | "status"
    >
  >;

export type UpdateMemory = Partial<CreateMemory>;

export type CreateModelPreset = Pick<ModelPresetRow, "name"> &
  Partial<
    Pick<
      ModelPresetRow,
      | "provider"
      | "model"
      | "base_url"
      | "temperature"
      | "top_p"
      | "max_output_tokens"
      | "context_message_limit"
      | "visibility"
      | "is_default"
    >
  >;

export type UpdateModelPreset = Partial<CreateModelPreset>;

export type CreateContextRun = Pick<ContextRunRow, "session_id"> &
  Partial<
    Pick<
      ContextRunRow,
      | "message_id"
      | "provider"
      | "model"
      | "input_tokens"
      | "output_tokens"
      | "cache_hit_tokens"
      | "latency_ms"
      | "cost_usd"
      | "components_json"
      | "dropped_json"
      | "debug_enabled"
    >
  >;

export interface AppSettings {
  default_provider: string;
  default_model: string;
  max_context_tokens: number;
  demo_mode_enabled: boolean;
}
