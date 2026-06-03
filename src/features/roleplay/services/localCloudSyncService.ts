/**
 * LocalCloudSyncService — 本地到云端 / 云端到本地同步。
 *
 * 安全边界：
 * - API Key 不参与同步
 * - hosted_encrypted secret / encrypted_api_key / encryption_iv 不参与同步
 * - 所有上传数据 user_id 强制设为当前登录用户
 * - 不静默覆盖，不静默删除
 */

import { supabase } from "../../auth/supabaseClient";
import * as Repo from "../repositories/roleplayRepository";
import * as LocalRepo from "../repositories/localRoleplayRepository";
import { getSyncDecision, getSyncMetadata, setSyncMetadata, setSyncDecision } from "./syncMetadata";
import type {
  SyncConflict,
  SyncDecision,
  SyncEntityType,
  SyncResult,
  SyncSummary,
} from "../types/sync";
import type {
  BranchRow,
  CharacterRow,
  MemoryRow,
  MessageRevisionRow,
  MessageRow,
  PromptTemplateRow,
  SessionRow,
  WorldbookEntryRow,
  WorldbookRow,
} from "../types/database";

// ---- Helpers ----

function nowIso(): string {
  return new Date().toISOString();
}

function stripSensitiveFields<T>(row: T): T {
  const record = row as Record<string, unknown>;
  const cleaned = { ...record };
  // Remove API key related fields
  delete cleaned.api_key;
  delete cleaned.encrypted_api_key;
  delete cleaned.encryption_iv;
  delete cleaned.provider_credential_secrets;
  delete cleaned.secret;
  return cleaned as T;
}

// ---- Local data detection ----

export async function hasLocalData(): Promise<boolean> {
  try {
    const [chars, tmpls, wbs, mems, sessions] = await Promise.all([
      LocalRepo.listActiveCharacters().catch(() => []),
      LocalRepo.listPromptTemplates().catch(() => []),
      LocalRepo.listWorldbooks().catch(() => []),
      LocalRepo.listMemories().catch(() => []),
      LocalRepo.listSessions().catch(() => []),
    ]);
    return chars.length > 0 || tmpls.length > 0 || wbs.length > 0 || mems.length > 0 || sessions.length > 0;
  } catch {
    return false;
  }
}

// ---- Sync decision ----

export function getStoredSyncDecision(userId: string): SyncDecision | null {
  return getSyncDecision(userId);
}

export function storeSyncDecision(userId: string, decision: SyncDecision): void {
  setSyncDecision(userId, decision);
}

// ---- Data snapshots ----

export async function getLocalSnapshot(): Promise<Record<SyncEntityType, number>> {
  try {
    const [chars, tmpls, wbs, entries, mems, sessions] = await Promise.all([
      LocalRepo.listActiveCharacters().catch(() => [] as CharacterRow[]),
      LocalRepo.listPromptTemplates().catch(() => [] as PromptTemplateRow[]),
      LocalRepo.listWorldbooks().catch(() => [] as WorldbookRow[]),
      LocalRepo.listAllWorldbookEntries().catch(() => [] as WorldbookEntryRow[]),
      LocalRepo.listMemories().catch(() => [] as MemoryRow[]),
      LocalRepo.listSessions().catch(() => [] as SessionRow[]),
    ]);
    // Rough counts; detailed diff happens during actual sync
    return {
      characters: chars.length,
      prompt_templates: tmpls.length,
      worldbooks: wbs.length,
      worldbook_entries: entries.length,
      memories: mems.length,
      sessions: sessions.length,
      branches: 0,
      session_participants: 0,
      messages: 0,
      message_revisions: 0,
      context_runs: 0,
    };
  } catch {
    const empty: Record<SyncEntityType, number> = { characters: 0, prompt_templates: 0, worldbooks: 0, worldbook_entries: 0, memories: 0, sessions: 0, branches: 0, session_participants: 0, messages: 0, message_revisions: 0, context_runs: 0 };
    return empty;
  }
}

