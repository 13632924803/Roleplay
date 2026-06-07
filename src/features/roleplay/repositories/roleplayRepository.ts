import { logger } from "../../../shared/lib/logger";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ProfileRow,
  CharacterRow,
  SessionRow,
  BranchRow,
  MessageRow,
  MessageRevisionRow,
  PromptTemplateRow,
  WorldbookRow,
  WorldbookEntryRow,
  MemoryRow,
  ModelPresetRow,
  ContextRunRow,
} from "../types/database";
import type {
  CreateCharacter,
  UpdateCharacter,
  CreateSession,
  UpdateSession,
  CreateMessage,
  CreatePromptTemplate,
  UpdatePromptTemplate,
  CreateWorldbookEntry,
  UpdateWorldbookEntry,
  CreateMemory,
  UpdateMemory,
  CreateModelPreset,
  UpdateModelPreset,
  AppSettings,
} from "../types/roleplay";

// ============================================================
//  Repository 层 — 所有 Supabase 数据访问必须经过此层
//  组件禁止直接使用 supabase.from() 查询数据库
// ============================================================

// ---------- profiles ----------

export async function getCurrentProfile(
  supabase: SupabaseClient,
  userId: string,
): Promise<ProfileRow | null> {
  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .maybeSingle();
    if (error) {
      logger.warn("[Repo] getCurrentProfile error:", error.message);
      return null;
    }
    return data as ProfileRow | null;
  } catch (err) {
    logger.warn("[Repo] getCurrentProfile exception:", err);
    return null;
  }
}

export async function ensureProfile(
  supabase: SupabaseClient,
  userId: string,
  overrides?: Partial<Pick<ProfileRow, "handle" | "display_name">>,
): Promise<ProfileRow | null> {
  try {
    const existing = await getCurrentProfile(supabase, userId);
    if (existing) return existing;

    const { data, error } = await supabase
      .from("profiles")
      .insert({
        id: userId,
        display_name: overrides?.display_name ?? null,
        handle: overrides?.handle ?? null,
      })
      .select()
      .maybeSingle();

    if (error) {
      logger.warn("[Repo] ensureProfile insert error:", error.message);
      return null;
    }
    return data as ProfileRow | null;
  } catch (err) {
    logger.warn("[Repo] ensureProfile exception:", err);
    return null;
  }
}

export async function ensureUserRole(
  supabase: SupabaseClient,
  userId: string,
  role: string = "user",
): Promise<boolean> {
  try {
    // Check if user already has this role
    const { data: existing } = await supabase
      .from("user_roles")
      .select("id")
      .eq("user_id", userId)
      .eq("role", role)
      .maybeSingle();

    if (existing) return true;

    const { error } = await supabase
      .from("user_roles")
      .insert({ user_id: userId, role });

    if (error) {
      logger.warn("[Repo] ensureUserRole insert error:", error.message);
      return false;
    }
    return true;
  } catch (err) {
    logger.warn("[Repo] ensureUserRole exception:", err);
    return false;
  }
}

export async function updateProfile(
  supabase: SupabaseClient,
  userId: string,
  updates: Partial<Pick<ProfileRow, "handle" | "display_name" | "avatar_path">>,
): Promise<ProfileRow | null> {
  try {
    const { data, error } = await supabase
      .from("profiles")
      .update(updates)
      .eq("id", userId)
      .select()
      .maybeSingle();
    if (error) return null;
    return data as ProfileRow | null;
  } catch {
    return null;
  }
}

// ---------- characters ----------

export async function listCharacters(
  supabase: SupabaseClient,
  userId: string,
): Promise<CharacterRow[]> {
  const { data } = await supabase
    .from("characters")
    .select("*")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .order("updated_at", { ascending: false });
  return (data as CharacterRow[]) ?? [];
}

export async function listActiveCharacters(
  supabase: SupabaseClient,
  userId: string,
): Promise<CharacterRow[]> {
  const { data } = await supabase
    .from("characters")
    .select("*")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .is("archived_at", null)
    .order("updated_at", { ascending: false });
  return (data as CharacterRow[]) ?? [];
}

export async function listCharactersByIds(
  supabase: SupabaseClient,
  characterIds: string[],
): Promise<CharacterRow[]> {
  if (characterIds.length === 0) return [];
  const { data } = await supabase
    .from("characters")
    .select("*")
    .in("id", characterIds);
  return (data as CharacterRow[]) ?? [];
}

