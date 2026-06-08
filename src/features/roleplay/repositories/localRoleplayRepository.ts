import type {
  BranchRow,
  CharacterRow,
  ContextRunRow,
  MemoryRow,
  MessageRevisionRow,
  MessageRow,
  PromptTemplateRow,
  ProfileRow,
  SessionParticipantRow,
  SessionRow,
  WorldbookEntryRow,
  WorldbookRow,
} from "../types/database";
import type {
  CreateCharacter,
  CreateMemory,
  CreateMessage,
  CreatePromptTemplate,
  CreateSession,
  CreateWorldbookEntry,
  UpdateCharacter,
  UpdateMemory,
  UpdatePromptTemplate,
  UpdateSession,
  UpdateWorldbookEntry,
} from "../types/roleplay";

const LOCAL_DB_NAME = "roleplay-tavern-local";
const LOCAL_DB_VERSION = 1;
const LOCAL_USER_ID_KEY = "rp_tavern_local_user_id";
const LOCAL_PROFILE_ID = "local-profile";

type StoreName =
  | "profiles"
  | "characters"
  | "sessions"
  | "branches"
  | "session_participants"
  | "messages"
  | "message_revisions"
  | "prompt_templates"
  | "worldbooks"
  | "worldbook_entries"
  | "memories"
  | "context_runs";

const STORE_NAMES: StoreName[] = [
  "profiles",
  "characters",
  "sessions",
  "branches",
  "session_participants",
  "messages",
  "message_revisions",
  "prompt_templates",
  "worldbooks",
  "worldbook_entries",
  "memories",
  "context_runs",
];

function nowIso(): string {
  return new Date().toISOString();
}

function newId(): string {
  return crypto.randomUUID();
}

function compareDescByUpdatedAt<T extends { updated_at?: string; created_at?: string }>(a: T, b: T) {
  return String(b.updated_at ?? b.created_at ?? "").localeCompare(String(a.updated_at ?? a.created_at ?? ""));
}

function compareAscByCreatedAt<T extends { created_at?: string }>(a: T, b: T) {
  return String(a.created_at ?? "").localeCompare(String(b.created_at ?? ""));
}

function compareMessageDesc(a: MessageRow, b: MessageRow) {
  const time = b.created_at.localeCompare(a.created_at);
  if (time !== 0) return time;
  return b.id.localeCompare(a.id);
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(LOCAL_DB_NAME, LOCAL_DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      STORE_NAMES.forEach((store) => {
        if (!db.objectStoreNames.contains(store)) {
          db.createObjectStore(store, { keyPath: "id" });
        }
      });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("open local db failed"));
  });
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("indexeddb request failed"));
  });
}

async function getAll<T>(storeName: StoreName): Promise<T[]> {
  const db = await openDb();
  try {
    const tx = db.transaction(storeName, "readonly");
    const store = tx.objectStore(storeName);
    return ((await requestToPromise(store.getAll())) as T[]) ?? [];
  } finally {
    db.close();
  }
}

async function getById<T>(storeName: StoreName, id: string): Promise<T | null> {
  const db = await openDb();
  try {
    const tx = db.transaction(storeName, "readonly");
    const store = tx.objectStore(storeName);
    return ((await requestToPromise(store.get(id))) as T | undefined) ?? null;
  } finally {
    db.close();
  }
}

async function putRow<T extends { id: string }>(storeName: StoreName, row: T): Promise<T> {
  const db = await openDb();
  try {
    const tx = db.transaction(storeName, "readwrite");
    const store = tx.objectStore(storeName);
    await requestToPromise(store.put(row));
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("indexeddb transaction failed"));
      tx.onabort = () => reject(tx.error ?? new Error("indexeddb transaction aborted"));
    });
    return row;
  } finally {
    db.close();
  }
}