export async function getCloudSnapshot(userId: string): Promise<Record<SyncEntityType, number>> {
  if (!supabase) {
    const empty: Record<SyncEntityType, number> = { characters: 0, prompt_templates: 0, worldbooks: 0, worldbook_entries: 0, memories: 0, sessions: 0, branches: 0, session_participants: 0, messages: 0, message_revisions: 0, context_runs: 0 };
    return empty;
  }
  try {
    const [chars, tmpls, wbs, entries, mems, sessions] = await Promise.all([
      Repo.listActiveCharacters(supabase, userId).catch(() => [] as CharacterRow[]),
      Repo.listPromptTemplates(supabase, userId).catch(() => [] as PromptTemplateRow[]),
      Repo.listWorldbooks(supabase, userId).catch(() => [] as WorldbookRow[]),
      Repo.listAllWorldbookEntries(supabase, userId).catch(() => [] as WorldbookEntryRow[]),
      Repo.listAllActiveMemories(supabase, userId).catch(() => [] as MemoryRow[]),
      Repo.listSessions(supabase, userId).catch(() => [] as SessionRow[]),
    ]);
    return {
      characters: chars.length,
      prompt_templates: tmpls.length,
      worldbooks: wbs.length,
      worldbook_entries: entries.length,
      memories: mems.length,
      sessions: sessions.length,
      branches: 0,
      session_participants: 0,
      messages: 0,
      message_revisions: 0,
      context_runs: 0,
    };
  } catch {
    const empty: Record<SyncEntityType, number> = { characters: 0, prompt_templates: 0, worldbooks: 0, worldbook_entries: 0, memories: 0, sessions: 0, branches: 0, session_participants: 0, messages: 0, message_revisions: 0, context_runs: 0 };
    return empty;
  }
}

export async function getDiffSummary(userId: string): Promise<SyncSummary> {
  const [localCounts, cloudCounts] = await Promise.all([
    getLocalSnapshot(),
    getCloudSnapshot(userId),
  ]);
  const meta = getSyncMetadata(userId);
  const missingInCloud: SyncEntityType[] = [];
  const missingInLocal: SyncEntityType[] = [];
  const conflicts: SyncConflict[] = [];

  for (const key of Object.keys(localCounts) as SyncEntityType[]) {
    if (localCounts[key] > 0 && cloudCounts[key] === 0) missingInCloud.push(key);
    if (cloudCounts[key] > 0 && localCounts[key] === 0) missingInLocal.push(key);
  }

  return {
    localCounts,
    cloudCounts,
    missingInCloud,
    missingInLocal,
    conflicts,
    lastSyncedAt: meta?.lastSyncedAt ?? null,
  };
}

// ---- Upload: Local → Cloud ----

export async function uploadLocalToCloud(
  userId: string,
  onProgress?: (entity: SyncEntityType, done: number, total: number) => void,
): Promise<SyncResult> {
  if (!supabase) return { created: 0, skipped: 0, duplicated: 0, conflicts: 0, failed: 0, details: ["Supabase 未配置"] };

  const result: SyncResult = { created: 0, skipped: 0, duplicated: 0, conflicts: 0, failed: 0, details: [] };
  const idMap = new Map<string, string>(); // oldLocalId → newCloudId

  const uploadOrder: SyncEntityType[] = [
    "characters", "prompt_templates", "worldbooks", "worldbook_entries",
    "memories", "sessions", "branches", "session_participants",
    "messages", "message_revisions", "context_runs",
  ];

  const total = uploadOrder.length;
  let done = 0;

  for (const entityType of uploadOrder) {
    try {
      const entityResult = await uploadEntityType(entityType, userId, idMap);
      result.created += entityResult.created;
      result.skipped += entityResult.skipped;
      result.duplicated += entityResult.duplicated;
      result.conflicts += entityResult.conflicts;
      result.failed += entityResult.failed;
      result.details.push(...entityResult.details);
    } catch (e) {
      result.failed++;
      result.details.push(`${entityType}: ${e instanceof Error ? e.message : String(e)}`);
    }
    done++;
    onProgress?.(entityType, done, total);
  }

  // Record sync metadata
  setSyncMetadata(userId, {
    userId,
    lastSyncedAt: nowIso(),
    lastDirection: "local_to_cloud",
    lastDecision: "upload",
    lastLocalCounts: await getLocalSnapshot(),
    lastCloudCounts: await getCloudSnapshot(userId),
    lastConflictCount: result.conflicts,
    updatedAt: nowIso(),
  });

  return result;
}

