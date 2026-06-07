import { logger } from "../../../shared/lib/logger";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  BackupArtifactRow,
  BranchRow,
  CharacterRevisionRow,
  CharacterRow,
  ContextRunRow,
  MemoryRow,
  MessageRevisionRow,
  MessageRow,
  PromptTemplateRow,
  SessionParticipantRow,
  SessionRow,
  WorldbookEntryRow,
  WorldbookRow,
} from "../types/database";
import type {
  BackupCounts,
  DataManagementStats,
  ImportMode,
  ImportPreview,
  ImportResult,
  RoleplayBackupFile,
  TrashEntityType,
  TrashListItem,
} from "../types/dataManagement";
import { BACKUP_APP_NAME, BACKUP_SCHEMA_VERSION } from "../types/dataManagement";

const EMPTY_COUNTS: BackupCounts = {
  characters: 0,
  character_revisions: 0,
  prompt_templates: 0,
  worldbooks: 0,
  worldbook_entries: 0,
  memories: 0,
  sessions: 0,
  branches: 0,
  session_participants: 0,
  messages: 0,
  message_revisions: 0,
  context_runs: 0,
};

type RootEntity = CharacterRow | PromptTemplateRow | WorldbookRow | MemoryRow | SessionRow;

interface ExistingMaps {
  characters: Map<string, string>;
  promptTemplates: Map<string, string>;
  worldbooks: Map<string, string>;
  memories: Map<string, string>;
  sessions: Map<string, string>;
}

interface ImportPlan {
  insertedIds: Record<string, string[]>;
  payloads: {
    characters: CharacterRow[];
    character_revisions: CharacterRevisionRow[];
    prompt_templates: PromptTemplateRow[];
    worldbooks: WorldbookRow[];
    worldbook_entries: WorldbookEntryRow[];
    memories: MemoryRow[];
    sessions: SessionRow[];
    branches: BranchRow[];
    session_participants: SessionParticipantRow[];
    messages: MessageRow[];
    message_revisions: MessageRevisionRow[];
    context_runs: ContextRunRow[];
  };
  imported: BackupCounts;
  skipped: BackupCounts;
}

type TableName =
  | "characters"
  | "character_revisions"
  | "prompt_templates"
  | "worldbooks"
  | "worldbook_entries"
  | "memories"
  | "sessions"
  | "branches"
  | "session_participants"
  | "messages"
  | "message_revisions"
  | "context_runs";

function cloneCounts(): BackupCounts {
  return { ...EMPTY_COUNTS };
}

function makeBackupCounts(data: RoleplayBackupFile["data"]): BackupCounts {
  return {
    characters: data.characters.length,
    character_revisions: data.character_revisions.length,
    prompt_templates: data.prompt_templates.length,
    worldbooks: data.worldbooks.length,
    worldbook_entries: data.worldbook_entries.length,
    memories: data.memories.length,
    sessions: data.sessions.length,
    branches: data.branches.length,
    session_participants: data.session_participants.length,
    messages: data.messages.length,
    message_revisions: data.message_revisions.length,
    context_runs: data.context_runs.length,
  };
}