export async function getCharacter(
  supabase: SupabaseClient,
  characterId: string,
): Promise<CharacterRow | null> {
  const { data } = await supabase
    .from("characters")
    .select("*")
    .eq("id", characterId)
    .single();
  return data as CharacterRow | null;
}

export async function createCharacter(
  supabase: SupabaseClient,
  userId: string,
  input: CreateCharacter,
): Promise<CharacterRow | null> {
  const { data } = await supabase
    .from("characters")
    .insert({ ...input, user_id: userId })
    .select()
    .single();
  return data as CharacterRow | null;
}

export async function updateCharacter(
  supabase: SupabaseClient,
  characterId: string,
  userId: string,
  input: UpdateCharacter,
): Promise<CharacterRow | null> {
  const { data } = await supabase
    .from("characters")
    .update(input)
    .eq("id", characterId)
    .eq("user_id", userId)
    .select()
    .single();
  return data as CharacterRow | null;
}

export async function archiveCharacter(
  supabase: SupabaseClient,
  characterId: string,
  userId: string,
): Promise<void> {
  await supabase
    .from("characters")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", characterId)
    .eq("user_id", userId);
}

export async function deleteCharacter(
  supabase: SupabaseClient,
  characterId: string,
  userId: string,
): Promise<void> {
  await supabase
    .from("characters")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", characterId)
    .eq("user_id", userId);
}

// ---------- sessions ----------

export async function listSessions(
  supabase: SupabaseClient,
  userId: string,
): Promise<SessionRow[]> {
  const { data } = await supabase
    .from("sessions")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "active")
    .is("deleted_at", null)
    .order("updated_at", { ascending: false });
  return (data as SessionRow[]) ?? [];
}

export async function getSession(
  supabase: SupabaseClient,
  sessionId: string,
): Promise<SessionRow | null> {
  const { data } = await supabase
    .from("sessions")
    .select("*")
    .eq("id", sessionId)
    .single();
  return data as SessionRow | null;
}

export async function createSession(
  supabase: SupabaseClient,
  userId: string,
  input: CreateSession,
): Promise<SessionRow | null> {
  const { data } = await supabase
    .from("sessions")
    .insert({ ...input, user_id: userId })
    .select()
    .single();
  return data as SessionRow | null;
}

export async function updateSession(
  supabase: SupabaseClient,
  sessionId: string,
  userId: string,
  input: UpdateSession,
): Promise<SessionRow | null> {
  const { data } = await supabase
    .from("sessions")
    .update(input)
    .eq("id", sessionId)
    .eq("user_id", userId)
    .select()
    .single();
  return data as SessionRow | null;
}

export async function archiveSession(
  supabase: SupabaseClient,
  sessionId: string,
  userId: string,
): Promise<void> {
  await supabase
    .from("sessions")
    .update({ status: "archived", archived_at: new Date().toISOString() })
    .eq("id", sessionId)
    .eq("user_id", userId);
}

export async function deleteSession(
  supabase: SupabaseClient,
  sessionId: string,
  userId: string,
): Promise<void> {
  await supabase
    .from("sessions")
    .update({ status: "deleted", deleted_at: new Date().toISOString() })
    .eq("id", sessionId)
    .eq("user_id", userId);
}

// ---------- session participants ----------

export async function listSessionParticipants(
  supabase: SupabaseClient,
  sessionId: string,
): Promise<import("../types/database").SessionParticipantRow[]> {
  const { data } = await supabase
    .from("session_participants")
    .select("*")
    .eq("session_id", sessionId);
  return (data as import("../types/database").SessionParticipantRow[]) ?? [];
}

export async function listSessionParticipantsForSessions(
  supabase: SupabaseClient,
  sessionIds: string[],
): Promise<import("../types/database").SessionParticipantRow[]> {
  if (sessionIds.length === 0) return [];
  const { data } = await supabase
    .from("session_participants")
    .select("*")
    .in("session_id", sessionIds);
  return (data as import("../types/database").SessionParticipantRow[]) ?? [];
}

