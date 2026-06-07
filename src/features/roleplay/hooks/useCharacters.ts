import { useState, useCallback, useEffect } from "react";
import { supabase } from "../../auth/supabaseClient";
import type { CharacterRow } from "../types/database";
import { packCharacterCard, type CharacterCardData } from "../utils/characterPrompt";
import * as Repo from "../repositories/roleplayRepository";
import * as LocalRepo from "../repositories/localRoleplayRepository";
import * as LocalMirror from "../repositories/localMirror";

interface UseCharactersReturn {
  characters: CharacterRow[];
  loading: boolean;
  error: string | null;
  create: (name: string, card: CharacterCardData, tags?: string[], avatarPath?: string) => Promise<CharacterRow | null>;
  update: (id: string, name: string, card: CharacterCardData, tags?: string[]) => Promise<CharacterRow | null>;
  remove: (id: string) => Promise<void>;
  archive: (id: string) => Promise<void>;
  toggleFavorite: (id: string, current: boolean) => Promise<void>;
  refresh: () => Promise<void>;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  filterTag: string | null;
  setFilterTag: (t: string | null) => void;
  filtered: CharacterRow[];
}

export function useCharacters(userId: string | undefined, isDemo: boolean): UseCharactersReturn {
  const [characters, setCharacters] = useState<CharacterRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterTag, setFilterTag] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const rows = isDemo || !supabase || !userId
        ? await LocalRepo.listActiveCharacters()
        : await Repo.listActiveCharacters(supabase, userId);
      setCharacters(rows);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [isDemo, userId]);

  useEffect(() => { refresh(); }, [refresh]);

  const create = useCallback(async (name: string, card: CharacterCardData, tags?: string[], avatarPath?: string) => {
    try {
      const payload = { name, card_json: packCharacterCard(card), tags: tags ?? [], ...(avatarPath ? { avatar_path: avatarPath } : {}) };
      const row = isDemo || !supabase || !userId
        ? await LocalRepo.createCharacter(payload)
        : await Repo.createCharacter(supabase, userId, payload);
      if (row) {
        setCharacters((prev) => [row, ...prev]);
        if (!isDemo && supabase && userId) LocalMirror.mirrorCharacter(row);
      }
      return row;
    } catch (e) {
      setError(String(e));
      return null;
    }
  }, [isDemo, userId]);

  const update = useCallback(async (id: string, name: string, card: CharacterCardData, tags?: string[]) => {
    try {
      const payload = { name, card_json: packCharacterCard(card), tags: tags ?? [] };
      const row = isDemo || !supabase || !userId
        ? await LocalRepo.updateCharacter(id, payload)
        : await Repo.updateCharacter(supabase, id, userId, payload);
      if (row) {
        setCharacters((prev) => prev.map((c) => (c.id === id ? row : c)));
        if (!isDemo && supabase && userId) LocalMirror.mirrorCharacter(row);
      }
      return row;
    } catch (e) {
      setError(String(e));
      return null;
    }
  }, [isDemo, userId]);

  const remove = useCallback(async (id: string) => {
    try {
      if (isDemo || !supabase || !userId) await LocalRepo.deleteCharacter(id);
      else {
        await Repo.deleteCharacter(supabase, id, userId);
        // Mirror soft-delete: fetch current row, apply deleted_at, write locally
        const char = characters.find((c) => c.id === id);
        if (char) LocalMirror.mirrorCharacter({ ...char, deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() });
      }
      setCharacters((prev) => prev.filter((c) => c.id !== id));
    } catch (e) {
      setError(String(e));
    }
  }, [isDemo, userId]);

  const archive = useCallback(async (id: string) => {
    try {
      if (isDemo || !supabase || !userId) await LocalRepo.archiveCharacter(id);
      else {
        await Repo.archiveCharacter(supabase, id, userId);
        const char = characters.find((c) => c.id === id);
        if (char) LocalMirror.mirrorCharacter({ ...char, archived_at: new Date().toISOString(), updated_at: new Date().toISOString() });
      }
      setCharacters((prev) => prev.map((c) => (c.id === id ? { ...c, archived_at: new Date().toISOString() } : c)));
    } catch (e) {
      setError(String(e));
    }
  }, [isDemo, userId]);

  const toggleFavorite = useCallback(async (id: string, current: boolean) => {
    try {
      const row = isDemo || !supabase || !userId
        ? await LocalRepo.updateCharacter(id, { is_favorite: !current })
        : await Repo.updateCharacter(supabase, id, userId, { is_favorite: !current });
      if (row) {
        setCharacters((prev) => prev.map((c) => (c.id === id ? row : c)));
        if (!isDemo && supabase && userId) LocalMirror.mirrorCharacter(row);
      }
    } catch (e) {
      setError(String(e));
    }
  }, [isDemo, userId]);

  // Filtering
  const filtered = characters.filter((c) => {
    if (c.deleted_at || c.archived_at) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matchesName = c.name.toLowerCase().includes(q);
      const matchesSummary = c.summary?.toLowerCase().includes(q);
      if (!matchesName && !matchesSummary) return false;
    }
    if (filterTag && !c.tags?.includes(filterTag)) return false;
    return true;
  });

  return {
    characters, loading, error,
    create, update, remove, archive, toggleFavorite, refresh,
    searchQuery, setSearchQuery,
    filterTag, setFilterTag,
    filtered,
  };
}