function buildFileName(timestamp: Date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  const year = timestamp.getFullYear();
  const month = pad(timestamp.getMonth() + 1);
  const day = pad(timestamp.getDate());
  const hours = pad(timestamp.getHours());
  const minutes = pad(timestamp.getMinutes());
  return `roleplay-tavern-backup-${year}${month}${day}-${hours}${minutes}.json`;
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function previewText(value: string | null | undefined, fallback: string): string {
  const normalized = (value ?? "").replace(/\s+/g, " ").trim();
  if (!normalized) return fallback;
  return normalized.length > 64 ? `${normalized.slice(0, 64)}...` : normalized;
}

function createKey(prefix: string, row: RootEntity): string {
  switch (prefix) {
    case "character":
      return `${(row as CharacterRow).name}::${(row as CharacterRow).summary ?? ""}`.toLowerCase();
    case "template":
      return `${(row as PromptTemplateRow).title}::${(row as PromptTemplateRow).category ?? ""}`.toLowerCase();
    case "worldbook":
      return `${(row as WorldbookRow).name}::${(row as WorldbookRow).scope ?? ""}`.toLowerCase();
    case "memory":
      return `${(row as MemoryRow).memory_type}::${(row as MemoryRow).title ?? ""}::${(row as MemoryRow).content}`.toLowerCase();
    case "session":
      return `${(row as SessionRow).title}::${(row as SessionRow).mode}`.toLowerCase();
    default:
      return "";
  }
}

function createId(): string {
  return crypto.randomUUID();
}

async function countRows(
  supabase: SupabaseClient,
  table: string,
  apply: (query: any) => any,
): Promise<number> {
  const query = apply(supabase.from(table).select("*", { count: "exact", head: true }) as any);
  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}

async function selectRows<T>(
  supabase: SupabaseClient,
  table: string,
  apply: (query: any) => any,
): Promise<T[]> {
  const query = apply(supabase.from(table).select("*") as any);
  const { data, error } = await query;
  if (error) throw error;
  return (data as T[]) ?? [];
}

async function insertInChunks<T extends { id: string }>(
  supabase: SupabaseClient,
  table: TableName,
  rows: T[],
  chunkSize = 200,
): Promise<void> {
  for (let index = 0; index < rows.length; index += chunkSize) {
    const chunk = rows.slice(index, index + chunkSize);
    const { error } = await supabase.from(table).insert(chunk);
    if (error) throw error;
  }
}

async function deleteInChunks(
  supabase: SupabaseClient,
  table: TableName,
  ids: string[],
  chunkSize = 200,
): Promise<void> {
  for (let index = 0; index < ids.length; index += chunkSize) {
    const chunk = ids.slice(index, index + chunkSize);
    const { error } = await supabase.from(table).delete().in("id", chunk);
    if (error) throw error;
  }
}

async function sha256(text: string): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(hash))
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

async function loadExistingMaps(supabase: SupabaseClient, userId: string): Promise<ExistingMaps> {
  const [characters, promptTemplates, worldbooks, memories, sessions] = await Promise.all([
    selectRows<CharacterRow>(supabase, "characters", (query) => query.eq("user_id", userId).is("deleted_at", null)),
    selectRows<PromptTemplateRow>(supabase, "prompt_templates", (query) => query.eq("user_id", userId).is("deleted_at", null)),
    selectRows<WorldbookRow>(supabase, "worldbooks", (query) => query.eq("user_id", userId).is("deleted_at", null)),
    selectRows<MemoryRow>(supabase, "memories", (query) =>
      query.eq("user_id", userId).is("deleted_at", null).neq("status", "deleted"),
    ),
    selectRows<SessionRow>(supabase, "sessions", (query) => query.eq("user_id", userId).is("deleted_at", null).neq("status", "deleted")),
  ]);

  return {
    characters: new Map(characters.map((row) => [createKey("character", row), row.id])),
    promptTemplates: new Map(promptTemplates.map((row) => [createKey("template", row), row.id])),
    worldbooks: new Map(worldbooks.map((row) => [createKey("worldbook", row), row.id])),
    memories: new Map(memories.map((row) => [createKey("memory", row), row.id])),
    sessions: new Map(sessions.map((row) => [createKey("session", row), row.id])),
  };
}