export async function ensureSessionParticipant(
  supabase: SupabaseClient,
  userId: string,
  sessionId: string,
  characterId: string,
): Promise<void> {
  const { error } = await supabase
    .from("session_participants")
    .upsert(
      {
        session_id: sessionId,
        user_id: userId,
        character_id: characterId,
        participant_type: "character",
        is_active: true,
      },
      { onConflict: "session_id,character_id" },
    );
  if (error) logger.warn("[Repo] ensureSessionParticipant error:", error.message);
}

// ---------- messages ----------

export async function listMessages(
  supabase: SupabaseClient,
  sessionId: string,
  branchId?: string,
): Promise<MessageRow[]> {
  let query = supabase
    .from("messages")
    .select("*")
    .eq("session_id", sessionId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });

  if (branchId) {
    query = query.eq("branch_id", branchId);
  }

  const { data } = await query;
  return (data as MessageRow[]) ?? [];
}

export interface MessagePageCursor {
  createdAt: string;
  id: string;
}

export interface MessagePageResult {
  rows: MessageRow[];
  hasMore: boolean;
}

function applyMainlineMessageFilters(query: any) {
  return query
    .is("deleted_at", null)
    .is("superseded_by_message_id", null)
    .eq("hidden", false);
}

export async function listMessagesPage(
  supabase: SupabaseClient,
  sessionId: string,
  branchId: string | null | undefined,
  limit: number,
  before?: MessagePageCursor | null,
): Promise<MessagePageResult> {
  let query = applyMainlineMessageFilters(
    supabase
      .from("messages")
      .select("*")
      .eq("session_id", sessionId),
  )
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit + 1);

  if (branchId) {
    query = query.eq("branch_id", branchId);
  }

  if (before) {
    query = query.or(
      `created_at.lt.${before.createdAt},and(created_at.eq.${before.createdAt},id.lt.${before.id})`,
    );
  }

  const { data, error } = await query;
  if (error) throw error;

  const descending = (data as MessageRow[]) ?? [];
  const hasMore = descending.length > limit;
  const rows = (hasMore ? descending.slice(0, limit) : descending).reverse();

  return {
    rows,
    hasMore,
  };
}

export async function listRecentMessagesForContext(
  supabase: SupabaseClient,
  sessionId: string,
  branchId: string | null | undefined,
  limit: number,
): Promise<MessageRow[]> {
  const page = await listMessagesPage(supabase, sessionId, branchId, limit);
  return page.rows;
}

export async function createMessage(
  supabase: SupabaseClient,
  userId: string,
  input: CreateMessage,
): Promise<MessageRow | null> {
  if (input.role === "assistant" && "character_id" in input && input.character_id === undefined) {
    logger.warn("[Repo] assistant message is being saved without character_id.");
  }
  const { data } = await supabase
    .from("messages")
    .insert({ ...input, user_id: userId })
    .select()
    .single();
  return data as MessageRow | null;
}

export async function deleteMessage(
  supabase: SupabaseClient,
  messageId: string,
  userId: string,
  reason?: string,
): Promise<void> {
  await supabase
    .from("messages")
    .update({
      deleted_at: new Date().toISOString(),
      deleted_reason: reason ?? null,
    })
    .eq("id", messageId)
    .eq("user_id", userId);
}

export async function updateMessage(
  supabase: SupabaseClient,
  messageId: string,
  userId: string,
  input: { content_text: string; edited_at?: string; revision_no?: number },
): Promise<MessageRow | null> {
  const { data } = await supabase
    .from("messages")
    .update(input)
    .eq("id", messageId)
    .eq("user_id", userId)
    .select()
    .single();
  return data as MessageRow | null;
}

export async function supersedeMessages(
  supabase: SupabaseClient,
  messageIds: string[],
  supersededBy: string,
  userId: string,
): Promise<void> {
  if (messageIds.length === 0) return;
  await supabase
    .from("messages")
    .update({ superseded_by_message_id: supersededBy })
    .in("id", messageIds)
    .eq("user_id", userId);
}

export async function createMessageRevision(
  supabase: SupabaseClient,
  userId: string,
  input: { message_id: string; revision_no: number; content_text: string },
): Promise<MessageRevisionRow | null> {
  const { data } = await supabase
    .from("message_revisions")
    .insert({ ...input, user_id: userId })
    .select()
    .single();
  return data as MessageRevisionRow | null;
}