async function putRows<T extends { id: string }>(storeName: StoreName, rows: T[]): Promise<void> {
  const db = await openDb();
  try {
    const tx = db.transaction(storeName, "readwrite");
    const store = tx.objectStore(storeName);
    for (const row of rows) {
      store.put(row);
    }
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("indexeddb transaction failed"));
      tx.onabort = () => reject(tx.error ?? new Error("indexeddb transaction aborted"));
    });
  } finally {
    db.close();
  }
}

export function getLocalUserId(): string {
  const existing = localStorage.getItem(LOCAL_USER_ID_KEY);
  if (existing) return existing;
  const created = `local-${newId()}`;
  localStorage.setItem(LOCAL_USER_ID_KEY, created);
  return created;
}

export async function ensureLocalProfile(): Promise<ProfileRow> {
  const existing = await getById<ProfileRow>("profiles", LOCAL_PROFILE_ID);
  if (existing) return existing;

  const createdAt = nowIso();
  const profile: ProfileRow = {
    id: LOCAL_PROFILE_ID,
    handle: "local-user",
    display_name: "本地用户",
    avatar_path: null,
    default_mode: "local_first",
    created_at: createdAt,
    updated_at: createdAt,
  };
  await putRow("profiles", profile);
  return profile;
}

export async function listActiveCharacters(): Promise<CharacterRow[]> {
  const rows = await getAll<CharacterRow>("characters");
  return rows
    .filter((row) => !row.deleted_at && !row.archived_at)
    .sort(compareDescByUpdatedAt);
}

export async function listCharactersByIds(characterIds: string[]): Promise<CharacterRow[]> {
  if (characterIds.length === 0) return [];
  const rows = await getAll<CharacterRow>("characters");
  return rows.filter((row) => characterIds.includes(row.id));
}

export async function getCharacter(characterId: string): Promise<CharacterRow | null> {
  return getById<CharacterRow>("characters", characterId);
}

export async function createCharacter(input: CreateCharacter): Promise<CharacterRow> {
  await ensureLocalProfile();
  const timestamp = nowIso();
  const row: CharacterRow = {
    id: newId(),
    user_id: getLocalUserId(),
    name: input.name,
    slug: input.slug ?? null,
    summary: input.summary ?? null,
    card_json: input.card_json,
    avatar_path: input.avatar_path ?? null,
    avatar_emoji: input.avatar_emoji ?? null,
    tags: input.tags ?? [],
    visibility: input.visibility ?? "private",
    is_favorite: input.is_favorite ?? false,
    archived_at: null,
    deleted_at: null,
    created_at: timestamp,
    updated_at: timestamp,
  };
  return putRow("characters", row);
}

export async function updateCharacter(characterId: string, input: UpdateCharacter): Promise<CharacterRow | null> {
  const existing = await getCharacter(characterId);
  if (!existing) return null;
  const row: CharacterRow = {
    ...existing,
    ...input,
    updated_at: nowIso(),
  };
  return putRow("characters", row);
}

export async function archiveCharacter(characterId: string): Promise<void> {
  const existing = await getCharacter(characterId);
  if (!existing) return;
  await putRow("characters", { ...existing, archived_at: nowIso(), updated_at: nowIso() });
}

export async function deleteCharacter(characterId: string): Promise<void> {
  const existing = await getCharacter(characterId);
  if (!existing) return;
  await putRow("characters", { ...existing, deleted_at: nowIso(), updated_at: nowIso() });
}

export async function listPromptTemplates(): Promise<PromptTemplateRow[]> {
  const rows = await getAll<PromptTemplateRow>("prompt_templates");
  return rows.filter((row) => !row.deleted_at).sort(compareDescByUpdatedAt);
}

export async function getPromptTemplate(templateId: string): Promise<PromptTemplateRow | null> {
  return getById<PromptTemplateRow>("prompt_templates", templateId);
}

