import { useEffect, useMemo, useState } from "react";
import { t, useLocale } from "../../i18n/translate";
import { illustrationSrc } from "../ui";
import type { MessageKey } from "../../i18n/dictionary";
import { PanelMessage, PanelTag } from "./panelKit";

// Cross-project asset view ("Toate"): the global media-use cache (~/.media), fetched from
// /api/assets/global. Rows follow St-Shell-Library; loading and empty follow
// St-Shell-LibraryLoading and St-Shell-LibraryEmpty.

export interface GlobalAssetRecord {
  id?: string;
  type?: string;
  description?: string;
  entity?: string;
  sha?: string;
}

export interface GlobalAssetRow {
  id: string;
  type: string;
  label: string;
}

/**
 * Normalize global records into display rows, filtered by an optional query
 * (id / type / description / entity). Pure — unit-tested.
 */
export function globalAssetRows(records: GlobalAssetRecord[], query = ""): GlobalAssetRow[] {
  const q = query.trim().toLowerCase();
  return records
    .filter((r) =>
      !q
        ? true
        : [r.id, r.type, r.description, r.entity].some(
            (f) => f && String(f).toLowerCase().includes(q),
          ),
    )
    .map((r) => ({
      id: r.id ?? r.sha ?? "asset",
      type: r.type ?? "asset",
      label: r.description || r.entity || r.id || r.sha || "asset",
    }));
}

function kindKey(type: string): MessageKey {
  const value = type.toLowerCase();
  if (/image|img|photo|logo|icon/.test(value)) return "media.kindImage";
  if (/audio|music|bgm|sfx|voice/.test(value)) return "media.kindAudio";
  if (/video/.test(value)) return "media.kindVideo";
  if (/font/.test(value)) return "media.kindFont";
  return "media.kindAsset";
}

function SkeletonRow() {
  return (
    <div className="flex items-center gap-2.5" aria-hidden="true">
      <span className="h-10 w-14 flex-none rounded-[10px] bg-[var(--st-sub)]" />
      <span className="flex flex-1 flex-col gap-1.5">
        <span className="h-3 w-[70%] rounded-full bg-[var(--st-sub)]" />
        <span className="h-2.5 w-[40%] rounded-full bg-[var(--st-sub)]" />
      </span>
    </div>
  );
}

export function GlobalAssetsView({ searchQuery }: { searchQuery: string }) {
  useLocale();
  const [records, setRecords] = useState<GlobalAssetRecord[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/assets/global")
      .then((r) => (r.ok ? r.json() : { assets: [] }))
      .then((d) => {
        if (!cancelled) setRecords(Array.isArray(d.assets) ? d.assets : []);
      })
      .catch(() => {
        if (!cancelled) setRecords([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const rows = useMemo(() => globalAssetRows(records ?? [], searchQuery), [records, searchQuery]);

  if (records === null) {
    return (
      <div role="status" className="flex flex-col gap-3">
        <b className="text-[13px] font-semibold text-[var(--st-t2)]">{t("media.libraryLoading")}</b>
        <SkeletonRow />
        <SkeletonRow />
        <SkeletonRow />
      </div>
    );
  }
  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 text-center">
        <PanelMessage
          illustration={illustrationSrc("studio-media-empty")}
          title={t("media.libraryEmpty")}
        />
        <span className="-mt-4 text-xs text-[var(--st-t2)]">{t("media.libraryEmptyHint")}</span>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2.5">
      <span className="self-start">
        <PanelTag tone="neutral" height={24}>
          {t("media.libraryCount", { n: rows.length })}
        </PanelTag>
      </span>
      {rows.map((row) => (
        <div
          key={row.id}
          className="flex min-w-0 items-center gap-2.5"
          title={`${row.id} · ${row.type}`}
        >
          <span
            aria-hidden="true"
            className="flex h-10 w-14 flex-none items-center justify-center rounded-[10px] bg-[var(--st-sub)] text-[10px] font-semibold uppercase text-[var(--st-t2)]"
          >
            {row.type.slice(0, 4)}
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <b className="truncate text-[13px] font-semibold">{row.label}</b>
            <span className="text-xs text-[var(--st-t2)]">{t(kindKey(row.type))}</span>
          </span>
        </div>
      ))}
    </div>
  );
}