export async function listMessageRevisions(
  supabase: SupabaseClient,
  messageId: string,
): Promise<MessageRevisionRow[]> {
  const { data } = await supabase
    .from("message_revisions")
    .select("*")
    .eq("message_id", messageId)
    .order("revision_no", { ascending: true });
  return (data as MessageRevisionRow[]) ?? [];
}

export async function loadMessageRevisions(
  supabase: SupabaseClient,
  messageId: string,
): Promise<MessageRevisionRow[]> {
  return listMessageRevisions(supabase, messageId);
}

export async function getMessageRevisionCounts(
  supabase: SupabaseClient,
  messageIds: string[],
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (messageIds.length === 0) return counts;

  const { data, error } = await supabase
    .from("message_revisions")
    .select("message_id")
    .in("message_id", messageIds);

  if (error) throw error;

  (data as Array<{ message_id: string }> | null)?.forEach((row) => {
    counts.set(row.message_id, (counts.get(row.message_id) ?? 0) + 1);
  });

  return counts;
}

export async function clearSessionMessages(
  supabase: SupabaseClient,
  sessionId: string,
  userId: string,
): Promise<void> {
  const now = new Date().toISOString();
  await supabase
    .from("messages")
    .update({ deleted_at: now })
    .eq("session_id", sessionId)
    .eq("user_id", userId);
}

// ---------- branches ----------

export async function listBranches(
  supabase: SupabaseClient,
  sessionId: string,
): Promise<BranchRow[]> {
  const { data } = await supabase
    .from("branches")
    .select("*")
    .eq("session_id", sessionId)
    .eq("status", "active")
    .order("created_at", { ascending: true });
  return (data as BranchRow[]) ?? [];
}

export async function getActiveBranch(
  supabase: SupabaseClient,
  sessionId: string,
  userId: string,
): Promise<BranchRow | null> {
  // First get session's active_branch_id
  const { data: session } = await supabase
    .from("sessions")
    .select("active_branch_id")
    .eq("id", sessionId)
    .eq("user_id", userId)
    .single();

  if (session?.active_branch_id) {
    const { data: branch } = await supabase
      .from("branches")
      .select("*")
      .eq("id", session.active_branch_id)
      .single();
    return (branch as BranchRow) ?? null;
  }
  return null;
}

export async function createBranch(
  supabase: SupabaseClient,
  userId: string,
  input: {
    session_id: string;
    name: string;
    title?: string;
    parent_branch_id?: string;
    forked_from_message_id?: string;
  },
): Promise<BranchRow | null> {
  const now = new Date().toISOString();
  const { data } = await supabase
    .from("branches")
    .insert({
      session_id: input.session_id,
      user_id: userId,
      name: input.name,
      title: input.title ?? input.name,
      parent_branch_id: input.parent_branch_id ?? null,
      forked_from_message_id: input.forked_from_message_id ?? null,
      status: "active",
      created_at: now,
      updated_at: now,
    })
    .select()
    .single();
  return data as BranchRow | null;
}

export async function ensureDefaultBranch(
  supabase: SupabaseClient,
  sessionId: string,
  userId: string,
): Promise<BranchRow | null> {
  // Check if session already has active branch
  const { data: session } = await supabase
    .from("sessions")
    .select("active_branch_id")
    .eq("id", sessionId)
    .eq("user_id", userId)
    .single();

  if (session?.active_branch_id) {
    const { data: branch } = await supabase
      .from("branches")
      .select("*")
      .eq("id", session.active_branch_id)
      .single();
    if (branch) return branch as BranchRow;
  }

  // Check for any existing branch
  const existing = await listBranches(supabase, sessionId);
  if (existing.length > 0) {
    await supabase
      .from("sessions")
      .update({ active_branch_id: existing[0].id })
      .eq("id", sessionId)
      .eq("user_id", userId);
    return existing[0];
  }

  // Create default branch
  const branch = await createBranch(supabase, userId, {
    session_id: sessionId,
    name: "main",
    title: "主线",
  });

  if (branch) {
    await supabase
      .from("sessions")
      .update({ active_branch_id: branch.id })
      .eq("id", sessionId)
      .eq("user_id", userId);
  }

  return branch;
}

export async function setActiveBranch(
  supabase: SupabaseClient,
  sessionId: string,
  branchId: string,
  userId: string,
): Promise<void> {
  await supabase
    .from("sessions")
    .update({ active_branch_id: branchId })
    .eq("id", sessionId)
    .eq("user_id", userId);
}