export async function createPromptTemplate(input: CreatePromptTemplate): Promise<PromptTemplateRow> {
  const timestamp = nowIso();
  const row: PromptTemplateRow = {
    id: newId(),
    user_id: getLocalUserId(),
    title: input.title,
    category: input.category ?? "general",
    content: input.content,
    description: input.description ?? null,
    tags: input.tags ?? [],
    visibility: input.visibility ?? "private",
    is_favorite: input.is_favorite ?? false,
    deleted_at: null,
    deleted_reason: null,
    created_at: timestamp,
    updated_at: timestamp,
  };
  return putRow("prompt_templates", row);
}

export async function updatePromptTemplate(templateId: string, input: UpdatePromptTemplate): Promise<PromptTemplateRow | null> {
  const existing = await getPromptTemplate(templateId);
  if (!existing) return null;
  return putRow("prompt_templates", {
    ...existing,
    ...input,
    updated_at: nowIso(),
  });
}

export async function deletePromptTemplate(templateId: string): Promise<void> {
  const existing = await getPromptTemplate(templateId);
  if (!existing) return;
  await putRow("prompt_templates", {
    ...existing,
    deleted_at: nowIso(),
    deleted_reason: "user_deleted",
    updated_at: nowIso(),
  });
}

export async function listWorldbooks(): Promise<WorldbookRow[]> {
  const rows = await getAll<WorldbookRow>("worldbooks");
  return rows.filter((row) => !row.deleted_at).sort(compareDescByUpdatedAt);
}

export async function getWorldbook(worldbookId: string): Promise<WorldbookRow | null> {
  return getById<WorldbookRow>("worldbooks", worldbookId);
}

export async function createWorldbook(input: { name: string; description?: string; tags?: string[] }): Promise<WorldbookRow> {
  const timestamp = nowIso();
  const row: WorldbookRow = {
    id: newId(),
    user_id: getLocalUserId(),
    name: input.name,
    scope: "session",
    description: input.description ?? null,
    tags: input.tags ?? [],
    visibility: "private",
    deleted_at: null,
    deleted_reason: null,
    created_at: timestamp,
    updated_at: timestamp,
  };
  return putRow("worldbooks", row);
}

export async function updateWorldbook(worldbookId: string, input: { name?: string; description?: string; tags?: string[] }): Promise<WorldbookRow | null> {
  const existing = await getWorldbook(worldbookId);
  if (!existing) return null;
  return putRow("worldbooks", {
    ...existing,
    ...input,
    updated_at: nowIso(),
  });
}

export async function listWorldbookEntries(worldbookId: string): Promise<WorldbookEntryRow[]> {
  const rows = await getAll<WorldbookEntryRow>("worldbook_entries");
  return rows
    .filter((row) => row.worldbook_id === worldbookId && !row.deleted_at)
    .sort((a, b) => b.priority - a.priority || compareAscByCreatedAt(a, b));
}

export async function listAllWorldbookEntries(): Promise<WorldbookEntryRow[]> {
  const rows = await getAll<WorldbookEntryRow>("worldbook_entries");
  return rows.filter((row) => !row.deleted_at).sort((a, b) => b.priority - a.priority || compareAscByCreatedAt(a, b));
}

export async function getWorldbookEntry(entryId: string): Promise<WorldbookEntryRow | null> {
  return getById<WorldbookEntryRow>("worldbook_entries", entryId);
}

export async function createWorldbookEntry(input: CreateWorldbookEntry): Promise<WorldbookEntryRow> {
  const timestamp = nowIso();
  const row: WorldbookEntryRow = {
    id: newId(),
    worldbook_id: input.worldbook_id,
    user_id: getLocalUserId(),
    title: input.title,
    category: input.category ?? "general",
    content: input.content,
    triggers: input.triggers ?? [],
    priority: input.priority ?? 100,
    enabled: input.enabled ?? true,
    scope: input.scope ?? "global",
    token_estimate: input.token_estimate ?? null,
    last_triggered_at: null,
    trigger_count: 0,
    extensions: input.extensions ?? {},
    deleted_at: null,
    deleted_reason: null,
    created_at: timestamp,
    updated_at: timestamp,
  };
  return putRow("worldbook_entries", row);
}