function prepareImportPlan(payload: RoleplayBackupFile, userId: string, mode: ImportMode, existingMaps?: ExistingMaps): ImportPlan {
  const imported = cloneCounts();
  const skipped = cloneCounts();
  const insertedIds: Record<string, string[]> = {
    characters: [],
    character_revisions: [],
    prompt_templates: [],
    worldbooks: [],
    worldbook_entries: [],
    memories: [],
    sessions: [],
    branches: [],
    session_participants: [],
    messages: [],
    message_revisions: [],
    context_runs: [],
  };
  const characterMap = new Map<string, string>();
  const templateMap = new Map<string, string>();
  const worldbookMap = new Map<string, string>();
  const memoryMap = new Map<string, string>();
  const sessionMap = new Map<string, string>();
  const branchMap = new Map<string, string>();
  const messageMap = new Map<string, string>();
  const skippedCharacters = new Set<string>();
  const skippedWorldbooks = new Set<string>();
  const skippedSessions = new Set<string>();

  for (const character of payload.data.characters) {
    const existingId = mode === "skip_existing" ? existingMaps?.characters.get(createKey("character", character)) : undefined;
    if (existingId) {
      characterMap.set(character.id, existingId);
      skipped.characters += 1;
      skippedCharacters.add(character.id);
      continue;
    }
    const nextId = createId();
    characterMap.set(character.id, nextId);
    insertedIds.characters.push(nextId);
    imported.characters += 1;
  }

  for (const template of payload.data.prompt_templates) {
    const existingId =
      mode === "skip_existing" ? existingMaps?.promptTemplates.get(createKey("template", template)) : undefined;
    if (existingId) {
      templateMap.set(template.id, existingId);
      skipped.prompt_templates += 1;
      continue;
    }
    const nextId = createId();
    templateMap.set(template.id, nextId);
    insertedIds.prompt_templates.push(nextId);
    imported.prompt_templates += 1;
  }

  for (const worldbook of payload.data.worldbooks) {
    const existingId =
      mode === "skip_existing" ? existingMaps?.worldbooks.get(createKey("worldbook", worldbook)) : undefined;
    if (existingId) {
      worldbookMap.set(worldbook.id, existingId);
      skipped.worldbooks += 1;
      skippedWorldbooks.add(worldbook.id);
      continue;
    }
    const nextId = createId();
    worldbookMap.set(worldbook.id, nextId);
    insertedIds.worldbooks.push(nextId);
    imported.worldbooks += 1;
  }

  for (const memory of payload.data.memories) {
    const existingId = mode === "skip_existing" ? existingMaps?.memories.get(createKey("memory", memory)) : undefined;
    if (existingId) {
      memoryMap.set(memory.id, existingId);
      skipped.memories += 1;
      continue;
    }
    const nextId = createId();
    memoryMap.set(memory.id, nextId);
    insertedIds.memories.push(nextId);
    imported.memories += 1;
  }

  for (const session of payload.data.sessions) {
    const existingId = mode === "skip_existing" ? existingMaps?.sessions.get(createKey("session", session)) : undefined;
    if (existingId) {
      sessionMap.set(session.id, existingId);
      skipped.sessions += 1;
      skippedSessions.add(session.id);
      continue;
    }
    const nextId = createId();
    sessionMap.set(session.id, nextId);
    insertedIds.sessions.push(nextId);
    imported.sessions += 1;
  }

  for (const branch of payload.data.branches) {
    if (skippedSessions.has(branch.session_id) || !sessionMap.has(branch.session_id)) {
      skipped.branches += 1;
      continue;
    }
    const nextId = createId();
    branchMap.set(branch.id, nextId);
    insertedIds.branches.push(nextId);
    imported.branches += 1;
  }

  for (const message of payload.data.messages) {
    if (skippedSessions.has(message.session_id) || !sessionMap.has(message.session_id)) {
      skipped.messages += 1;
      continue;
    }
    const nextId = createId();
    messageMap.set(message.id, nextId);
    insertedIds.messages.push(nextId);
    imported.messages += 1;
  }

  const payloads: ImportPlan["payloads"] = {
    characters: payload.data.characters
      .filter((row) => !skippedCharacters.has(row.id))
      .map((row) => ({
        ...row,
        id: characterMap.get(row.id) ?? row.id,
        user_id: userId,
      })),
    character_revisions: payload.data.character_revisions
      .filter((row) => {
        if (!characterMap.has(row.character_id)) {
          skipped.character_revisions += 1;
          return false;
        }
        return !skippedCharacters.has(row.character_id);
      })
      .map((row) => {
        imported.character_revisions += 1;
        const nextId = createId();
        insertedIds.character_revisions.push(nextId);
        return {
          ...row,
          id: nextId,
          character_id: characterMap.get(row.character_id) ?? row.character_id,
          user_id: userId,
        };
      }),
    prompt_templates: payload.data.prompt_templates
      .filter((row) => insertedIds.prompt_templates.includes(templateMap.get(row.id) ?? ""))
      .map((row) => ({
        ...row,
        id: templateMap.get(row.id) ?? row.id,
        user_id: userId,
      })),
    worldbooks: payload.data.worldbooks
      .filter((row) => !skippedWorldbooks.has(row.id))
      .map((row) => ({
        ...row,
        id: worldbookMap.get(row.id) ?? row.id,
        user_id: userId,
      })),
    worldbook_entries: payload.data.worldbook_entries
      .filter((row) => {
        if (skippedWorldbooks.has(row.worldbook_id) || !worldbookMap.has(row.worldbook_id)) {
          skipped.worldbook_entries += 1;
          return false;
        }
        return true;
      })
      .map((row) => {
        imported.worldbook_entries += 1;
        const nextId = createId();
        insertedIds.worldbook_entries.push(nextId);
        return {
          ...row,
          id: nextId,
          worldbook_id: worldbookMap.get(row.worldbook_id) ?? row.worldbook_id,
          user_id: userId,
        };
      }),
    memories: payload.data.memories
      .filter((row) => insertedIds.memories.includes(memoryMap.get(row.id) ?? ""))
      .map((row) => ({
        ...row,
        id: memoryMap.get(row.id) ?? row.id,
        user_id: userId,
        character_id: row.character_id ? characterMap.get(row.character_id) ?? null : null,
      })),
    sessions: payload.data.sessions
      .filter((row) => !skippedSessions.has(row.id))
      .map((row) => ({
        ...row,
        id: sessionMap.get(row.id) ?? row.id,
        user_id: userId,
        primary_character_id: row.primary_character_id ? characterMap.get(row.primary_character_id) ?? null : null,
        active_branch_id: row.active_branch_id ? branchMap.get(row.active_branch_id) ?? null : null,
      })),
    branches: payload.data.branches
      .filter((row) => branchMap.has(row.id))
      .map((row) => ({
        ...row,
        id: branchMap.get(row.id) ?? row.id,
        session_id: sessionMap.get(row.session_id) ?? row.session_id,
        user_id: userId,
        parent_branch_id: row.parent_branch_id ? branchMap.get(row.parent_branch_id) ?? null : null,
        from_message_id: row.from_message_id ? messageMap.get(row.from_message_id) ?? null : null,
        forked_from_message_id: row.forked_from_message_id ? messageMap.get(row.forked_from_message_id) ?? null : null,
      })),
    session_participants: payload.data.session_participants
      .filter((row) => {
        if (skippedSessions.has(row.session_id) || !sessionMap.has(row.session_id)) {
          skipped.session_participants += 1;
          return false;
        }
        return true;
      })
      .map((row) => {
        imported.session_participants += 1;
        const nextId = createId();
        insertedIds.session_participants.push(nextId);
        return {
          ...row,
          id: nextId,
          session_id: sessionMap.get(row.session_id) ?? row.session_id,
          user_id: userId,
          character_id: row.character_id ? characterMap.get(row.character_id) ?? null : null,
        };
      }),
    messages: payload.data.messages
      .filter((row) => messageMap.has(row.id))
      .map((row) => ({
        ...row,
        id: messageMap.get(row.id) ?? row.id,
        user_id: userId,
        session_id: sessionMap.get(row.session_id) ?? row.session_id,
        branch_id: branchMap.get(row.branch_id) ?? branchMap.values().next().value ?? row.branch_id,
        character_id: row.character_id ? characterMap.get(row.character_id) ?? null : null,
        parent_id: row.parent_id ? messageMap.get(row.parent_id) ?? null : null,
        edited_from_id: row.edited_from_id ? messageMap.get(row.edited_from_id) ?? null : null,
        superseded_by_message_id: row.superseded_by_message_id
          ? messageMap.get(row.superseded_by_message_id) ?? null
          : null,
      })),
    message_revisions: payload.data.message_revisions
      .filter((row) => {
        if (!messageMap.has(row.message_id)) {
          skipped.message_revisions += 1;
          return false;
        }
        return true;
      })
      .map((row) => {
        imported.message_revisions += 1;
        const nextId = createId();
        insertedIds.message_revisions.push(nextId);
        return {
          ...row,
          id: nextId,
          user_id: userId,
          message_id: messageMap.get(row.message_id) ?? row.message_id,
        };
      }),
    context_runs: payload.data.context_runs
      .filter((row) => {
        if (skippedSessions.has(row.session_id) || !sessionMap.has(row.session_id)) {
          skipped.context_runs += 1;
          return false;
        }
        return true;
      })
      .map((row) => {
        imported.context_runs += 1;
        const nextId = createId();
        insertedIds.context_runs.push(nextId);
        return {
          ...row,
          id: nextId,
          user_id: userId,
          session_id: sessionMap.get(row.session_id) ?? row.session_id,
          branch_id: row.branch_id ? branchMap.get(row.branch_id) ?? null : null,
          message_id: row.message_id ? messageMap.get(row.message_id) ?? null : null,
          trigger_message_id: row.trigger_message_id ? messageMap.get(row.trigger_message_id) ?? null : null,
        };
      }),
  };

  return { insertedIds, payloads, imported, skipped };
}