// ---------- prompt templates ----------

export async function listPromptTemplates(
  supabase: SupabaseClient,
  userId?: string,
): Promise<PromptTemplateRow[]> {
  let query = supabase.from("prompt_templates").select("*").is("deleted_at", null);
  if (userId) {
    query = query.eq("user_id", userId);
  }
  const { data } = await query.order("updated_at", { ascending: false });
  return (data as PromptTemplateRow[]) ?? [];
}

export async function getPromptTemplate(
  supabase: SupabaseClient,
  templateId: string,
): Promise<PromptTemplateRow | null> {
  try {
    const { data, error } = await supabase
      .from("prompt_templates")
      .select("*")
      .eq("id", templateId)
      .maybeSingle();
    if (error) return null;
    return data as PromptTemplateRow | null;
  } catch {
    return null;
  }
}

export async function createPromptTemplate(
  supabase: SupabaseClient,
  userId: string,
  input: CreatePromptTemplate,
): Promise<PromptTemplateRow | null> {
  const { data } = await supabase
    .from("prompt_templates")
    .insert({ ...input, user_id: userId })
    .select()
    .single();
  return data as PromptTemplateRow | null;
}

export async function updatePromptTemplate(
  supabase: SupabaseClient,
  templateId: string,
  input: UpdatePromptTemplate,
): Promise<PromptTemplateRow | null> {
  const { data } = await supabase
    .from("prompt_templates")
    .update(input)
    .eq("id", templateId)
    .select()
    .single();
  return data as PromptTemplateRow | null;
}

export async function deletePromptTemplate(
  supabase: SupabaseClient,
  templateId: string,
): Promise<void> {
  await supabase
    .from("prompt_templates")
    .update({
      deleted_at: new Date().toISOString(),
      deleted_reason: "user_deleted",
    })
    .eq("id", templateId);
}

// ---------- worldbooks ----------

export async function listWorldbooks(
  supabase: SupabaseClient,
  userId: string,
): Promise<WorldbookRow[]> {
  const { data } = await supabase
    .from("worldbooks")
    .select("*")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .order("updated_at", { ascending: false });
  return (data as WorldbookRow[]) ?? [];
}

export async function getWorldbook(
  supabase: SupabaseClient,
  worldbookId: string,
): Promise<WorldbookRow | null> {
  try {
    const { data } = await supabase.from("worldbooks").select("*").eq("id", worldbookId).maybeSingle();
    return data as WorldbookRow | null;
  } catch { return null; }
}

export async function createWorldbook(
  supabase: SupabaseClient,
  userId: string,
  input: { name: string; description?: string; tags?: string[] },
): Promise<WorldbookRow | null> {
  const { data } = await supabase
    .from("worldbooks").insert({ ...input, user_id: userId }).select().maybeSingle();
  return data as WorldbookRow | null;
}

export async function updateWorldbook(
  supabase: SupabaseClient,
  worldbookId: string,
  input: { name?: string; description?: string; tags?: string[] },
): Promise<WorldbookRow | null> {
  const { data } = await supabase
    .from("worldbooks").update(input).eq("id", worldbookId).select().maybeSingle();
  return data as WorldbookRow | null;
}

export async function deleteWorldbook(
  supabase: SupabaseClient,
  worldbookId: string,
): Promise<void> {
  const now = new Date().toISOString();
  // Soft-delete worldbook entries first, then the worldbook itself
  await supabase
    .from("worldbook_entries")
    .update({ deleted_at: now, deleted_reason: "worldbook_deleted" })
    .eq("worldbook_id", worldbookId)
    .is("deleted_at", null);
  await supabase
    .from("worldbooks")
    .update({ deleted_at: now, deleted_reason: "user_deleted" })
    .eq("id", worldbookId);
}

// ---------- worldbook entries ----------

export async function getWorldbookEntry(
  supabase: SupabaseClient,
  entryId: string,
): Promise<WorldbookEntryRow | null> {
  try {
    const { data } = await supabase.from("worldbook_entries").select("*").eq("id", entryId).maybeSingle();
    return data as WorldbookEntryRow | null;
  } catch { return null; }
}

