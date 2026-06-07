import { logger } from "../../../shared/lib/logger";
/**
 * LocalMirror — 登录态云端写入成功后，异步同步写一份到本地 IndexedDB。
 *
 * 原则：
 * - 云端写入成功后调用，fire-and-forget。
 * - 镜像写入失败只 console.warn，不抛异常，不阻塞云端主流程。
 * - 不保存 API Key、hosted_encrypted 凭据、secret 字段。
 * - 不创建循环依赖（只依赖 localRoleplayRepository 的底层存储能力）。
 */

import type {
  BranchRow,
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

// 直接使用 IndexedDB 底层操作，避免通过 LocalRepo 的 getLocalUserId 逻辑
// LocalMirror 保持云数据原样存储，使用云端的 user_id

const LOCAL_DB_NAME = "roleplay-tavern-local";
const LOCAL_DB_VERSION = 1;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(LOCAL_DB_NAME, LOCAL_DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      const stores = [
        "profiles", "characters", "sessions", "branches",
        "session_participants", "messages", "message_revisions",
        "prompt_templates", "worldbooks", "worldbook_entries",
        "memories", "context_runs",
      ];
      stores.forEach((store) => {
        if (!db.objectStoreNames.contains(store)) {
          db.createObjectStore(store, { keyPath: "id" });
        }
      });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("open local db failed"));
  });
}

async function putRow<T extends { id: string }>(storeName: string, row: T): Promise<void> {
  const db = await openDb();
  try {
    const tx = db.transaction(storeName, "readwrite");
    const store = tx.objectStore(storeName);
    await new Promise<void>((resolve, reject) => {
      const req = store.put(row);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error ?? new Error("put failed"));
    });
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("tx failed"));
      tx.onabort = () => reject(tx.error ?? new Error("tx aborted"));
    });
  } finally {
    db.close();
  }
}

function mirror<T extends { id: string }>(store: string, row: T, label: string): void {
  putRow(store, row).catch((e) => {
    logger.warn(`[LocalMirror] ${label} mirror failed:`, e);
  });
}

// ---- Characters ----

export function mirrorCharacter(row: CharacterRow): void {
  mirror("characters", row, "character");
}

// ---- Prompt Templates ----

export function mirrorTemplate(row: PromptTemplateRow): void {
  mirror("prompt_templates", row, "template");
}

// ---- Worldbooks ----

export function mirrorWorldbook(row: WorldbookRow): void {
  mirror("worldbooks", row, "worldbook");
}

export function mirrorWorldbookEntry(row: WorldbookEntryRow): void {
  mirror("worldbook_entries", row, "worldbook_entry");
}

// ---- Memories ----

export function mirrorMemory(row: MemoryRow): void {
  mirror("memories", row, "memory");
}

// ---- Sessions ----

export function mirrorSession(row: SessionRow): void {
  mirror("sessions", row, "session");
}

// ---- Session Participants ----

export function mirrorSessionParticipant(row: SessionParticipantRow): void {
  mirror("session_participants", row, "session_participant");
}

// ---- Branches ----

export function mirrorBranch(row: BranchRow): void {
  mirror("branches", row, "branch");
}

// ---- Messages ----

export function mirrorMessage(row: MessageRow): void {
  mirror("messages", row, "message");
}

export function mirrorMessageDeletion(id: string, deletedAt: string, reason?: string): void {
  // Read existing message, apply deletion, put back
  openDb().then((db) => {
    try {
      const tx = db.transaction("messages", "readwrite");
      const store = tx.objectStore("messages");
      const getReq = store.get(id);
      getReq.onsuccess = () => {
        const existing = getReq.result as MessageRow | undefined;
        if (existing) {
          store.put({ ...existing, deleted_at: deletedAt, deleted_reason: reason ?? null });
        }
      };
    } finally {
      db.close();
    }
  }).catch((e) => {
    logger.warn("[LocalMirror] message deletion mirror failed:", e);
  });
}

// ---- Message Revisions ----

export function mirrorMessageRevision(row: MessageRevisionRow): void {
  mirror("message_revisions", row, "message_revision");
}

// ---- Context Runs ----

export function mirrorContextRun(row: ContextRunRow): void {
  mirror("context_runs", row, "context_run");
}