export async function updateWorldbookEntry(entryId: string, input: UpdateWorldbookEntry): Promise<WorldbookEntryRow | null> {
  const existing = await getWorldbookEntry(entryId);
  if (!existing) return null;
  return putRow("worldbook_entries", {
    ...existing,
    ...input,
    updated_at: nowIso(),
  });
}

export async function deleteWorldbookEntry(entryId: string): Promise<void> {
  const existing = await getWorldbookEntry(entryId);
  if (!existing) return;
  await putRow("worldbook_entries", {
    ...existing,
    deleted_at: nowIso(),
    deleted_reason: "user_deleted",
    updated_at: nowIso(),
  });
}

export async function deleteWorldbook(worldbookId: string): Promise<void> {
  const existing = await getWorldbook(worldbookId);
  if (!existing) return;
  const entries = await listWorldbookEntries(worldbookId);
  const timestamp = nowIso();
  await putRows(
    "worldbook_entries",
    entries.map((entry) => ({
      ...entry,
      deleted_at: timestamp,
      deleted_reason: "worldbook_deleted",
      updated_at: timestamp,
    })),
  );
  await putRow("worldbooks", {
    ...existing,
    deleted_at: timestamp,
    deleted_reason: "user_deleted",
    updated_at: timestamp,
  });
}

export async function listMemories(sessionId?: string): Promise<MemoryRow[]> {
  const rows = await getAll<MemoryRow>("memories");
  return rows
    .filter((row) => !row.deleted_at && row.status !== "deleted" && (!sessionId || row.session_id === sessionId))
    .sort(compareDescByUpdatedAt);
}

export async function listAllActiveMemories(): Promise<MemoryRow[]> {
  const rows = await getAll<MemoryRow>("memories");
  return rows
    .filter((row) => !row.deleted_at && row.status === "active")
    .sort((a, b) => b.salience - a.salience || compareDescByUpdatedAt(a, b));
}

export async function listMemoriesByStatus(
  statuses: MemoryRow["status"][],
  sessionId?: string,
): Promise<MemoryRow[]> {
  if (statuses.length === 0) return [];
  const rows = await getAll<MemoryRow>("memories");
  return rows
    .filter((row) => !row.deleted_at && statuses.includes(row.status) && (!sessionId || row.session_id === sessionId))
    .sort(compareDescByUpdatedAt);
}

export async function getMemory(memoryId: string): Promise<MemoryRow | null> {
  return getById<MemoryRow>("memories", memoryId);
}

export async function createMemory(input: CreateMemory): Promise<MemoryRow> {
  const timestamp = nowIso();
  const row: MemoryRow = {
    id: newId(),
    user_id: getLocalUserId(),
    session_id: input.session_id ?? null,
    character_id: input.character_id ?? null,
    memory_type: input.memory_type ?? "event",
    title: input.title ?? null,
    content: input.content,
    source_message_id: input.source_message_id ?? null,
    salience: input.salience ?? 50,
    status: input.status ?? "active",
    last_used_at: null,
    deleted_at: null,
    deleted_reason: null,
    created_at: timestamp,
    updated_at: timestamp,
  };
  return putRow("memories", row);
}

export async function updateMemory(memoryId: string, input: UpdateMemory): Promise<MemoryRow | null> {
  const existing = await getMemory(memoryId);
  if (!existing) return null;
  return putRow("memories", {
    ...existing,
    ...input,
    updated_at: nowIso(),
  });
}

export async function deleteMemory(memoryId: string): Promise<void> {
  const existing = await getMemory(memoryId);
  if (!existing) return;
  await putRow("memories", {
    ...existing,
    status: "deleted",
    deleted_at: nowIso(),
    deleted_reason: "user_deleted",
    updated_at: nowIso(),
  });
}

export async function listSessions(): Promise<SessionRow[]> {
  const rows = await getAll<SessionRow>("sessions");
  return rows
    .filter((row) => row.status === "active" && !row.deleted_at)
    .sort((a, b) => String(b.updated_at ?? b.created_at).localeCompare(String(a.updated_at ?? a.created_at)));
}