export async function listAllWorldbookEntries(
  supabase: SupabaseClient,
  userId: string,
): Promise<WorldbookEntryRow[]> {
  const { data } = await supabase
    .from("worldbook_entries")
    .select("*")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .order("priority", { ascending: false });
  return (data as WorldbookEntryRow[]) ?? [];
}

export async function listWorldbookEntries(
  supabase: SupabaseClient,
  worldbookId: string,
): Promise<WorldbookEntryRow[]> {
  const { data } = await supabase
    .from("worldbook_entries")
    .select("*")
    .eq("worldbook_id", worldbookId)
    .is("deleted_at", null)
    .order("priority", { ascending: false });
  return (data as WorldbookEntryRow[]) ?? [];
}

export async function createWorldbookEntry(
  supabase: SupabaseClient,
  userId: string,
  input: CreateWorldbookEntry,
): Promise<WorldbookEntryRow | null> {
  const { data } = await supabase
    .from("worldbook_entries")
    .insert({ ...input, user_id: userId })
    .select()
    .single();
  return data as WorldbookEntryRow | null;
}

export async function updateWorldbookEntry(
  supabase: SupabaseClient,
  entryId: string,
  input: UpdateWorldbookEntry,
): Promise<WorldbookEntryRow | null> {
  const { data } = await supabase
    .from("worldbook_entries")
    .update(input)
    .eq("id", entryId)
    .select()
    .single();
  return data as WorldbookEntryRow | null;
}

export async function deleteWorldbookEntry(
  supabase: SupabaseClient,
  entryId: string,
): Promise<void> {
  const now = new Date().toISOString();
  await supabase
    .from("worldbook_entries")
    .update({ deleted_at: now, deleted_reason: "user_deleted" })
    .eq("id", entryId);
}

// ---------- memories ----------

export async function getMemory(
  supabase: SupabaseClient,
  memoryId: string,
): Promise<MemoryRow | null> {
  try {
    const { data } = await supabase.from("memories").select("*").eq("id", memoryId).maybeSingle();
    return data as MemoryRow | null;
  } catch { return null; }
}

export async function listAllActiveMemories(
  supabase: SupabaseClient,
  userId: string,
): Promise<MemoryRow[]> {
  const { data } = await supabase
    .from("memories")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "active")
    .is("deleted_at", null)
    .order("salience", { ascending: false });
  return (data as MemoryRow[]) ?? [];
}

export async function listMemories(
  supabase: SupabaseClient,
  userId: string,
  sessionId?: string,
): Promise<MemoryRow[]> {
  let query = supabase
    .from("memories")
    .select("*")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .neq("status", "deleted")
    .order("updated_at", { ascending: false });

  if (sessionId) {
    query = query.eq("session_id", sessionId);
  }

  const { data } = await query;
  return (data as MemoryRow[]) ?? [];
}

export async function listMemoriesByStatus(
  supabase: SupabaseClient,
  userId: string,
  statuses: MemoryRow["status"][],
  sessionId?: string,
): Promise<MemoryRow[]> {
  if (statuses.length === 0) return [];

  let query = supabase
    .from("memories")
    .select("*")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .in("status", statuses)
    .order("updated_at", { ascending: false });

  if (sessionId) {
    query = query.eq("session_id", sessionId);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data as MemoryRow[]) ?? [];
}

export async function createMemory(
  supabase: SupabaseClient,
  userId: string,
  input: CreateMemory,
): Promise<MemoryRow | null> {
  const { data } = await supabase
    .from("memories")
    .insert({ ...input, user_id: userId })
    .select()
    .single();
  return data as MemoryRow | null;
}

export async function updateMemory(
  supabase: SupabaseClient,
  memoryId: string,
  userId: string,
  input: UpdateMemory,
): Promise<MemoryRow | null> {
  const { data } = await supabase
    .from("memories")
    .update(input)
    .eq("id", memoryId)
    .eq("user_id", userId)
    .select()
    .single();
  return data as MemoryRow | null;
}

export async function deleteMemory(
  supabase: SupabaseClient,
  memoryId: string,
  userId: string,
): Promise<void> {
  const now = new Date().toISOString();
  await supabase
    .from("memories")
    .update({ status: "deleted", deleted_at: now, deleted_reason: "user_deleted" })
    .eq("id", memoryId)
    .eq("user_id", userId);
}

// ---------- model presets ----------