async function rollbackImport(supabase: SupabaseClient, insertedIds: Record<string, string[]>): Promise<void> {
  const order: TableName[] = [
    "context_runs",
    "message_revisions",
    "messages",
    "session_participants",
    "branches",
    "sessions",
    "memories",
    "worldbook_entries",
    "worldbooks",
    "prompt_templates",
    "character_revisions",
    "characters",
  ];

  for (const table of order) {
    const ids = insertedIds[table];
    if (!ids || ids.length === 0) continue;
    await deleteInChunks(supabase, table, ids).catch((error) => {
      logger.warn(`[DataManagement] rollback failed for ${table}:`, error);
    });
  }
}

export async function loadDataManagementStats(supabase: SupabaseClient, userId: string): Promise<DataManagementStats> {
  const [
    characters,
    characterRevisions,
    promptTemplates,
    worldbooks,
    worldbookEntries,
    memories,
    sessions,
    branches,
    sessionParticipants,
    messages,
    messageRevisions,
    contextRuns,
    deletedSessions,
    deletedMessages,
    deletedCharacters,
    deletedTemplates,
    deletedWorldbooks,
    deletedEntries,
    deletedMemories,
    backupArtifacts,
  ] = await Promise.all([
    countRows(supabase, "characters", (query) => query.eq("user_id", userId)),
    countRows(supabase, "character_revisions", (query) => query.eq("user_id", userId)),
    countRows(supabase, "prompt_templates", (query) => query.eq("user_id", userId)),
    countRows(supabase, "worldbooks", (query) => query.eq("user_id", userId)),
    countRows(supabase, "worldbook_entries", (query) => query.eq("user_id", userId)),
    countRows(supabase, "memories", (query) => query.eq("user_id", userId)),
    countRows(supabase, "sessions", (query) => query.eq("user_id", userId)),
    countRows(supabase, "branches", (query) => query.eq("user_id", userId)),
    countRows(supabase, "session_participants", (query) => query.eq("user_id", userId)),
    countRows(supabase, "messages", (query) => query.eq("user_id", userId)),
    countRows(supabase, "message_revisions", (query) => query.eq("user_id", userId)),
    countRows(supabase, "context_runs", (query) => query.eq("user_id", userId)),
    countRows(supabase, "sessions", (query) => query.eq("user_id", userId).not("deleted_at", "is", null)),
    countRows(supabase, "messages", (query) => query.eq("user_id", userId).not("deleted_at", "is", null)),
    countRows(supabase, "characters", (query) => query.eq("user_id", userId).not("deleted_at", "is", null)),
    countRows(supabase, "prompt_templates", (query) => query.eq("user_id", userId).not("deleted_at", "is", null)),
    countRows(supabase, "worldbooks", (query) => query.eq("user_id", userId).not("deleted_at", "is", null)),
    countRows(supabase, "worldbook_entries", (query) => query.eq("user_id", userId).not("deleted_at", "is", null)),
    countRows(supabase, "memories", (query) => query.eq("user_id", userId).not("deleted_at", "is", null)),
    selectRows<BackupArtifactRow>(supabase, "backup_artifacts", (query) =>
      query.eq("user_id", userId).order("created_at", { ascending: false }).limit(5),
    ),
  ]);

  return {
    exportCounts: {
      characters,
      character_revisions: characterRevisions,
      prompt_templates: promptTemplates,
      worldbooks,
      worldbook_entries: worldbookEntries,
      memories,
      sessions,
      branches,
      session_participants: sessionParticipants,
      messages,
      message_revisions: messageRevisions,
      context_runs: contextRuns,
    },
    deletedCounts: {
      sessions: deletedSessions,
      messages: deletedMessages,
      characters: deletedCharacters,
      prompt_templates: deletedTemplates,
      worldbooks: deletedWorldbooks,
      worldbook_entries: deletedEntries,
      memories: deletedMemories,
    },
    backupArtifacts,
  };
}