async function uploadEntityType(
  entityType: SyncEntityType,
  userId: string,
  idMap: Map<string, string>,
): Promise<SyncResult> {
  const result: SyncResult = { created: 0, skipped: 0, duplicated: 0, conflicts: 0, failed: 0, details: [] };

  switch (entityType) {
    case "characters": {
      const rows = await LocalRepo.listActiveCharacters().catch(() => [] as CharacterRow[]);
      for (const row of rows) {
        try {
          const cleaned = { ...stripSensitiveFields(row), user_id: userId };
          const cloudExisting = await Repo.getCharacter(supabase!, row.id).catch(() => null);
          if (!cloudExisting) {
            const created = await Repo.createCharacter(supabase!, userId, {
              name: cleaned.name,
              card_json: cleaned.card_json,
              summary: cleaned.summary ?? undefined,
              slug: cleaned.slug ?? undefined,
              avatar_path: cleaned.avatar_path ?? undefined,
              avatar_emoji: cleaned.avatar_emoji ?? undefined,
              tags: cleaned.tags ?? [],
              visibility: cleaned.visibility ?? "private",
              is_favorite: cleaned.is_favorite ?? false,
            });
            if (created) { result.created++; idMap.set(row.id, created.id); }
            else result.failed++;
          } else {
            const same = existingContentSame(cleaned, cloudExisting);
            if (same) { result.skipped++; idMap.set(row.id, row.id); }
            else {
              // Conflict: create as new copy
              const conflictId = crypto.randomUUID();
              idMap.set(row.id, conflictId);
              const created = await Repo.createCharacter(supabase!, userId, {
                name: `${cleaned.name} (本地副本)`,
                card_json: cleaned.card_json,
                summary: cleaned.summary ?? undefined,
                tags: cleaned.tags ?? [],
              });
              if (created) { result.conflicts++; idMap.set(row.id, created.id); }
              else result.failed++;
            }
          }
        } catch { result.failed++; }
      }
      break;
    }

    case "prompt_templates": {
      const rows = await LocalRepo.listPromptTemplates().catch(() => [] as PromptTemplateRow[]);
      for (const row of rows) {
        try {
          const cleaned = { ...stripSensitiveFields(row), user_id: userId };
          const cloudExisting = await Repo.getPromptTemplate(supabase!, row.id).catch(() => null);
          if (!cloudExisting) {
            const created = await Repo.createPromptTemplate(supabase!, userId, {
              title: cleaned.title,
              content: cleaned.content,
              category: cleaned.category ?? "general",
              tags: cleaned.tags ?? [],
              description: cleaned.description ?? undefined,
              visibility: cleaned.visibility ?? "private",
              is_favorite: cleaned.is_favorite ?? false,
            });
            if (created) { result.created++; idMap.set(row.id, created.id); }
            else result.failed++;
          } else {
            const same = existingContentSame(cleaned, cloudExisting);
            if (same) { result.skipped++; idMap.set(row.id, row.id); }
            else { result.conflicts++; result.details.push(`模板 "${cleaned.title}" 云端已存在不同内容，已跳过`); }
          }
        } catch { result.failed++; }
      }
      break;
    }

    case "worldbooks": {
      const rows = await LocalRepo.listWorldbooks().catch(() => [] as WorldbookRow[]);
      for (const row of rows) {
        try {
          const cleaned = { ...stripSensitiveFields(row), user_id: userId };
          const cloudExisting = await Repo.getWorldbook(supabase!, row.id).catch(() => null);
          if (!cloudExisting) {
            const created = await Repo.createWorldbook(supabase!, userId, {
              name: cleaned.name,
              description: cleaned.description ?? undefined,
              tags: cleaned.tags ?? [],
            });
            if (created) { result.created++; idMap.set(row.id, created.id); }
            else result.failed++;
          } else {
            const same = existingContentSame(cleaned, cloudExisting);
            if (same) { result.skipped++; idMap.set(row.id, row.id); }
            else { result.conflicts++; result.details.push(`世界书 "${cleaned.name}" 云端已存在不同内容，已跳过`); }
          }
        } catch { result.failed++; }
      }
      break;
    }

    case "worldbook_entries": {
      const entries = await LocalRepo.listAllWorldbookEntries().catch(() => [] as WorldbookEntryRow[]);
      for (const row of entries) {
        try {
          const cleaned = { ...stripSensitiveFields(row), user_id: userId, worldbook_id: idMap.get(row.worldbook_id) ?? row.worldbook_id };
          const cloudExisting = await Repo.getWorldbookEntry(supabase!, row.id).catch(() => null);
          if (!cloudExisting) {
            const created = await Repo.createWorldbookEntry(supabase!, userId, {
              worldbook_id: cleaned.worldbook_id,
              title: cleaned.title,
              content: cleaned.content,
              triggers: cleaned.triggers ?? [],
              priority: cleaned.priority ?? 100,
              category: cleaned.category ?? "general",
              scope: cleaned.scope ?? "global",
            });
            if (created) { result.created++; idMap.set(row.id, created.id); }
            else result.failed++;
          } else {
            const same = existingContentSame(cleaned, cloudExisting);
            if (same) { result.skipped++; idMap.set(row.id, row.id); }
            else { result.conflicts++; }
          }
        } catch { result.failed++; }
      }
      break;
    }

    case "memories": {
      const rows = await LocalRepo.listMemories().catch(() => [] as MemoryRow[]);
      for (const row of rows) {
        try {
          const cleaned = { ...stripSensitiveFields(row), user_id: userId };
          const cloudExisting = await Repo.getMemory(supabase!, row.id).catch(() => null);
          if (!cloudExisting) {
            const created = await Repo.createMemory(supabase!, userId, {
              content: cleaned.content,
              memory_type: cleaned.memory_type ?? "event",
              title: cleaned.title ?? undefined,
              salience: cleaned.salience ?? 50,
              status: cleaned.status ?? "active",
              session_id: cleaned.session_id ?? undefined,
              character_id: cleaned.character_id ?? undefined,
              source_message_id: cleaned.source_message_id ?? undefined,
            });
            if (created) { result.created++; idMap.set(row.id, created.id); }
            else result.failed++;
          } else {
            const same = existingContentSame(cleaned, cloudExisting);
            if (same) { result.skipped++; idMap.set(row.id, row.id); }
            else { result.conflicts++; }
          }
        } catch { result.failed++; }
      }
      break;
    }

    case "sessions": {
      const rows = await LocalRepo.listSessions().catch(() => [] as SessionRow[]);
      for (const row of rows) {
        try {
          const cleaned = { ...stripSensitiveFields(row), user_id: userId, primary_character_id: row.primary_character_id ? (idMap.get(row.primary_character_id) ?? row.primary_character_id) : null };
          const cloudExisting = await Repo.getSession(supabase!, row.id).catch(() => null);
          if (!cloudExisting) {
            const created = await Repo.createSession(supabase!, userId, {
              title: cleaned.title,
              primary_character_id: cleaned.primary_character_id ?? undefined,
              system_prompt: cleaned.system_prompt ?? undefined,
            });
            if (created) { result.created++; idMap.set(row.id, created.id); }
            else result.failed++;
          } else {
            result.skipped++; idMap.set(row.id, row.id);
          }
        } catch { result.failed++; }
      }
      break;
    }

    case "branches": {
      // Map each local branch to a concrete cloud branch ID before message upload.
      const sessions = await LocalRepo.listSessions().catch(() => [] as SessionRow[]);
      for (const session of sessions) {
        try {
          const cloudSessionId = idMap.get(session.id) ?? session.id;
          const localBranches = await LocalRepo.listBranches(session.id).catch(() => [] as BranchRow[]);
          const cloudBranches = await Repo.listBranches(supabase!, cloudSessionId).catch(() => [] as BranchRow[]);

          for (const localBranch of localBranches) {
            const mappedParentId = localBranch.parent_branch_id
              ? idMap.get(localBranch.parent_branch_id) ?? null
              : null;
            const existingBranch =
              cloudBranches.find((branch) => branch.id === localBranch.id)
              ?? cloudBranches.find(
                (branch) =>
                  branch.name === localBranch.name &&
                  (branch.title ?? null) === (localBranch.title ?? null) &&
                  (branch.parent_branch_id ?? null) === mappedParentId,
              )
              ?? null;

            if (existingBranch) {
              result.skipped++;
              idMap.set(localBranch.id, existingBranch.id);
              continue;
            }

            const createdBranch = await Repo.createBranch(supabase!, userId, {
              session_id: cloudSessionId,
              name: localBranch.name,
              title: localBranch.title ?? localBranch.name,
              parent_branch_id: mappedParentId ?? undefined,
              forked_from_message_id: localBranch.forked_from_message_id
                ? idMap.get(localBranch.forked_from_message_id) ?? undefined
                : undefined,
            }).catch(() => null);

            if (createdBranch) {
              result.created++;
              idMap.set(localBranch.id, createdBranch.id);
              cloudBranches.push(createdBranch);
            } else {
              result.failed++;
            }
          }

          if (localBranches.length === 0) {
            const defaultBranch = await Repo.ensureDefaultBranch(supabase!, cloudSessionId, userId).catch(() => null);
            if (defaultBranch) {
              result.created++;
            } else {
              result.skipped++;
            }
          }
        } catch { result.failed++; }
      }
      break;
    }

    case "session_participants": {
      const sessions = await LocalRepo.listSessions().catch(() => [] as SessionRow[]);
      for (const session of sessions) {
        try {
          const cloudSessionId = idMap.get(session.id) ?? session.id;
          const charId = session.primary_character_id;
          if (charId) {
            const mappedCharId = idMap.get(charId) ?? charId;
            await Repo.ensureSessionParticipant(supabase!, userId, cloudSessionId, mappedCharId).catch(() => {});
            result.created++;
          }
        } catch { result.failed++; }
      }
      break;
    }

    case "messages": {
      const sessions = await LocalRepo.listSessions().catch(() => [] as SessionRow[]);
      for (const session of sessions) {
        try {
          const cloudSessionId = idMap.get(session.id) ?? session.id;
          const msgs = await LocalRepo.listMessages(session.id).catch(() => [] as MessageRow[]);
          for (const msg of msgs) {
            const cleaned = {
              ...stripSensitiveFields(msg),
              user_id: userId,
              session_id: cloudSessionId,
              branch_id: idMap.get(msg.branch_id) ?? msg.branch_id,
              character_id: msg.character_id ? (idMap.get(msg.character_id) ?? msg.character_id) : null,
              parent_id: msg.parent_id ? (idMap.get(msg.parent_id) ?? null) : null,
              edited_from_id: msg.edited_from_id ? (idMap.get(msg.edited_from_id) ?? null) : null,
            };
            const cloudExisting = await Repo.createMessage(supabase!, userId, {
              session_id: cleaned.session_id,
              branch_id: cleaned.branch_id,
              role: cleaned.role,
              content_text: cleaned.content_text,
              character_id: cleaned.character_id ?? undefined,
              content_json: cleaned.content_json ?? {},
              parent_id: cleaned.parent_id ?? undefined,
              edited_from_id: cleaned.edited_from_id ?? undefined,
              token_count: cleaned.token_count ?? undefined,
              hidden: cleaned.hidden ?? false,
            }).catch(() => null);
            if (cloudExisting) { result.created++; idMap.set(msg.id, cloudExisting.id); }
            else result.failed++;
          }
        } catch { result.failed++; }
      }
      break;
    }

    case "message_revisions": {
      const sessions = await LocalRepo.listSessions().catch(() => [] as SessionRow[]);
      for (const session of sessions) {
        try {
          const msgs = await LocalRepo.listMessages(session.id).catch(() => [] as MessageRow[]);
          for (const msg of msgs) {
            const revs = await LocalRepo.loadMessageRevisions(msg.id).catch(() => [] as MessageRevisionRow[]);
            for (const rev of revs) {
              const mappedMsgId = idMap.get(rev.message_id) ?? rev.message_id;
              const createdRevision = await Repo.createMessageRevision(supabase!, userId, {
                message_id: mappedMsgId,
                revision_no: rev.revision_no,
                content_text: rev.content_text,
              }).catch(() => null);
              if (createdRevision) {
                result.created++;
              } else {
                result.failed++;
              }
            }
          }
        } catch { result.failed++; }
      }
      break;
    }

    case "context_runs": {
      // context_runs are not critical for sync; skip for safety
      result.skipped++;
      result.details.push("context_runs 暂不参与上传同步");
      break;
    }
  }

  return result;
}

