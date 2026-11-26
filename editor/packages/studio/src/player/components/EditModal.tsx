import { useState, useCallback, useLayoutEffect, useMemo, useRef } from "react";
import { useMountEffect } from "../../hooks/useMountEffect";
import { usePlayerStore, type TimelineElement } from "../store/playerStore";
import { formatShortTime } from "./timelineDisplayTime";
import { TimelineIcon, type TimelineIconName } from "./TimelineIcon";
import { buildPromptCopyText, buildTimelineAgentPrompt } from "./timelineEditing";
import { copyTextToClipboard } from "../../utils/clipboard";
import { openAgent } from "../../components/agent/agentSession";
import { t, useLocale } from "../../i18n/translate";
import { getRangePopoverPosition, measureRangePopoverAnchor } from "./timelineRangePopover";

interface EditPopoverProps {
  rangeStart: number;
  rangeEnd: number;
  anchorX: number;
  anchorY: number;
  onClose: () => void;
}

function draftKey(start: number, end: number): string {
  return `hf-edit-draft:${start.toFixed(2)}:${end.toFixed(2)}`;
}

function readDraft(key: string): string {
  try {
    return sessionStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
}

function writeDraft(key: string, value: string): void {
  try {
    if (value) sessionStorage.setItem(key, value);
    else sessionStorage.removeItem(key);
  } catch {
    /* storage unavailable — draft persistence degrades gracefully */
  }
}

export function EditPopover({ rangeStart, rangeEnd, anchorX, anchorY, onClose }: EditPopoverProps) {
  useLocale();
  const elements = usePlayerStore((s) => s.elements);
  const start = Math.min(rangeStart, rangeEnd);
  const end = Math.max(rangeStart, rangeEnd);
  // Persist the typed prompt per range so Escape/outside-click doesn't destroy it.
  const storageKey = draftKey(start, end);
  const [prompt, setPromptState] = useState(() => readDraft(storageKey));
  const setPrompt = (value: string) => {
    setPromptState(value);
    writeDraft(storageKey, value);
  };
  const [copiedPromptOnly, setCopiedPromptOnly] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const popoverRef = useRef<HTMLDialogElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const elementsInRange = useMemo(() => {
    return elements.filter((el) => {
      const elEnd = el.start + el.duration;
      return el.start < end && elEnd > start;
    });
  }, [elements, start, end]);

  useMountEffect(() => {
    setTimeout(() => textareaRef.current?.focus(), 50);
  });

  useMountEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  });

  useMountEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    setTimeout(() => window.addEventListener("mousedown", handleClick), 100);
    return () => window.removeEventListener("mousedown", handleClick);
  });

  const buildClipboardText = useCallback(() => {
    return buildTimelineAgentPrompt({
      rangeStart: start,
      rangeEnd: end,
      elements: elementsInRange,
      prompt,
    });
  }, [start, end, elementsInRange, prompt]);

  // Hands the range prompt to Ana și Radu instead of the clipboard.
  const handleCopy = useCallback(() => {
    writeDraft(storageKey, "");
    openAgent({
      context: { prompt: buildClipboardText(), path: `${start.toFixed(2)}s – ${end.toFixed(2)}s` },
    });
    onClose();
  }, [buildClipboardText, onClose, storageKey, start, end]);

  // With nothing typed, "Copiază promptul" still copies the range and its element list.
  const handleCopyPrompt = useCallback(async () => {
    const promptText = buildPromptCopyText(prompt) || buildClipboardText();
    const copied = await copyTextToClipboard(promptText);
    if (!copied) {
      setCopyError(true);
      return;
    }
    setCopyError(false);
    setCopiedPromptOnly(true);
    setTimeout(() => {
      setCopiedPromptOnly(false);
    }, 800);
  }, [prompt, buildClipboardText]);

  // Anchored above the timeline card and centred on the range once the box is measured.
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const elementCount = elementsInRange.length;
  useLayoutEffect(() => {
    const popover = popoverRef.current;
    if (!popover) return;
    // Non-modal: show() keeps the rest of the editor interactive, unlike showModal().
    // It runs before measuring, because a closed dialog has no box.
    if (!popover.open) popover.show();
    const place = () =>
      setPosition(
        getRangePopoverPosition(measureRangePopoverAnchor(popover, { x: anchorX, y: anchorY })),
      );
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [anchorX, anchorY, elementCount, copyError]);

  const style: React.CSSProperties = {
    position: "fixed",
    left: position?.left ?? Math.max(8, Math.min(anchorX - 210, window.innerWidth - 428)),
    top: position?.top ?? Math.max(8, anchorY - 340),
    visibility: position ? undefined : "hidden",
    zIndex: 200,
    boxShadow: "var(--st-sh), 0 16px 40px color-mix(in srgb, var(--st-tx) 16%, transparent)",
  };

  // St-Timeline-Range: interval title and element count, the elements in range, the prompt,
  // then "Copiază promptul" and "Cere ajutor" (sends the range to Ana și Radu).
  return (
    // The class list resets the UA dialog box: no margin or border.
    <dialog
      ref={popoverRef}
      aria-label={t("timeline.rangeTitle", {
        start: formatShortTime(start),
        end: formatShortTime(end),
      })}
      data-timeline-range-prompt=""
      style={style}
      className="m-0 flex w-[420px] max-w-[calc(100vw-16px)] flex-col gap-3 rounded-[20px] border-0 bg-studio-surface p-4 text-studio-text"
    >
      <div className="flex items-center gap-2">
        <b className="min-w-0 flex-1 truncate text-sm font-semibold">
          {t("timeline.rangeTitle", { start: formatShortTime(start), end: formatShortTime(end) })}
        </b>
        <span className="inline-flex h-6 flex-none items-center rounded-sm px-2 text-xs font-semibold text-[var(--st-t2)] shadow-[inset_0_0_0_1px_var(--st-bd)]">
          {elementsInRange.length === 1
            ? t("timeline.rangeOneElement")
            : t("timeline.rangeElements", { n: elementsInRange.length })}
        </span>
        <button
          type="button"
          aria-label={t("common.close")}
          onClick={onClose}
          className="flex h-8 w-8 flex-none items-center justify-center rounded-full hover:bg-[var(--st-sub)]"
        >
          <TimelineIcon name="close" size={16} />
        </button>
      </div>
      {elementsInRange.length > 0 && (
        <section className="flex min-w-0 flex-col gap-2.5">
          <b className="text-[13px] font-semibold">{t("timeline.rangeElementsTitle")}</b>
          <div className="flex max-h-[198px] flex-col gap-1.5 overflow-y-auto">
            {elementsInRange.map((el) => (
              <div
                key={el.key ?? el.id}
                className="flex min-w-0 items-center gap-3 rounded-md bg-studio-surface px-3 py-2.5 shadow-[inset_0_0_0_1px_var(--st-bd)]"
              >
                <span className="flex h-9 w-9 flex-none items-center justify-center rounded-[10px] shadow-[inset_0_0_0_1px_var(--st-bd)]">
                  <TimelineIcon name={rangeElementIcon(el)} size={18} />
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <b className="truncate text-[13px] font-semibold">{el.label ?? el.id}</b>
                  <span className="truncate text-xs text-[var(--st-t2)]">
                    {t(rangeElementKind(el))} · {formatShortTime(el.duration)}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
      <textarea
        ref={textareaRef}
        value={prompt}
        aria-label={t("timeline.rangePlaceholder")}
        onChange={(e) => setPrompt(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            handleCopy();
          }
        }}
        placeholder={t("timeline.rangePlaceholder")}
        rows={1}
        className="min-h-11 w-full resize-none rounded-md bg-studio-surface px-3.5 py-3 text-[13px] font-medium leading-5 text-studio-text shadow-[inset_0_0_0_1px_var(--st-sbd)] outline-none placeholder:text-[var(--st-t3)] focus:shadow-[inset_0_0_0_1.5px_var(--st-tx)]"
      />
      {copyError && (
        <span role="alert" className="text-xs font-semibold text-[var(--st-danger)]">
          {t("timeline.rangeCopyFailed")}
        </span>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        <button
          type="button"
          onClick={handleCopyPrompt}
          className="inline-flex h-10 items-center gap-1.5 rounded-full px-4 text-[13px] font-semibold text-studio-text shadow-[inset_0_0_0_1.5px_var(--st-sbd)] hover:bg-[var(--st-sub)]"
        >
          <TimelineIcon name={copiedPromptOnly ? "check" : "copy"} size={14} />
          {copiedPromptOnly ? t("timeline.rangeCopied") : t("timeline.rangeCopy")}
        </button>
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex h-10 items-center gap-1.5 rounded-full bg-[var(--st-btn)] px-4 text-[13px] font-semibold text-[var(--st-on-btn)]"
        >
          <TimelineIcon name="send" size={16} />
          {t("agent.askHelp")}
          <span className="text-[11px] font-medium opacity-60">⌘↵</span>
        </button>
      </div>
    </dialog>
  );
}

type RangeElementKind = "audio" | "media" | "text";

function rangeElementKindOf(el: TimelineElement): RangeElementKind {
  const lower = el.tag.toLowerCase();
  if (lower === "audio") return "audio";
  // Source cuts are divs that play a sub-composition, like the track header reads them.
  if (lower === "video" || lower === "img" || el.compositionSrc || el.sourceWindow) return "media";
  return "text";
}

const RANGE_KIND_ICON: Record<RangeElementKind, TimelineIconName> = {
  audio: "music",
  media: "media",
  text: "text",
};

const RANGE_KIND_LABEL = {
  audio: "timeline.kindAudio",
  media: "timeline.kindVideo",
  text: "timeline.kindText",
} as const;

function rangeElementIcon(el: TimelineElement): TimelineIconName {
  return RANGE_KIND_ICON[rangeElementKindOf(el)];
}

function rangeElementKind(el: TimelineElement): (typeof RANGE_KIND_LABEL)[RangeElementKind] {
  return RANGE_KIND_LABEL[rangeElementKindOf(el)];
}