export async function buildBackupFile(
  supabase: SupabaseClient,
  userId: string,
  includeContextRuns: boolean,
): Promise<{ payload: RoleplayBackupFile; fileName: string; jsonText: string; checksum: string }> {
  const [
    characters,
    characterRevisions,
    promptTemplates,
    worldbooks,
    worldbookEntries,
    memories,
    sessions,
    branches,
    sessionParticipants,
    messages,
    messageRevisions,
    contextRuns,
  ] = await Promise.all([
    selectRows<CharacterRow>(supabase, "characters", (query) => query.eq("user_id", userId).order("updated_at", { ascending: false })),
    selectRows<CharacterRevisionRow>(supabase, "character_revisions", (query) =>
      query.eq("user_id", userId).order("created_at", { ascending: true }),
    ),
    selectRows<PromptTemplateRow>(supabase, "prompt_templates", (query) =>
      query.eq("user_id", userId).order("updated_at", { ascending: false }),
    ),
    selectRows<WorldbookRow>(supabase, "worldbooks", (query) => query.eq("user_id", userId).order("updated_at", { ascending: false })),
    selectRows<WorldbookEntryRow>(supabase, "worldbook_entries", (query) =>
      query.eq("user_id", userId).order("priority", { ascending: false }),
    ),
    selectRows<MemoryRow>(supabase, "memories", (query) => query.eq("user_id", userId).order("updated_at", { ascending: false })),
    selectRows<SessionRow>(supabase, "sessions", (query) => query.eq("user_id", userId).order("updated_at", { ascending: false })),
    selectRows<BranchRow>(supabase, "branches", (query) => query.eq("user_id", userId).order("created_at", { ascending: true })),
    selectRows<SessionParticipantRow>(supabase, "session_participants", (query) =>
      query.eq("user_id", userId).order("created_at", { ascending: true }),
    ),
    selectRows<MessageRow>(supabase, "messages", (query) => query.eq("user_id", userId).order("created_at", { ascending: true })),
    selectRows<MessageRevisionRow>(supabase, "message_revisions", (query) =>
      query.eq("user_id", userId).order("edited_at", { ascending: true }),
    ),
    includeContextRuns
      ? selectRows<ContextRunRow>(supabase, "context_runs", (query) =>
          query.eq("user_id", userId).order("created_at", { ascending: true }),
        )
      : Promise.resolve([] as ContextRunRow[]),
  ]);

  const payload: RoleplayBackupFile = {
    schema_version: BACKUP_SCHEMA_VERSION,
    app_name: BACKUP_APP_NAME,
    exported_at: new Date().toISOString(),
    export_type: "full_user_backup",
    counts: cloneCounts(),
    data: {
      characters,
      character_revisions: characterRevisions,
      prompt_templates: promptTemplates,
      worldbooks,
      worldbook_entries: worldbookEntries,
      memories,
      sessions,
      branches,
      session_participants: sessionParticipants,
      messages,
      message_revisions: messageRevisions,
      context_runs: contextRuns,
    },
  };
  payload.counts = makeBackupCounts(payload.data);
  const jsonText = JSON.stringify(payload, null, 2);
  const checksum = await sha256(jsonText);
  return {
    payload,
    fileName: buildFileName(),
    jsonText,
    checksum,
  };
}

