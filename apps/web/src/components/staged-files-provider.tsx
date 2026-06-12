import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

export type StagedEntry = {
  file: File;
  path: string;
  content: string;
};

type StoredEntry = {
  path: string;
  content: string;
  type: string;
};

type StagedFilesContextValue = {
  stage: (entries: StagedEntry[]) => void;
  consume: () => StagedEntry[] | null;
  clear: () => void;
};

const StagedFilesContext = createContext<StagedFilesContextValue | null>(null);

const STORAGE_KEY = "fileconcat.staged.v1";

function persist(entries: StagedEntry[]) {
  if (typeof window === "undefined") return;
  try {
    const serial: StoredEntry[] = entries.map((e) => ({
      path: e.path,
      content: e.content,
      type: e.file.type || "text/plain",
    }));
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(serial));
  } catch {
    // sessionStorage may be unavailable (privacy modes); the in-memory ref still works.
  }
}

function readPersisted(): StagedEntry[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredEntry[];
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    return parsed.map((entry) => {
      const blob = new Blob([entry.content], { type: entry.type });
      const file = new File([blob], entry.path.split("/").pop() || entry.path, {
        type: entry.type,
      });
      return { file, path: entry.path, content: entry.content };
    });
  } catch {
    return null;
  }
}

function clearPersisted() {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignored
  }
}

export function StagedFilesProvider({ children }: { children: React.ReactNode }) {
  const ref = useRef<StagedEntry[] | null>(null);
  // Used only so React keeps the provider stable across remounts; the source of truth is ref.
  const [, force] = useState(0);

  useEffect(() => {
    if (ref.current === null) {
      const restored = readPersisted();
      if (restored) {
        ref.current = restored;
        force((n) => n + 1);
      }
    }
  }, []);

  const stage = useCallback((entries: StagedEntry[]) => {
    ref.current = entries;
    persist(entries);
    force((n) => n + 1);
  }, []);

  const consume = useCallback((): StagedEntry[] | null => {
    const current = ref.current;
    if (!current || current.length === 0) return null;
    ref.current = null;
    clearPersisted();
    force((n) => n + 1);
    return current;
  }, []);

  const clear = useCallback(() => {
    ref.current = null;
    clearPersisted();
    force((n) => n + 1);
  }, []);

  return (
    <StagedFilesContext.Provider value={{ stage, consume, clear }}>
      {children}
    </StagedFilesContext.Provider>
  );
}

export function useStagedFiles(): StagedFilesContextValue {
  const ctx = useContext(StagedFilesContext);
  if (!ctx) throw new Error("useStagedFiles must be used inside <StagedFilesProvider>");
  return ctx;
}
