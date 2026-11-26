// Project title shown in the top bar. Starts from the server's project title and keeps the
// user's edit for this project in local storage (the Studio server has no rename route yet).
import { useCallback, useEffect, useState } from "react";
import { safeLocalStorage } from "../../utils/safeStorage";

export const PROJECT_TITLE_MAX = 120;
const STORAGE_PREFIX = "sneepcut:studio-title:";

/** Trimmed title when it is 1 to 120 characters, otherwise null. */
export function normalizeProjectTitle(value: string): string | null {
  const title = value.replace(/\s+/g, " ").trim();
  if (!title || title.length > PROJECT_TITLE_MAX) return null;
  return title;
}

function readStoredTitle(projectId: string): string | null {
  try {
    return safeLocalStorage()?.getItem(STORAGE_PREFIX + projectId) ?? null;
  } catch {
    return null;
  }
}

function writeStoredTitle(projectId: string, title: string) {
  try {
    safeLocalStorage()?.setItem(STORAGE_PREFIX + projectId, title);
  } catch {
    /* storage unavailable: the title lasts for this page only */
  }
}

interface ProjectListResponse {
  projects?: Array<{ id?: unknown; title?: unknown }>;
}

async function fetchServerTitle(projectId: string, signal: AbortSignal): Promise<string | null> {
  const response = await fetch("/api/projects", { signal });
  if (!response.ok) return null;
  const data = (await response.json()) as ProjectListResponse;
  const match = data.projects?.find((project) => project.id === projectId);
  return typeof match?.title === "string" ? match.title : null;
}

export function useProjectTitle(projectId: string) {
  const [title, setTitle] = useState(() => readStoredTitle(projectId) ?? projectId);

  // eslint-disable-next-line no-restricted-syntax
  useEffect(() => {
    const stored = readStoredTitle(projectId);
    setTitle(stored ?? projectId);
    if (stored) return;
    const controller = new AbortController();
    fetchServerTitle(projectId, controller.signal)
      .then((serverTitle) => {
        if (!controller.signal.aborted && serverTitle) setTitle(serverTitle);
      })
      .catch(() => {});
    return () => controller.abort();
  }, [projectId]);

  /** Saves a valid title and returns it, or returns null and keeps the current one. */
  const commitTitle = useCallback(
    (value: string): string | null => {
      const next = normalizeProjectTitle(value);
      if (!next) return null;
      setTitle(next);
      writeStoredTitle(projectId, next);
      return next;
    },
    [projectId],
  );

  return { title, commitTitle };
}
