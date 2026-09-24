"use client";

import { useCallback, useSyncExternalStore } from "react";
import type { Generation } from "./types";

const STORAGE_KEY = "cult-studio.reel.v1";
const EMPTY: Generation[] = [];
const listeners = new Set<() => void>();
let cache: Generation[] | null = null;

function readStorage(): Generation[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Generation[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeStorage(reel: Generation[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(reel));
  } catch {
    // Storage full or unavailable (private browsing, etc). Not fatal —
    // the reel just won't persist across reloads.
  }
}

function commit(next: Generation[]) {
  cache = next;
  writeStorage(next);
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): Generation[] {
  if (cache === null) cache = readStorage();
  return cache;
}

function getServerSnapshot(): Generation[] {
  return EMPTY;
}

/**
 * "My Reel" is a lightweight client-side save list — generations the
 * visitor has starred. It's deliberately not tied to an account: it's
 * per-browser, via localStorage, same as the rest of this demo's state.
 *
 * Reads go through useSyncExternalStore so the server-rendered shell
 * (always empty) and the post-hydration client value (read from
 * localStorage) reconcile without a hydration mismatch.
 */
export function useReel() {
  const reel = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const save = useCallback((generation: Generation) => {
    const current = getSnapshot();
    if (current.some((g) => g.id === generation.id)) return;
    commit([generation, ...current].slice(0, 60));
  }, []);

  const remove = useCallback((id: string) => {
    commit(getSnapshot().filter((g) => g.id !== id));
  }, []);

  const isSaved = useCallback(
    (id: string) => reel.some((g) => g.id === id),
    [reel]
  );

  return { reel, save, remove, isSaved };
}
