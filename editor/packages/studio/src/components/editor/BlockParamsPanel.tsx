import { memo, useCallback, useEffect, useRef, useState } from "react";
import type { BlockParam } from "@hyperframes/core/registry";
import { useFileManagerContextOptional } from "../../contexts/FileManagerContext";
import { useStudioPlaybackContext } from "../../contexts/StudioContext";
import { trackBlockParamCommit } from "../../telemetry/events";
import { t, useLocale } from "../../i18n/translate";
import { InspectorRange } from "./inspectorControls";

interface BlockParamsPanelProps {
  blockName: string;
  blockTitle: string;
  params: BlockParam[];
  compositionPath: string;
  onClose: () => void;
}

type CommitState = { tone: "idle" | "saving" | "saved" | "error"; message?: string };

export const BlockParamsPanel = memo(function BlockParamsPanel({
  blockName,
  blockTitle,
  params,
  compositionPath,
  onClose,
}: BlockParamsPanelProps) {
  useLocale();
  const fileManager = useFileManagerContextOptional();
  const { setRefreshKey } = useStudioPlaybackContext();
  const [values, setValues] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const p of params) {
      initial[p.key] = p.default;
    }
    return initial;
  });
  // Last value actually written to the block file per param — the literal we
  // substitute when the next commit rewrites the file.
  const appliedRef = useRef<Record<string, string>>(
    Object.fromEntries(params.map((p) => [p.key, p.default])),
  );
  const [commitState, setCommitState] = useState<CommitState>({ tone: "idle" });
  // Per-param debounce timers: a single shared timer would let a second
  // param's edit silently cancel the first param's pending commit.
  const commitTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const commitParamNow = useCallback(
    async (key: string, nextValue: string) => {
      if (!fileManager) return;
      const previous = appliedRef.current[key];
      if (previous === undefined || previous === nextValue || !nextValue.trim()) return;
      setCommitState({ tone: "saving" });
      try {
        const content = await fileManager.readProjectFile(compositionPath);
        // Token-boundary match so "#0c0c0c" never rewrites part of "#0c0c0cff".
        const matcher = new RegExp(
          `(?<![-\\w#])${previous.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![-\\w])`,
          "g",
        );
        const matches = content.match(matcher)?.length ?? 0;
        if (matches === 0) {
          setCommitState({
            tone: "error",
            message: `Couldn't find the current value in ${compositionPath} — it may have been edited by hand.`,
          });
          trackBlockParamCommit({ tone: "error", blockName, key });
          return;
        }
        // The panel maps a param to a bare literal, with no per-occurrence
        // binding metadata. At the string level it cannot tell "both of these
        // belong to this param" from "one is unrelated adjacent content" (a
        // sibling block, a decoration, a comment). A blind replace of a literal
        // that appears more than once could silently mutate that unrelated
        // content — so refuse and tell the user to disambiguate by hand. Only a
        // unique single occurrence is safe to rewrite automatically.
        if (matches > 1) {
          setCommitState({
            tone: "error",
            message: `"${previous}" appears ${matches}× in ${compositionPath} — the panel can't tell which one belongs to this parameter, so it won't risk changing unrelated content. Edit the file directly to disambiguate.`,
          });
          trackBlockParamCommit({ tone: "error", blockName, key });
          return;
        }
        await fileManager.writeProjectFile(compositionPath, content.replace(matcher, nextValue));
        appliedRef.current[key] = nextValue;
        setCommitState({ tone: "saved" });
        trackBlockParamCommit({ tone: "saved", blockName, key });
        setRefreshKey((k) => k + 1);
      } catch {
        setCommitState({ tone: "error", message: "Couldn't save the block file. Retry?" });
        trackBlockParamCommit({ tone: "error", blockName, key });
      }
    },
    [fileManager, compositionPath, setRefreshKey, blockName],
  );

  // Commits are serialized: two params committing concurrently would each
  // read-modify-write the same file and the second write would drop the first.
  const commitChainRef = useRef<Promise<void>>(Promise.resolve());
  const commitParam = useCallback(
    (key: string, nextValue: string) => {
      const run = commitChainRef.current.then(() => commitParamNow(key, nextValue));
      commitChainRef.current = run.catch(() => undefined);
      return run;
    },
    [commitParamNow],
  );

  const handleChange = useCallback(
    (key: string, value: string) => {
      setValues((prev) => ({ ...prev, [key]: value }));
      const timers = commitTimersRef.current;
      const existing = timers.get(key);
      if (existing) clearTimeout(existing);
      timers.set(
        key,
        setTimeout(() => {
          timers.delete(key);
          void commitParam(key, value);
        }, 300),
      );
    },
    [commitParam],
  );

  // Flush (not discard) pending commits on unmount so closing the panel
  // within the debounce window doesn't silently drop the last edit.
  const flushRef = useRef<() => void>(() => {});
  flushRef.current = () => {
    for (const [key, timer] of commitTimersRef.current) {
      clearTimeout(timer);
      const value = values[key];
      if (value !== undefined) void commitParam(key, value);
    }
    commitTimersRef.current.clear();
  };
  useEffect(() => () => flushRef.current(), []);

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 pb-2">
        <div className="flex min-h-8 items-center justify-between gap-2">
          <h3 className="min-w-0 truncate text-[13px] font-semibold text-studio-text">
            {blockTitle}
          </h3>
          {commitState.tone === "saving" && (
            <span
              role="status"
              className="inline-flex h-7 flex-none items-center rounded-full px-2.5 text-xs font-semibold text-studio-text shadow-[inset_0_0_0_1px_var(--st-bd)]"
            >
              {t("block.saving")}
            </span>
          )}
          {commitState.tone === "saved" && (
            <span
              role="status"
              title={t("block.savedTo", { path: compositionPath })}
              className="inline-flex h-7 flex-none items-center rounded-full bg-[var(--st-ok-bg)] px-2.5 text-xs font-semibold text-[var(--st-ok)]"
            >
              {t("block.saved")}
            </span>
          )}
        </div>
        {params.length === 0 && (
          <p className="text-[13px] font-medium text-studio-muted">{t("block.none")}</p>
        )}
        {!fileManager && params.length > 0 && (
          <p role="status" className="text-xs font-medium text-[var(--st-warn-text)]">
            {t("block.readOnly")}
          </p>
        )}
        {params.map((param) => (
          <ParamControl
            key={param.key}
            param={param}
            value={values[param.key] ?? param.default}
            disabled={!fileManager}
            onChange={(v) => handleChange(param.key, v)}
          />
        ))}
        {commitState.tone === "error" && (
          <p className="text-xs font-medium text-studio-danger" role="alert">
            {commitState.message}
          </p>
        )}
      </div>
      <div className="flex flex-none justify-center px-4 pt-2 pb-4">
        <button
          type="button"
          onClick={onClose}
          aria-label={t("block.close")}
          className="inline-flex h-11 items-center rounded-full px-5 text-[13px] font-semibold text-studio-text hover:bg-[var(--st-sub)]"
        >
          {t("block.closeShort")}
        </button>
      </div>
    </div>
  );
});

