import { useState, useCallback, useEffect } from "react";
import { supabase } from "../../auth/supabaseClient";
import type { WorldbookRow, WorldbookEntryRow } from "../types/database";
import * as Repo from "../repositories/roleplayRepository";
import * as LocalRepo from "../repositories/localRoleplayRepository";
import * as LocalMirror from "../repositories/localMirror";
import type { PreparedEntry } from "../import/types";

interface UseWorldbooksReturn {
  worldbooks: WorldbookRow[];
  entries: WorldbookEntryRow[];
  loading: boolean;
  activeWorldbookId: string | null;
  setActiveWorldbookId: (id: string | null) => void;
  createWb: (name: string, desc?: string, tags?: string[]) => Promise<WorldbookRow | null>;
  updateWb: (id: string, name: string, desc?: string, tags?: string[]) => Promise<void>;
  deleteWb: (id: string) => Promise<void>;
  createEntry: (wbId: string, title: string, content: string, triggers?: string[], priority?: number, category?: string) => Promise<void>;
  importLorebook: (name: string, entries: PreparedEntry[]) => Promise<WorldbookRow | null>;
  updateEntry: (id: string, title: string, content: string, triggers?: string[], priority?: number, enabled?: boolean, category?: string) => Promise<void>;
  deleteEntry: (id: string) => Promise<void>;
  toggleEntryEnabled: (id: string, current: boolean) => Promise<void>;
  refresh: () => Promise<void>;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  entrySearch: string;
  setEntrySearch: (q: string) => void;
  filteredWbs: WorldbookRow[];
  filteredEntries: WorldbookEntryRow[];
}