export async function recordBackupArtifact(
  supabase: SupabaseClient,
  userId: string,
  fileName: string,
  checksum: string,
  scope = "full_user_backup",
): Promise<void> {
  await supabase.from("backup_artifacts").insert({
    user_id: userId,
    scope,
    format: "json",
    storage_path: `local://${fileName}`,
    checksum,
    schema_version: BACKUP_SCHEMA_VERSION,
  });
}

export function downloadBackupFile(fileName: string, jsonText: string): void {
  const blob = new Blob([jsonText], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

export function parseBackupText(fileName: string, text: string): ImportPreview {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("备份文件不是有效的 JSON。");
  }

  if (!isObject(parsed)) {
    throw new Error("备份文件结构无效。");
  }

  const data = isObject(parsed.data) ? parsed.data : null;
  if (!data) {
    throw new Error("备份文件缺少 data 区块。");
  }

  if ("provider_credentials" in data || "provider_credential_secrets" in data) {
    throw new Error("备份文件包含托管 API 凭据数据。出于安全考虑，不支持导入 provider credentials。");
  }

  const payload: RoleplayBackupFile = {
    schema_version: typeof parsed.schema_version === "string" ? parsed.schema_version : "",
    app_name: typeof parsed.app_name === "string" ? parsed.app_name : "",
    exported_at: typeof parsed.exported_at === "string" ? parsed.exported_at : "",
    export_type: parsed.export_type === "full_user_backup" ? "full_user_backup" : "full_user_backup",
    counts: cloneCounts(),
    data: {
      characters: asArray<CharacterRow>(data.characters),
      character_revisions: asArray<CharacterRevisionRow>(data.character_revisions),
      prompt_templates: asArray<PromptTemplateRow>(data.prompt_templates),
      worldbooks: asArray<WorldbookRow>(data.worldbooks),
      worldbook_entries: asArray<WorldbookEntryRow>(data.worldbook_entries),
      memories: asArray<MemoryRow>(data.memories),
      sessions: asArray<SessionRow>(data.sessions),
      branches: asArray<BranchRow>(data.branches),
      session_participants: asArray<SessionParticipantRow>(data.session_participants),
      messages: asArray<MessageRow>(data.messages),
      message_revisions: asArray<MessageRevisionRow>(data.message_revisions),
      context_runs: asArray<ContextRunRow>(data.context_runs),
    },
  };

  if (!payload.schema_version || !payload.app_name) {
    throw new Error("备份文件缺少 schema_version 或 app_name。");
  }
  if (!payload.data.branches || !Array.isArray(payload.data.branches)) {
    throw new Error("备份文件缺少 branches 数据，无法安全恢复会话分支。");
  }

  payload.counts = makeBackupCounts(payload.data);

  return {
    fileName,
    schemaVersion: payload.schema_version,
    appName: payload.app_name,
    counts: payload.counts,
    includesContextRuns: payload.counts.context_runs > 0,
    payload,
  };
}

export async function importBackupFile(
  supabase: SupabaseClient,
  userId: string,
  payload: RoleplayBackupFile,
  mode: ImportMode,
): Promise<ImportResult> {
  const existingMaps = mode === "skip_existing" ? await loadExistingMaps(supabase, userId) : undefined;
  const plan = prepareImportPlan(payload, userId, mode, existingMaps);

  try {
    await insertInChunks(supabase, "characters", plan.payloads.characters);
    await insertInChunks(supabase, "character_revisions", plan.payloads.character_revisions);
    await insertInChunks(supabase, "prompt_templates", plan.payloads.prompt_templates);
    await insertInChunks(supabase, "worldbooks", plan.payloads.worldbooks);
    await insertInChunks(supabase, "worldbook_entries", plan.payloads.worldbook_entries);
    await insertInChunks(supabase, "memories", plan.payloads.memories);
    await insertInChunks(supabase, "sessions", plan.payloads.sessions);
    await insertInChunks(supabase, "branches", plan.payloads.branches);
    await insertInChunks(supabase, "session_participants", plan.payloads.session_participants);
    await insertInChunks(supabase, "messages", plan.payloads.messages);
    await insertInChunks(supabase, "message_revisions", plan.payloads.message_revisions);
    await insertInChunks(supabase, "context_runs", plan.payloads.context_runs);
  } catch (error) {
    await rollbackImport(supabase, plan.insertedIds);
    throw new Error(`导入失败，已停止并回滚本次新写入数据。${error instanceof Error ? error.message : String(error)}`);
  }

  return {
    imported: plan.imported,
    skipped: plan.skipped,
    includesContextRuns: payload.counts.context_runs > 0,
  };
}

export async function loadTrashItems(
  supabase: SupabaseClient,
  userId: string,
  filter: TrashEntityType,
): Promise<TrashListItem[]> {
  const tasks: Array<Promise<TrashListItem[]>> = [];

  if (filter === "all" || filter === "sessions") {
    tasks.push(
      selectRows<SessionRow>(supabase, "sessions", (query) =>
        query.eq("user_id", userId).not("deleted_at", "is", null).order("deleted_at", { ascending: false }),
      ).then((rows) =>
        rows.map((row) => ({
          entityType: "sessions" as const,
          entityId: row.id,
          title: row.title || "未命名会话",
          deletedAt: row.deleted_at ?? row.updated_at,
          description: `模式：${row.mode}`,
        })),
      ),
    );
  }

  if (filter === "all" || filter === "messages") {
    tasks.push(
      selectRows<MessageRow>(supabase, "messages", (query) =>
        query.eq("user_id", userId).not("deleted_at", "is", null).order("deleted_at", { ascending: false }),
      ).then((rows) =>
        rows.map((row) => ({
          entityType: "messages" as const,
          entityId: row.id,
          title: previewText(row.content_text, "消息"),
          deletedAt: row.deleted_at ?? row.created_at,
          description: `角色：${row.role}`,
        })),
      ),
    );
  }

  if (filter === "all" || filter === "characters") {
    tasks.push(
      selectRows<CharacterRow>(supabase, "characters", (query) =>
        query.eq("user_id", userId).not("deleted_at", "is", null).order("deleted_at", { ascending: false }),
      ).then((rows) =>
        rows.map((row) => ({
          entityType: "characters" as const,
          entityId: row.id,
          title: row.name,
          deletedAt: row.deleted_at ?? row.updated_at,
          description: previewText(row.summary, "角色卡"),
        })),
      ),
    );
  }

  if (filter === "all" || filter === "prompt_templates") {
    tasks.push(
      selectRows<PromptTemplateRow>(supabase, "prompt_templates", (query) =>
        query.eq("user_id", userId).not("deleted_at", "is", null).order("deleted_at", { ascending: false }),
      ).then((rows) =>
        rows.map((row) => ({
          entityType: "prompt_templates" as const,
          entityId: row.id,
          title: row.title,
          deletedAt: row.deleted_at ?? row.updated_at,
          description: row.category || "提示词模板",
        })),
      ),
    );
  }

  if (filter === "all" || filter === "worldbooks") {
    tasks.push(
      selectRows<WorldbookRow>(supabase, "worldbooks", (query) =>
        query.eq("user_id", userId).not("deleted_at", "is", null).order("deleted_at", { ascending: false }),
      ).then((rows) =>
        rows.map((row) => ({
          entityType: "worldbooks" as const,
          entityId: row.id,
          title: row.name,
          deletedAt: row.deleted_at ?? row.updated_at,
          description: previewText(row.description, "世界书"),
        })),
      ),
    );
  }

  if (filter === "all" || filter === "worldbook_entries") {
    tasks.push(
      selectRows<WorldbookEntryRow>(supabase, "worldbook_entries", (query) =>
        query.eq("user_id", userId).not("deleted_at", "is", null).order("deleted_at", { ascending: false }),
      ).then((rows) =>
        rows.map((row) => ({
          entityType: "worldbook_entries" as const,
          entityId: row.id,
          title: row.title,
          deletedAt: row.deleted_at ?? row.updated_at,
          description: previewText(row.content, "世界书条目"),
        })),
      ),
    );
  }

  if (filter === "all" || filter === "memories") {
    tasks.push(
      selectRows<MemoryRow>(supabase, "memories", (query) =>
        query.eq("user_id", userId).not("deleted_at", "is", null).order("deleted_at", { ascending: false }),
      ).then((rows) =>
        rows.map((row) => ({
          entityType: "memories" as const,
          entityId: row.id,
          title: row.title || "未命名记忆",
          deletedAt: row.deleted_at ?? row.updated_at,
          description: previewText(row.content, row.memory_type),
        })),
      ),
    );
  }

  const lists = await Promise.all(tasks);
  return lists.flat().sort((left, right) => right.deletedAt.localeCompare(left.deletedAt));
}

export async function restoreTrashItem(
  supabase: SupabaseClient,
  userId: string,
  item: TrashListItem,
  options?: { restoreWorldbookEntries?: boolean },
): Promise<void> {
  switch (item.entityType) {
    case "sessions": {
      const { error } = await supabase
        .from("sessions")
        .update({ status: "active", deleted_at: null, archived_at: null })
        .eq("id", item.entityId)
        .eq("user_id", userId);
      if (error) throw error;
      return;
    }
    case "messages": {
      const { error } = await supabase
        .from("messages")
        .update({ deleted_at: null, deleted_reason: null })
        .eq("id", item.entityId)
        .eq("user_id", userId);
      if (error) throw error;
      return;
    }
    case "characters": {
      const { error } = await supabase
        .from("characters")
        .update({ deleted_at: null })
        .eq("id", item.entityId)
        .eq("user_id", userId);
      if (error) throw error;
      return;
    }
    case "prompt_templates": {
      const { error } = await supabase
        .from("prompt_templates")
        .update({ deleted_at: null, deleted_reason: null })
        .eq("id", item.entityId)
        .eq("user_id", userId);
      if (error) throw error;
      return;
    }
    case "worldbooks": {
      const { error } = await supabase
        .from("worldbooks")
        .update({ deleted_at: null, deleted_reason: null })
        .eq("id", item.entityId)
        .eq("user_id", userId);
      if (error) throw error;
      if (options?.restoreWorldbookEntries) {
        const { error: entryError } = await supabase
          .from("worldbook_entries")
          .update({ deleted_at: null, deleted_reason: null })
          .eq("worldbook_id", item.entityId)
          .eq("user_id", userId);
        if (entryError) throw entryError;
      }
      return;
    }
    case "worldbook_entries": {
      const { error } = await supabase
        .from("worldbook_entries")
        .update({ deleted_at: null, deleted_reason: null })
        .eq("id", item.entityId)
        .eq("user_id", userId);
      if (error) throw error;
      return;
    }
    case "memories": {
      const { error } = await supabase
        .from("memories")
        .update({ status: "active", deleted_at: null, deleted_reason: null })
        .eq("id", item.entityId)
        .eq("user_id", userId);
      if (error) throw error;
      return;
    }
    default:
      throw new Error("不支持的回收站类型。");
  }
}
