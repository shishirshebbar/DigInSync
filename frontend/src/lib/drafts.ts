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

export function useUnloadWarning(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    function warn(event: BeforeUnloadEvent) {
      event.preventDefault();
    }
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
}
