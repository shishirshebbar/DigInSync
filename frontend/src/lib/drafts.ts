"use client";

import {
  useCallback,
  useEffect,
  useState,
  useSyncExternalStore,
  type Dispatch,
  type SetStateAction,
} from "react";

// Visit-only drafts. No browser storage, autosave, or server-side draft persistence.
const drafts = new Map<string, unknown>();
const listeners = new Map<string, Set<() => void>>();
const dirtyDrafts = new Set<string>();

function warnBeforeUnload(event: BeforeUnloadEvent) {
  event.preventDefault();
}

export function setDraftDirty(key: string, dirty: boolean) {
  if (typeof window === "undefined") return;
  if (dirty) dirtyDrafts.add(key);
  else dirtyDrafts.delete(key);
  if (dirtyDrafts.size) window.addEventListener("beforeunload", warnBeforeUnload);
  else window.removeEventListener("beforeunload", warnBeforeUnload);
}
const subscribeHydration = () => () => {};
export function useHydrated() {
  return useSyncExternalStore(
    subscribeHydration,
    () => true,
    () => false,
  );
}

export function useMemoryState<T>(key: string, initial: T): [T, Dispatch<SetStateAction<T>>] {
  const [initialValue] = useState(initial);
  const subscribe = useCallback(
    (listener: () => void) => {
      if (!listeners.has(key)) listeners.set(key, new Set());
      listeners.get(key)!.add(listener);
      return () => {
        listeners.get(key)?.delete(listener);
      };
    },
    [key],
  );
  const value = useSyncExternalStore(
    subscribe,
    () => (drafts.has(key) ? (drafts.get(key) as T) : initialValue),
    () => initialValue,
  );
  const update = useCallback(
    (next: SetStateAction<T>) => {
      const previous = drafts.has(key) ? (drafts.get(key) as T) : initialValue;
      drafts.set(key, typeof next === "function" ? (next as (value: T) => T)(previous) : next);
      listeners.get(key)?.forEach((listener) => listener());
    },
    [key, initialValue],
  );
  return [value, update];
}

export function clearDraft(key: string) {
  drafts.delete(key);
  listeners.get(key)?.forEach((listener) => listener());
}

export function useUnloadWarning(key: string, dirty: boolean) {
  useEffect(() => {
    setDraftDirty(key, dirty);
  }, [key, dirty]);
}