// ---- Download: Cloud → Local ----

export async function downloadCloudToLocal(
  userId: string,
  onProgress?: (entity: SyncEntityType, done: number, total: number) => void,
): Promise<SyncResult> {
  if (!supabase) return { created: 0, skipped: 0, duplicated: 0, conflicts: 0, failed: 0, details: ["Supabase 未配置"] };

  const result: SyncResult = { created: 0, skipped: 0, duplicated: 0, conflicts: 0, failed: 0, details: [] };

  const downloadOrder: SyncEntityType[] = [
    "characters", "prompt_templates", "worldbooks", "worldbook_entries",
    "memories", "sessions", "branches", "session_participants",
    "messages", "message_revisions", "context_runs",
  ];

  const total = downloadOrder.length;
  let done = 0;

  for (const entityType of downloadOrder) {
    try {
      const entityResult = await downloadEntityType(entityType, userId);
      result.created += entityResult.created;
      result.skipped += entityResult.skipped;
      result.duplicated += entityResult.duplicated;
      result.conflicts += entityResult.conflicts;
      result.failed += entityResult.failed;
      result.details.push(...entityResult.details);
    } catch (e) {
      result.failed++;
      result.details.push(`${entityType}: ${e instanceof Error ? e.message : String(e)}`);
    }
    done++;
    onProgress?.(entityType, done, total);
  }

  // Record sync metadata
  setSyncMetadata(userId, {
    userId,
    lastSyncedAt: nowIso(),
    lastDirection: "cloud_to_local",
    lastDecision: "download",
    lastLocalCounts: await getLocalSnapshot(),
    lastCloudCounts: await getCloudSnapshot(userId),
    lastConflictCount: result.conflicts,
    updatedAt: nowIso(),
  });

  return result;
}