export async function getSession(sessionId: string): Promise<SessionRow | null> {
  return getById<SessionRow>("sessions", sessionId);
}

export async function createSession(input: CreateSession): Promise<SessionRow> {
  const timestamp = nowIso();
  const row: SessionRow = {
    id: newId(),
    user_id: getLocalUserId(),
    title: input.title,
    mode: input.mode ?? "single",
    status: "active",
    provider: null,
    model: null,
    active_branch_id: null,
    primary_character_id: input.primary_character_id ?? null,
    current_scene: input.current_scene ?? null,
    story_summary: input.story_summary ?? null,
    system_prompt: input.system_prompt ?? null,
    style_rules: null,
    tags: input.tags ?? [],
    visibility: input.visibility ?? "private",
    last_message_at: null,
    archived_at: null,
    deleted_at: null,
    created_at: timestamp,
    updated_at: timestamp,
  };
  return putRow("sessions", row);
}

export async function updateSession(
  sessionId: string,
  input: UpdateSession & Partial<Pick<SessionRow, "active_branch_id">>,
): Promise<SessionRow | null> {
  const existing = await getSession(sessionId);
  if (!existing) return null;
  return putRow("sessions", {
    ...existing,
    ...input,
    updated_at: nowIso(),
  });
}

export async function deleteSession(sessionId: string): Promise<void> {
  const existing = await getSession(sessionId);
  if (!existing) return;
  await putRow("sessions", {
    ...existing,
    status: "deleted",
    deleted_at: nowIso(),
    updated_at: nowIso(),
  });
}

export async function listSessionParticipants(sessionId: string): Promise<SessionParticipantRow[]> {
  const rows = await getAll<SessionParticipantRow>("session_participants");
  return rows.filter((row) => row.session_id === sessionId).sort((a, b) => a.sort_order - b.sort_order);
}

export async function listSessionParticipantsForSessions(sessionIds: string[]): Promise<SessionParticipantRow[]> {
  if (sessionIds.length === 0) return [];
  const rows = await getAll<SessionParticipantRow>("session_participants");
  return rows.filter((row) => sessionIds.includes(row.session_id));
}

export async function ensureSessionParticipant(sessionId: string, characterId: string): Promise<SessionParticipantRow> {
  const existing = (await listSessionParticipants(sessionId)).find(
    (row) => row.participant_type === "character" && row.character_id === characterId,
  );
  if (existing) return existing;

  const row: SessionParticipantRow = {
    id: newId(),
    session_id: sessionId,
    user_id: getLocalUserId(),
    participant_type: "character",
    character_id: characterId,
    sort_order: 0,
    speaking_mode: "normal",
    is_active: true,
    created_at: nowIso(),
  };
  return putRow("session_participants", row);
}

export async function listBranches(sessionId: string): Promise<BranchRow[]> {
  const rows = await getAll<BranchRow>("branches");
  return rows.filter((row) => row.session_id === sessionId && row.status === "active").sort(compareAscByCreatedAt);
}

export async function createBranch(input: {
  session_id: string;
  name: string;
  title?: string;
  parent_branch_id?: string;
  forked_from_message_id?: string;
}): Promise<BranchRow> {
  const timestamp = nowIso();
  const row: BranchRow = {
    id: newId(),
    session_id: input.session_id,
    user_id: getLocalUserId(),
    name: input.name,
    title: input.title ?? input.name,
    parent_branch_id: input.parent_branch_id ?? null,
    from_message_id: null,
    forked_from_message_id: input.forked_from_message_id ?? null,
    status: "active",
    created_at: timestamp,
    updated_at: timestamp,
  };
  return putRow("branches", row);
}

