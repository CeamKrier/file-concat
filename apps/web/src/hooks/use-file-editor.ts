import { useCallback, useEffect, useState } from "react";

import type { ContentEntry } from "./use-file-ingestion";

export type EditorState = {
  path: string;
  draft: string;
  dirty: boolean;
} | null;

export interface FileEditor {
  state: EditorState;
  start: (path: string) => void;
  cancel: () => void;
  change: (value: string) => void;
  save: () => void;
  isEditing: (path: string) => boolean;
  isDirty: (path: string) => boolean;
  draftFor: (path: string) => string | undefined;
}

/**
 * Single-file editor state. We only ever edit one file at a time, so the
 * whole editor collapses to one record (`{ path, draft, dirty }`) instead
 * of three parallel maps. `save` calls back into the canonical entry store
 * via `setEntryContent` and clears the local draft.
 */
export function useFileEditor(
  entries: ContentEntry[],
  setEntryContent: (path: string, content: string) => void,
): FileEditor {
  const [state, setState] = useState<EditorState>(null);

  const start = useCallback(
    (path: string) => {
      const entry = entries.find((e) => e.path === path);
      if (!entry) return;
      setState({ path, draft: entry.content, dirty: false });
    },
    [entries],
  );

  const cancel = useCallback(() => setState(null), []);

  const change = useCallback((value: string) => {
    setState((prev) => (prev ? { ...prev, draft: value, dirty: true } : prev));
  }, []);

  const save = useCallback(() => {
    setState((prev) => {
      if (!prev) return prev;
      setEntryContent(prev.path, prev.draft);
      return null;
    });
  }, [setEntryContent]);

  useEffect(() => {
    if (!state?.dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [state?.dirty]);

  const isEditing = useCallback((path: string) => state?.path === path, [state]);
  const isDirty = useCallback(
    (path: string) => (state?.path === path ? state.dirty : false),
    [state],
  );
  const draftFor = useCallback(
    (path: string) => (state?.path === path ? state.draft : undefined),
    [state],
  );

  return { state, start, cancel, change, save, isEditing, isDirty, draftFor };
}