async function downloadEntityType(
  entityType: SyncEntityType,
  userId: string,
): Promise<SyncResult> {
  const result: SyncResult = { created: 0, skipped: 0, duplicated: 0, conflicts: 0, failed: 0, details: [] };

  switch (entityType) {
    case "characters": {
      const rows = await Repo.listActiveCharacters(supabase!, userId).catch(() => [] as CharacterRow[]);
      for (const row of rows) {
        try {
          const cleaned = stripSensitiveFields(row);
          const localExisting = await LocalRepo.getCharacter(row.id).catch(() => null);
          if (!localExisting) {
            await LocalRepo.createCharacter({
              name: cleaned.name,
              card_json: cleaned.card_json,
              summary: cleaned.summary ?? undefined,
              slug: cleaned.slug ?? undefined,
              avatar_path: cleaned.avatar_path ?? undefined,
              avatar_emoji: cleaned.avatar_emoji ?? undefined,
              tags: cleaned.tags ?? [],
              visibility: cleaned.visibility ?? "private",
              is_favorite: cleaned.is_favorite ?? false,
            }).catch(() => {});
            result.created++;
          } else {
            result.skipped++;
          }
        } catch { result.failed++; }
      }
      break;
    }

    case "prompt_templates": {
      const rows = await Repo.listPromptTemplates(supabase!, userId).catch(() => [] as PromptTemplateRow[]);
      for (const row of rows) {
        try {
          const cleaned = stripSensitiveFields(row);
          const localExisting = await LocalRepo.getPromptTemplate(row.id).catch(() => null);
          if (!localExisting) {
            await LocalRepo.createPromptTemplate({
              title: cleaned.title,
              content: cleaned.content,
              category: cleaned.category ?? "general",
              tags: cleaned.tags ?? [],
              description: cleaned.description ?? undefined,
              visibility: cleaned.visibility ?? "private",
              is_favorite: cleaned.is_favorite ?? false,
            }).catch(() => {});
            result.created++;
          } else {
            result.skipped++;
          }
        } catch { result.failed++; }
      }
      break;
    }

    case "worldbooks": {
      const rows = await Repo.listWorldbooks(supabase!, userId).catch(() => [] as WorldbookRow[]);
      for (const row of rows) {
        try {
          const cleaned = stripSensitiveFields(row);
          const localExisting = await LocalRepo.getWorldbook(row.id).catch(() => null);
          if (!localExisting) {
            await LocalRepo.createWorldbook({
              name: cleaned.name,
              description: cleaned.description ?? undefined,
              tags: cleaned.tags ?? [],
            }).catch(() => {});
            result.created++;
          } else {
            result.skipped++;
          }
        } catch { result.failed++; }
      }
      break;
    }

    case "worldbook_entries": {
      const entries = await Repo.listAllWorldbookEntries(supabase!, userId).catch(() => [] as WorldbookEntryRow[]);
      for (const row of entries) {
        try {
          const cleaned = stripSensitiveFields(row);
          const localExisting = await LocalRepo.getWorldbookEntry(row.id).catch(() => null);
          if (!localExisting) {
            await LocalRepo.createWorldbookEntry({
              worldbook_id: cleaned.worldbook_id,
              title: cleaned.title,
              content: cleaned.content,
              triggers: cleaned.triggers ?? [],
              priority: cleaned.priority ?? 100,
              category: cleaned.category ?? "general",
              scope: cleaned.scope ?? "global",
            }).catch(() => {});
            result.created++;
          } else {
            result.skipped++;
          }
        } catch { result.failed++; }
      }
      break;
    }

    case "memories": {
      const rows = await Repo.listAllActiveMemories(supabase!, userId).catch(() => [] as MemoryRow[]);
      for (const row of rows) {
        try {
          const cleaned = stripSensitiveFields(row);
          const localExisting = await LocalRepo.getMemory(row.id).catch(() => null);
          if (!localExisting) {
            await LocalRepo.createMemory({
              content: cleaned.content,
              memory_type: cleaned.memory_type ?? "event",
              title: cleaned.title ?? undefined,
              salience: cleaned.salience ?? 50,
              status: cleaned.status ?? "active",
              session_id: cleaned.session_id ?? undefined,
              character_id: cleaned.character_id ?? undefined,
              source_message_id: cleaned.source_message_id ?? undefined,
            }).catch(() => {});
            result.created++;
          } else {
            result.skipped++;
          }
        } catch { result.failed++; }
      }
      break;
    }

    case "sessions": {
      const rows = await Repo.listSessions(supabase!, userId).catch(() => [] as SessionRow[]);
      for (const row of rows) {
        try {
          const cleaned = stripSensitiveFields(row);
          const localExisting = await LocalRepo.getSession(row.id).catch(() => null);
          if (!localExisting) {
            await LocalRepo.createSession({
              title: cleaned.title,
              primary_character_id: cleaned.primary_character_id ?? undefined,
              system_prompt: cleaned.system_prompt ?? undefined,
              mode: cleaned.mode ?? "single",
            }).catch(() => {});
            result.created++;
          } else {
            result.skipped++;
          }
        } catch { result.failed++; }
      }
      break;
    }

    case "branches": {
      const sessions = await Repo.listSessions(supabase!, userId).catch(() => [] as SessionRow[]);
      for (const session of sessions) {
        try {
          await LocalRepo.ensureDefaultBranch(session.id).catch(() => {});
          result.created++;
        } catch { result.failed++; }
      }
      break;
    }

    case "session_participants": {
      const sessions = await Repo.listSessions(supabase!, userId).catch(() => [] as SessionRow[]);
      for (const session of sessions) {
        try {
          if (session.primary_character_id) {
            await LocalRepo.ensureSessionParticipant(session.id, session.primary_character_id).catch(() => {});
            result.created++;
          }
        } catch { result.failed++; }
      }
      break;
    }

    case "messages": {
      const sessions = await Repo.listSessions(supabase!, userId).catch(() => [] as SessionRow[]);
      for (const session of sessions) {
        try {
          const msgs = await Repo.listMessages(supabase!, session.id).catch(() => [] as MessageRow[]);
          for (const msg of msgs) {
            const cleaned = stripSensitiveFields(msg);
            const localExisting = await LocalRepo.getMessage(msg.id).catch(() => null);
            if (!localExisting) {
              await LocalRepo.createMessage({
                session_id: cleaned.session_id,
                branch_id: cleaned.branch_id,
                role: cleaned.role,
                content_text: cleaned.content_text,
                character_id: cleaned.character_id ?? undefined,
                content_json: cleaned.content_json ?? {},
                parent_id: cleaned.parent_id ?? undefined,
                edited_from_id: cleaned.edited_from_id ?? undefined,
                token_count: cleaned.token_count ?? undefined,
                hidden: cleaned.hidden ?? false,
              }).catch(() => {});
              result.created++;
            } else {
              result.skipped++;
            }
          }
        } catch { result.failed++; }
      }
      break;
    }

    case "message_revisions": {
      const sessions = await Repo.listSessions(supabase!, userId).catch(() => [] as SessionRow[]);
      for (const session of sessions) {
        try {
          const msgs = await Repo.listMessages(supabase!, session.id).catch(() => [] as MessageRow[]);
          for (const msg of msgs) {
            const revs = await Repo.loadMessageRevisions(supabase!, msg.id).catch(() => [] as MessageRevisionRow[]);
            for (const rev of revs) {
              const cleaned = stripSensitiveFields(rev);
              await LocalRepo.createMessageRevision({
                message_id: cleaned.message_id,
                revision_no: cleaned.revision_no,
                content_text: cleaned.content_text,
              }).catch(() => {});
              result.created++;
            }
          }
        } catch { result.failed++; }
      }
      break;
    }

    case "context_runs": {
      result.skipped++;
      result.details.push("context_runs 暂不参与下载同步");
      break;
    }
  }

  return result;
}

// ---- Helper ----

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function existingContentSame(a: any, b: any): boolean {
  const fieldsToCheck = ["name", "title", "content", "content_text", "card_json", "summary", "description"];
  for (const field of fieldsToCheck) {
    const av = JSON.stringify(a?.[field] ?? null);
    const bv = JSON.stringify(b?.[field] ?? null);
    if (av !== bv) return false;
  }
  return true;
}