export function useWorldbooks(userId: string | undefined, isDemo: boolean): UseWorldbooksReturn {
  const [worldbooks, setWorldbooks] = useState<WorldbookRow[]>([]);
  const [entries, setEntries] = useState<WorldbookEntryRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeWorldbookId, setActiveWorldbookId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [entrySearch, setEntrySearch] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const wbs = isDemo || !supabase || !userId
        ? await LocalRepo.listWorldbooks()
        : await Repo.listWorldbooks(supabase, userId);
      setWorldbooks(wbs);
      if (activeWorldbookId) {
        const ents = isDemo || !supabase || !userId
          ? await LocalRepo.listWorldbookEntries(activeWorldbookId)
          : await Repo.listWorldbookEntries(supabase, activeWorldbookId);
        setEntries(ents);
      }
    } catch { /* ignore */ } finally { setLoading(false); }
  }, [isDemo, userId, activeWorldbookId]);

  useEffect(() => { refresh(); }, [refresh]);

  const createWb = useCallback(async (name: string, desc?: string, tags?: string[]) => {
    const row = isDemo || !supabase || !userId
      ? await LocalRepo.createWorldbook({ name, description: desc, tags: tags ?? [] })
      : await Repo.createWorldbook(supabase, userId, { name, description: desc, tags: tags ?? [] });
    if (row) {
      setWorldbooks((prev) => [row, ...prev]);
      if (!isDemo && supabase && userId) LocalMirror.mirrorWorldbook(row);
    }
    return row;
  }, [isDemo, userId]);

  const updateWb = useCallback(async (id: string, name: string, desc?: string, tags?: string[]) => {
    const row = isDemo || !supabase || !userId
      ? await LocalRepo.updateWorldbook(id, { name, description: desc, tags })
      : await Repo.updateWorldbook(supabase, id, { name, description: desc, tags });
    if (row) {
      setWorldbooks((prev) => prev.map((w) => (w.id === id ? row : w)));
      if (!isDemo && supabase && userId) LocalMirror.mirrorWorldbook(row);
    }
  }, [isDemo, userId]);

  const deleteWb = useCallback(async (id: string) => {
    if (isDemo || !supabase || !userId) await LocalRepo.deleteWorldbook(id);
    else {
      await Repo.deleteWorldbook(supabase, id);
      const wb = worldbooks.find((w) => w.id === id);
      if (wb) LocalMirror.mirrorWorldbook({ ...wb, deleted_at: new Date().toISOString(), deleted_reason: "user_deleted", updated_at: new Date().toISOString() });
    }
    setWorldbooks((prev) => prev.filter((w) => w.id !== id));
    if (activeWorldbookId === id) { setActiveWorldbookId(null); setEntries([]); }
  }, [isDemo, userId, activeWorldbookId]);

  const loadEntries = useCallback(async (wbId: string) => {
    const ents = isDemo || !supabase || !userId
      ? await LocalRepo.listWorldbookEntries(wbId)
      : await Repo.listWorldbookEntries(supabase, wbId);
    setEntries(ents);
  }, [isDemo, userId]);

  const createEntry = useCallback(async (wbId: string, title: string, content: string, triggers?: string[], priority?: number, category?: string) => {
    if (isDemo || !supabase || !userId) {
      await LocalRepo.createWorldbookEntry({ worldbook_id: wbId, title, content, triggers: triggers ?? [], priority: priority ?? 100, category });
    } else {
      const row = await Repo.createWorldbookEntry(supabase, userId, { worldbook_id: wbId, title, content, triggers: triggers ?? [], priority: priority ?? 100, category });
      if (row) LocalMirror.mirrorWorldbookEntry(row);
    }
    await loadEntries(wbId);
  }, [isDemo, userId, loadEntries]);

  const importLorebook = useCallback(async (name: string, importedEntries: PreparedEntry[]) => {
    const wb = isDemo || !supabase || !userId
      ? await LocalRepo.createWorldbook({ name, tags: [] })
      : await Repo.createWorldbook(supabase, userId, { name, tags: [] });
    if (!wb) return null;
    if (!isDemo && supabase && userId) LocalMirror.mirrorWorldbook(wb);
    for (const e of importedEntries) {
      const input = {
        worldbook_id: wb.id,
        title: e.title,
        content: e.content,
        triggers: e.triggers,
        priority: e.priority,
        enabled: e.enabled,
        extensions: e.extensions,
      };
      if (isDemo || !supabase || !userId) {
        await LocalRepo.createWorldbookEntry(input);
      } else {
        const row = await Repo.createWorldbookEntry(supabase, userId, input);
        if (row) LocalMirror.mirrorWorldbookEntry(row);
      }
    }
    setWorldbooks((prev) => [wb, ...prev]);
    return wb;
  }, [isDemo, userId]);

  const updateEntry = useCallback(async (id: string, title: string, content: string, triggers?: string[], priority?: number, enabled?: boolean, category?: string) => {
    if (isDemo || !supabase || !userId) {
      await LocalRepo.updateWorldbookEntry(id, { title, content, triggers: triggers ?? [], priority, enabled, category });
    } else {
      const row = await Repo.updateWorldbookEntry(supabase, id, { title, content, triggers: triggers ?? [], priority, enabled, category });
      if (row) LocalMirror.mirrorWorldbookEntry(row);
    }
    if (activeWorldbookId) await loadEntries(activeWorldbookId);
  }, [isDemo, userId, activeWorldbookId, loadEntries]);

  const deleteEntry = useCallback(async (id: string) => {
    if (isDemo || !supabase || !userId) await LocalRepo.deleteWorldbookEntry(id);
    else {
      await Repo.deleteWorldbookEntry(supabase, id);
      const ent = entries.find((e) => e.id === id);
      if (ent) LocalMirror.mirrorWorldbookEntry({ ...ent, deleted_at: new Date().toISOString(), deleted_reason: "user_deleted", updated_at: new Date().toISOString() });
    }
    if (activeWorldbookId) await loadEntries(activeWorldbookId);
  }, [isDemo, userId, activeWorldbookId, loadEntries, entries]);

  const toggleEntryEnabled = useCallback(async (id: string, current: boolean) => {
    if (isDemo || !supabase || !userId) await LocalRepo.updateWorldbookEntry(id, { enabled: !current });
    else {
      const row = await Repo.updateWorldbookEntry(supabase, id, { enabled: !current });
      if (row) LocalMirror.mirrorWorldbookEntry(row);
    }
    if (activeWorldbookId) await loadEntries(activeWorldbookId);
  }, [isDemo, userId, activeWorldbookId, loadEntries]);

  const filteredWbs = worldbooks.filter((w) =>
    !searchQuery || w.name.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const filteredEntries = entries.filter((e) =>
    !entrySearch ||
    e.title.toLowerCase().includes(entrySearch.toLowerCase()) ||
    e.content.toLowerCase().includes(entrySearch.toLowerCase()),
  );

  return {
    worldbooks, entries, loading, activeWorldbookId, setActiveWorldbookId: (id) => { setActiveWorldbookId(id); if (id) loadEntries(id); else setEntries([]); },
    createWb, updateWb, deleteWb, createEntry, importLorebook, updateEntry, deleteEntry, toggleEntryEnabled, refresh,
    searchQuery, setSearchQuery, entrySearch, setEntrySearch,
    filteredWbs, filteredEntries,
  };
}