export async function listModelPresets(
  supabase: SupabaseClient,
  userId?: string,
): Promise<ModelPresetRow[]> {
  let query = supabase.from("model_presets").select("*");
  if (userId) {
    query = query.eq("user_id", userId);
  }
  const { data } = await query.order("created_at", { ascending: false });
  return (data as ModelPresetRow[]) ?? [];
}

export async function createModelPreset(
  supabase: SupabaseClient,
  userId: string,
  input: CreateModelPreset,
): Promise<ModelPresetRow | null> {
  const { data } = await supabase
    .from("model_presets")
    .insert({ ...input, user_id: userId })
    .select()
    .single();
  return data as ModelPresetRow | null;
}

export async function updateModelPreset(
  supabase: SupabaseClient,
  presetId: string,
  input: UpdateModelPreset,
): Promise<ModelPresetRow | null> {
  const { data } = await supabase
    .from("model_presets")
    .update(input)
    .eq("id", presetId)
    .select()
    .single();
  return data as ModelPresetRow | null;
}

export async function deleteModelPreset(
  supabase: SupabaseClient,
  presetId: string,
): Promise<void> {
  await supabase.from("model_presets").delete().eq("id", presetId);
}

// ---------- context runs ----------

export async function listContextRuns(
  supabase: SupabaseClient,
  userId: string,
  sessionId?: string,
): Promise<ContextRunRow[]> {
  let query = supabase
    .from("context_runs")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (sessionId) {
    query = query.eq("session_id", sessionId);
  }

  const { data } = await query;
  return (data as ContextRunRow[]) ?? [];
}

export async function createContextRun(
  supabase: SupabaseClient,
  userId: string,
  sessionId: string,
): Promise<ContextRunRow | null> {
  const { data } = await supabase
    .from("context_runs")
    .insert({ user_id: userId, session_id: sessionId })
    .select()
    .single();
  return data as ContextRunRow | null;
}

export interface SaveContextRunInput {
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
}

export async function saveContextRun(
  supabase: SupabaseClient,
  userId: string,
  input: SaveContextRunInput,
): Promise<ContextRunRow | null> {
  const { data } = await supabase
    .from("context_runs")
    .insert({
      user_id: userId,
      session_id: input.session_id,
      branch_id: input.branch_id ?? null,
      message_id: input.message_id ?? null,
      trigger_message_id: input.trigger_message_id ?? null,
      provider: input.provider ?? null,
      model: input.model ?? null,
      system_prompt: input.system_prompt ?? null,
      provider_messages_json: input.provider_messages_json ?? null,
      worldbook_hits_json: input.worldbook_hits_json ?? null,
      skipped_entries_json: input.skipped_entries_json ?? null,
      injected_memories_json: input.injected_memories_json ?? null,
      summary_text: input.summary_text ?? null,
      token_budget: input.token_budget ?? null,
      estimated_tokens: input.estimated_tokens ?? null,
      debug_enabled: input.debug_enabled ?? false,
      input_tokens: input.input_tokens ?? null,
      output_tokens: input.output_tokens ?? null,
      cache_hit_tokens: input.cache_hit_tokens ?? null,
      cost_usd: input.cost_usd ?? null,
      components_json: input.components_json ?? [],
      dropped_json: input.dropped_json ?? [],
    })
    .select()
    .single();
  return data as ContextRunRow | null;
}

export async function listRecentContextRuns(
  supabase: SupabaseClient,
  userId: string,
  sessionId: string,
  limit = 20,
): Promise<ContextRunRow[]> {
  const { data, error } = await supabase
    .from("context_runs")
    .select("*")
    .eq("user_id", userId)
    .eq("session_id", sessionId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    logger.warn("[Repo] listRecentContextRuns failed:", error);
    return [];
  }
  return (data as ContextRunRow[]) ?? [];
}

// ---------- app settings ----------

const DEFAULT_SETTINGS: AppSettings = {
  default_provider: "deepseek",
  default_model: "deepseek-chat",
  max_context_tokens: 8000,
  demo_mode_enabled: true,
};

export function getAppSettings(): AppSettings {
  return DEFAULT_SETTINGS;
}

export function updateAppSettings(
  _updates: Partial<AppSettings>,
): AppSettings {
  // Stage 1: local-only settings. Will persist to DB in later stages.
  return { ...DEFAULT_SETTINGS, ..._updates };
}