export async function ensureDefaultBranch(sessionId: string): Promise<BranchRow> {
  const session = await getSession(sessionId);
  if (session?.active_branch_id) {
    const branch = await getById<BranchRow>("branches", session.active_branch_id);
    if (branch) return branch;
  }

  const existing = await listBranches(sessionId);
  if (existing.length > 0) {
    await updateSession(sessionId, { active_branch_id: existing[0].id });
    return existing[0];
  }

  const created = await createBranch({
    session_id: sessionId,
    name: "main",
    title: "主线",
  });
  await updateSession(sessionId, { active_branch_id: created.id });
  return created;
}

export async function setActiveBranch(sessionId: string, branchId: string): Promise<void> {
  await updateSession(sessionId, { active_branch_id: branchId });
}

export interface MessagePageCursor {
  createdAt: string;
  id: string;
}

export interface MessagePageResult {
  rows: MessageRow[];
  hasMore: boolean;
}

function filterMainlineMessages(rows: MessageRow[], sessionId: string, branchId?: string | null) {
  return rows.filter(
    (row) =>
      row.session_id === sessionId &&
      (!branchId || row.branch_id === branchId) &&
      !row.deleted_at &&
      !row.hidden &&
      !row.superseded_by_message_id,
  );
}

export async function listMessages(sessionId: string, branchId?: string | null): Promise<MessageRow[]> {
  const rows = await getAll<MessageRow>("messages");
  return filterMainlineMessages(rows, sessionId, branchId).sort(compareAscByCreatedAt);
}

export async function getMessage(messageId: string): Promise<MessageRow | null> {
  return getById<MessageRow>("messages", messageId);
}

export async function listMessagesPage(
  sessionId: string,
  branchId: string | null | undefined,
  limit: number,
  before?: MessagePageCursor | null,
): Promise<MessagePageResult> {
  const rows = (await listMessages(sessionId, branchId)).sort(compareMessageDesc);
  const filtered = before
    ? rows.filter(
        (row) =>
          row.created_at < before.createdAt ||
          (row.created_at === before.createdAt && row.id < before.id),
      )
    : rows;
  const pageRows = filtered.slice(0, limit + 1);
  const hasMore = pageRows.length > limit;
  return {
    rows: (hasMore ? pageRows.slice(0, limit) : pageRows).reverse(),
    hasMore,
  };
}

export async function listRecentMessagesForContext(
  sessionId: string,
  branchId: string | null | undefined,
  limit: number,
): Promise<MessageRow[]> {
  const page = await listMessagesPage(sessionId, branchId, limit);
  return page.rows;
}

export async function createMessage(input: CreateMessage): Promise<MessageRow> {
  const timestamp = nowIso();
  const row: MessageRow = {
    id: newId(),
    user_id: getLocalUserId(),
    session_id: input.session_id,
    branch_id: input.branch_id,
    character_id: input.character_id ?? null,
    role: input.role,
    sender_name: input.sender_name ?? null,
    content_text: input.content_text,
    content_json: input.content_json ?? {},
    parent_id: input.parent_id ?? null,
    edited_from_id: input.edited_from_id ?? null,
    token_count: input.token_count ?? null,
    hidden: input.hidden ?? false,
    deleted_at: null,
    deleted_reason: null,
    edited_at: null,
    revision_no: 1,
    superseded_by_message_id: null,
    created_at: timestamp,
  };
  return putRow("messages", row);
}

export async function updateMessage(
  messageId: string,
  input: { content_text?: string; edited_at?: string; revision_no?: number },
): Promise<MessageRow | null> {
  const existing = await getById<MessageRow>("messages", messageId);
  if (!existing) return null;
  return putRow("messages", {
    ...existing,
    ...input,
  });
}

export async function deleteMessage(messageId: string, reason?: string): Promise<void> {
  const existing = await getById<MessageRow>("messages", messageId);
  if (!existing) return;
  await putRow("messages", {
    ...existing,
    deleted_at: nowIso(),
    deleted_reason: reason ?? null,
  });
}