const FIELD_CLASS =
  "h-11 w-full rounded-md bg-studio-surface px-3.5 text-[13px] font-medium text-studio-text shadow-[inset_0_0_0_1.5px_var(--st-sbd)] outline-none focus:shadow-[inset_0_0_0_2px_var(--st-btn)] disabled:cursor-not-allowed disabled:opacity-45";

function ParamControl({
  param,
  value,
  disabled,
  onChange,
}: {
  param: BlockParam;
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2 text-[13px]">
        <label className="font-medium text-studio-text">{param.label}</label>
        {param.type === "number" && (
          <span className="font-semibold tabular-nums text-studio-muted">{value}</span>
        )}
      </div>

      {param.type === "color" && (
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={value}
            disabled={disabled}
            aria-label={`${param.label} color`}
            onChange={(e) => onChange(e.target.value)}
            className="h-11 w-11 flex-none cursor-pointer rounded-md bg-transparent p-1 shadow-[inset_0_0_0_1.5px_var(--st-sbd)] disabled:cursor-not-allowed disabled:opacity-45"
          />
          <input
            type="text"
            value={value}
            disabled={disabled}
            aria-label={`${param.label} value`}
            onChange={(e) => onChange(e.target.value)}
            className={`${FIELD_CLASS} flex-1 tabular-nums`}
          />
        </div>
      )}

      {param.type === "number" && (
        <InspectorRange
          ariaLabel={param.label}
          min={param.min ?? 0}
          max={param.max ?? 100}
          step={param.step ?? 1}
          value={Number(value)}
          disabled={disabled}
          onChange={(next) => onChange(String(next))}
        />
      )}

      {param.type === "text" && (
        <input
          type="text"
          value={value}
          disabled={disabled}
          aria-label={param.label}
          onChange={(e) => onChange(e.target.value)}
          className={FIELD_CLASS}
        />
      )}

      {param.type === "select" && param.options && (
        <select
          value={value}
          disabled={disabled}
          aria-label={param.label}
          onChange={(e) => onChange(e.target.value)}
          className={`${FIELD_CLASS} appearance-none`}
        >
          {param.options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
