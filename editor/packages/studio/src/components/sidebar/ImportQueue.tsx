// Uploads started from the Media / Audio panels (St-Import, St-Shell-Importing): one row per
// file while it uploads, then a "Gata" row for a few seconds. The upload API reports no byte
// progress, so the bar is indeterminate until the file is done.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { t, useLocale } from "../../i18n/translate";
import { getCategory } from "./assetHelpers";
import { PanelProgress, PanelSection, PanelTag } from "./panelKit";
import type { MessageKey } from "../../i18n/dictionary";

export interface ImportEntry {
  id: number;
  name: string;
  size: number;
  status: "uploading" | "done" | "failed";
}

const DONE_VISIBLE_MS = 4000;
/** How long to wait for the project's asset list to pick up a finished upload. */
const ASSET_SYNC_MS = 300;

/** Resolves to the project paths that were stored, or nothing when the caller cannot tell. */
export type ImportFilesHandler = (files: FileList) => void | Promise<string[] | void>;

function baseName(path: string): string {
  return path.split("/").pop() ?? path;
}

/**
 * True when one of the stored paths is the file, possibly renamed with the server's
 * collision suffix ("interviu (2).mp4").
 */
export function wasStored(name: string, stored: readonly string[]): boolean {
  const dot = name.indexOf(".", name.startsWith(".") ? 1 : 0);
  const base = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : "";
  return stored.some((path) => {
    const stem = baseName(path);
    if (stem === name) return true;
    if (!stem.startsWith(`${base} (`) || !stem.endsWith(ext)) return false;
    return /^\d+\)$/.test(stem.slice(base.length + 2, stem.length - ext.length));
  });
}

function wait(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

/**
 * Wraps an import callback so the panel can show which files are uploading. The upload API
 * swallows its own errors, so a file only counts as imported when it is among the returned
 * paths or, when the callback returns nothing, when it is new in the project's assets.
 */
export function useImportQueue(onImport?: ImportFilesHandler, assets?: readonly string[]) {
  const [entries, setEntries] = useState<ImportEntry[]>([]);
  const nextId = useRef(1);
  const timers = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  const assetsRef = useRef(assets);
  useLayoutEffect(() => {
    assetsRef.current = assets;
  }, [assets]);

  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const timer of pending) clearTimeout(timer);
    };
  }, []);

  const importFiles = useCallback(
    async (files: FileList) => {
      if (!onImport || files.length === 0) return;
      const batch = Array.from(files).map((file) => ({
        id: nextId.current++,
        name: file.name,
        size: file.size,
        status: "uploading" as const,
      }));
      const ids = new Set(batch.map((entry) => entry.id));
      setEntries((prev) => [...prev, ...batch]);
      const before = new Set(assetsRef.current ?? []);
      let stored: string[] | null = null;
      let failedAll = false;
      try {
        const result = await onImport(files);
        if (Array.isArray(result)) {
          stored = result;
        } else if (assetsRef.current) {
          await wait(ASSET_SYNC_MS);
          stored = (assetsRef.current ?? []).filter((path) => !before.has(path));
        }
      } catch {
        failedAll = true;
      }
      const statusOf = (name: string): ImportEntry["status"] =>
        failedAll || (stored && !wasStored(name, stored)) ? "failed" : "done";
      setEntries((prev) =>
        prev.map((e) => (ids.has(e.id) ? { ...e, status: statusOf(e.name) } : e)),
      );
      const timer = setTimeout(() => {
        timers.current.delete(timer);
        setEntries((prev) => prev.filter((e) => !ids.has(e.id)));
      }, DONE_VISIBLE_MS);
      timers.current.add(timer);
    },
    [onImport],
  );

  const importing = entries.some((e) => e.status === "uploading");
  return { entries, importing, importFiles };
}

const KIND_KEY: Record<string, MessageKey> = {
  audio: "media.kindAudio",
  images: "media.kindImage",
  video: "media.kindVideo",
  fonts: "media.kindFont",
};

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function ImportRow({ entry }: { entry: ImportEntry }) {
  const category = getCategory(entry.name);
  const kind = t(category ? KIND_KEY[category] : "media.kindAsset");
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex min-w-0 items-center gap-2.5">
        <span
          aria-hidden="true"
          className="h-10 w-14 flex-none rounded-[10px] bg-[var(--st-sub)]"
        />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <b className="truncate text-[13px] font-semibold">{entry.name}</b>
          <span className="text-xs text-[var(--st-t2)]">
            {formatSize(entry.size)} · {kind}
          </span>
        </span>
        {entry.status === "done" ? (
          <PanelTag tone="ok" icon="check" role="status">
            {t("media.importDone")}
          </PanelTag>
        ) : entry.status === "failed" ? (
          <PanelTag tone="danger" icon="warn" role="status">
            {t("elements.failed")}
          </PanelTag>
        ) : null}
      </div>
      {entry.status === "uploading" ? (
        <PanelProgress value={null} label={t("media.importProgress")} />
      ) : null}
    </div>
  );
}

function ImportGroup({ title, entries }: { title: string; entries: ImportEntry[] }) {
  if (entries.length === 0) return null;
  return (
    <PanelSection title={title}>
      <div className="flex flex-col gap-3">
        {entries.map((entry) => (
          <ImportRow key={entry.id} entry={entry} />
        ))}
      </div>
    </PanelSection>
  );
}

export function ImportQueue({ entries }: { entries: ImportEntry[] }) {
  useLocale();
  if (entries.length === 0) return null;
  const uploading = entries.filter((e) => e.status === "uploading");
  const done = entries.filter((e) => e.status === "done");
  const failed = entries.filter((e) => e.status === "failed");
  return (
    <>
      {uploading.length > 0 ? (
        <PanelSection title={t("media.importingSection", { n: uploading.length })}>
          <div className="flex flex-col gap-3">
            {uploading.map((entry) => (
              <ImportRow key={entry.id} entry={entry} />
            ))}
          </div>
        </PanelSection>
      ) : null}
      <ImportGroup title={t("media.importDone")} entries={done} />
      <ImportGroup title={t("elements.failed")} entries={failed} />
    </>
  );
}