export async function supersedeMessages(messageIds: string[], supersededBy: string): Promise<void> {
  if (messageIds.length === 0) return;
  const rows = await getAll<MessageRow>("messages");
  const next = rows.map((row) => (
    messageIds.includes(row.id)
      ? { ...row, superseded_by_message_id: supersededBy }
      : row
  ));
  await putRows("messages", next);
}

export async function createMessageRevision(input: {
  message_id: string;
  revision_no: number;
  content_text: string;
}): Promise<MessageRevisionRow> {
  const row: MessageRevisionRow = {
    id: newId(),
    message_id: input.message_id,
    user_id: getLocalUserId(),
    revision_no: input.revision_no,
    content_text: input.content_text,
    edited_at: nowIso(),
  };
  return putRow("message_revisions", row);
}

export async function loadMessageRevisions(messageId: string): Promise<MessageRevisionRow[]> {
  const rows = await getAll<MessageRevisionRow>("message_revisions");
  return rows
    .filter((row) => row.message_id === messageId)
    .sort((a, b) => a.revision_no - b.revision_no);
}

export async function getMessageRevisionCounts(messageIds: string[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (messageIds.length === 0) return counts;
  const rows = await getAll<MessageRevisionRow>("message_revisions");
  rows.forEach((row) => {
    if (!messageIds.includes(row.message_id)) return;
    counts.set(row.message_id, (counts.get(row.message_id) ?? 0) + 1);
  });
  return counts;
}

export async function saveContextRun(input: {
  session_id: string;
  branch_id?: string | null;
  message_id?: string | null;
  trigger_message_id?: string | null;
  provider?: string | null;
  model?: string | null;
  system_prompt?: string | null;
  provider_messages_json?: unknown;
  worldbook_hits_json?: unknown;
  skipped_entries_json?: unknown;
  injected_memories_json?: unknown;
  summary_text?: string | null;
  token_budget?: number | null;
  estimated_tokens?: number | null;
  debug_enabled?: boolean;
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_hit_tokens?: number | null;
  cost_usd?: number | null;
  components_json?: unknown;
  dropped_json?: unknown;
}): Promise<ContextRunRow> {
  const row: ContextRunRow = {
    id: newId(),
    user_id: getLocalUserId(),
    session_id: input.session_id,
    branch_id: input.branch_id ?? null,
    message_id: input.message_id ?? null,
    trigger_message_id: input.trigger_message_id ?? null,
    provider: input.provider ?? null,
    model: input.model ?? null,
    input_tokens: input.input_tokens ?? null,
    output_tokens: input.output_tokens ?? null,
    cache_hit_tokens: input.cache_hit_tokens ?? null,
    latency_ms: null,
    cost_usd: input.cost_usd ?? null,
    components_json: Array.isArray(input.components_json) ? input.components_json : input.components_json ? [input.components_json] : [],
    dropped_json: Array.isArray(input.dropped_json) ? input.dropped_json : input.dropped_json ? [input.dropped_json] : [],
    system_prompt: input.system_prompt ?? null,
    provider_messages_json: input.provider_messages_json ?? null,
    worldbook_hits_json: input.worldbook_hits_json ?? null,
    skipped_entries_json: input.skipped_entries_json ?? null,
    injected_memories_json: input.injected_memories_json ?? null,
    summary_text: input.summary_text ?? null,
    token_budget: input.token_budget ?? null,
    estimated_tokens: input.estimated_tokens ?? null,
    debug_enabled: input.debug_enabled ?? false,
    created_at: nowIso(),
  };
  return putRow("context_runs", row);
}

export async function listContextRuns(sessionId?: string): Promise<ContextRunRow[]> {
  const rows = await getAll<ContextRunRow>("context_runs");
  return rows
    .filter((row) => !sessionId || row.session_id === sessionId)
    .sort((a, b) => String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")));
}

export async function listRecentContextRuns(
  sessionId: string,
  limit = 20,
): Promise<ContextRunRow[]> {
  const rows = await listContextRuns(sessionId);
  return rows.slice(0, limit);
}
