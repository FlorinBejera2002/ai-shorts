// Data shared by the Media and Audio panels: the .media manifest (durations and descriptions),
// the set of asset paths the composition uses, and copy-path feedback.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { buildProjectApiPath } from "../../utils/projectRouting";
import { copyTextToClipboard } from "../../utils/clipboard";
import { usePlayerStore } from "../../player/store/playerStore";
import type { CopyFeedback } from "./assetHelpers";

export interface ManifestRecord {
  description?: string;
  duration?: number;
  width?: number;
  height?: number;
}

/**
 * Project-relative asset paths referenced by composition elements. Element src comes from the
 * core runtime's `resolveNodeAssetUrl` (`new URL(raw, document.baseURI)`), so authored relative
 * paths arrive as absolute, percent-encoded URLs. This normalizes every shape to the bare
 * project-relative path the asset list uses:
 *   - absolute URL or /api/projects/<id>/preview/… → prefix stripped, %XX decoded
 *   - "./"-prefixed or bare relative → leading ./ or / stripped
 *   - ?query and #hash dropped
 * Pure — unit-tested.
 */
export function deriveUsedPaths(elements: Array<{ src?: string }>): Set<string> {
  const paths = new Set<string>();
  for (const el of elements) {
    if (!el.src) continue;
    let s = el.src;
    try {
      const u = new URL(s);
      s = u.pathname + (u.search ? u.search : "") + (u.hash ? u.hash : "");
    } catch {
      // Not an absolute URL: keep the relative path.
    }
    s = s
      .replace(/^\/api\/projects\/[^/]+\/preview\//, "")
      .replace(/^\.?\//, "")
      .split(/[?#]/)[0];
    try {
      s = decodeURIComponent(s);
    } catch {
      // Malformed encoding: use as-is.
    }
    if (s) paths.add(s);
  }
  return paths;
}

// Keyed by project and asset list, so an import that creates the manifest triggers a refetch.
const manifest404 = new Set<string>();

export function useMediaManifest(projectId: string, assets: string[]) {
  const [manifest, setManifest] = useState<Map<string, ManifestRecord>>(new Map());
  const assetsKey = assets.join("|");
  useEffect(() => {
    const missKey = `${projectId}|${assetsKey}`;
    if (manifest404.has(missKey)) return;
    let cancelled = false;
    fetch(buildProjectApiPath(projectId, `/preview/.media/manifest.jsonl`))
      .then((r) => {
        if (!r.ok) {
          manifest404.add(missKey);
          return "";
        }
        return r.text();
      })
      .then((text) => {
        if (cancelled || !text) return;
        const m = new Map<string, ManifestRecord>();
        for (const line of text.split("\n")) {
          if (!line.trim()) continue;
          try {
            const rec = JSON.parse(line);
            if (rec.path) m.set(rec.path, rec);
          } catch {
            /* skip malformed line */
          }
        }
        setManifest(m);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [projectId, assetsKey]);
  return manifest;
}

export function useUsedAssetPaths(): Set<string> {
  const elements = usePlayerStore((s) => s.elements);
  return useMemo(() => deriveUsedPaths(elements), [elements]);
}

export function useCopyFeedback() {
  const [copyFeedback, setCopyFeedback] = useState<CopyFeedback>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const copyPath = useCallback(async (path: string) => {
    const copied = await copyTextToClipboard(path);
    setCopyFeedback({ path, ok: copied });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopyFeedback(null), copied ? 1500 : 3000);
  }, []);
  return { copyFeedback, copyPath };
}

/** Drag-over state for a panel that accepts dropped files (St-Shell-MediaDrop). */
export function useFileDropZone(onFiles: (files: FileList) => void) {
  const [active, setActive] = useState(false);
  const depth = useRef(0);
  const hasFiles = (e: React.DragEvent) => Array.from(e.dataTransfer.types).includes("Files");
  const dropProps = {
    onDragEnter: (e: React.DragEvent) => {
      if (!hasFiles(e)) return;
      depth.current += 1;
      setActive(true);
    },
    onDragOver: (e: React.DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
    },
    onDragLeave: (e: React.DragEvent) => {
      if (!hasFiles(e)) return;
      depth.current = Math.max(0, depth.current - 1);
      if (depth.current === 0) setActive(false);
    },
    onDrop: (e: React.DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth.current = 0;
      setActive(false);
      if (e.dataTransfer.files.length) onFiles(e.dataTransfer.files);
    },
  };
  return { active, dropProps };
}
