// "Scurtături și instrumente": the timeline's keyboard sheet with the work area (in/out readout
// and clear buttons) and frame jump. A 28px dialog on desktop, a bottom sheet on a phone.
import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { t, useLocale } from "../../i18n/translate";
import { usePlayerStore } from "../../player";
import { frameToSeconds } from "../../player/lib/time";
import { formatShortTime } from "../../player/components/timelineDisplayTime";
import { TimelineIcon } from "../../player/components/TimelineIcon";
import { Segment } from "../ui";
import { useDialogBehavior } from "../ui/useDialogBehavior";
import {
  CANVAS,
  CROP,
  EDITING,
  GESTURES,
  KEYFRAMES,
  NAVIGATION,
  PANELS,
  PLAYBACK,
  TOOLS,
  WORK_AREA_KEYS,
  shortcutKeyLabel,
  type ShortcutGroup,
  type ShortcutKey,
  type ShortcutRow,
} from "./TimelineToolbarShortcutData";

type ShortcutView = "basic" | "advanced";

function KeyCaps({ keys }: { keys: readonly ShortcutKey[] }) {
  return (
    <span className="inline-flex flex-none gap-1">
      {keys.map((key) => (
        <kbd
          key={shortcutKeyLabel(key)}
          className="inline-flex h-6 min-w-[26px] items-center justify-center whitespace-nowrap rounded-sm bg-[var(--st-sub)] px-[7px] font-sans text-xs font-semibold tabular-nums text-[var(--st-tx)]"
        >
          {shortcutKeyLabel(key)}
        </kbd>
      ))}
    </span>
  );
}

function ShortcutRows({ rows }: { rows: readonly ShortcutRow[] }) {
  return (
    <div className="flex flex-col gap-1.5">
      {rows.map(([label, keys]) => (
        <div
          key={`${label}-${keys.map(shortcutKeyLabel).join("")}`}
          className="flex min-h-[30px] items-center justify-between gap-3"
        >
          <span className="text-[13px] font-medium text-[var(--st-tx)]">{t(label)}</span>
          <KeyCaps keys={keys} />
        </div>
      ))}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex min-w-0 flex-col gap-2.5">
      <h3 className="text-[13px] font-semibold text-[var(--st-tx)]">{title}</h3>
      {children}
    </section>
  );
}

function GroupSection({ group }: { group: ShortcutGroup }) {
  return (
    <Section title={t(group.title)}>
      <ShortcutRows rows={group.rows} />
    </Section>
  );
}

function WorkAreaPoint({
  label,
  value,
  clearLabel,
  onClear,
}: {
  label: string;
  value: number | null;
  clearLabel: string;
  onClear: () => void;
}) {
  return (
    <div className="flex min-h-8 items-center justify-between gap-3">
      <span className="text-[13px] font-medium text-[var(--st-tx)]">{label}</span>
      <span className="flex items-center gap-1.5">
        <span className="text-[13px] font-semibold tabular-nums text-[var(--st-tx)]">
          {value === null ? t("timeline.sc.notSet") : formatShortTime(value)}
        </span>
        <button
          type="button"
          aria-label={clearLabel}
          title={clearLabel}
          disabled={value === null}
          onClick={onClear}
          className="flex h-7 w-7 items-center justify-center rounded-full text-[var(--st-tx)] hover:bg-[var(--st-sub)] disabled:opacity-[.38]"
        >
          <TimelineIcon name="close" size={14} />
        </button>
      </span>
    </div>
  );
}

function WorkAreaSection({ compact }: { compact: boolean }) {
  const inPoint = usePlayerStore((s) => s.inPoint);
  const outPoint = usePlayerStore((s) => s.outPoint);
  const setInPoint = usePlayerStore((s) => s.setInPoint);
  const setOutPoint = usePlayerStore((s) => s.setOutPoint);
  return (
    <Section title={t("timeline.sc.workArea")}>
      <div className="flex flex-col gap-1.5">
        <WorkAreaPoint
          label={t("timeline.sc.in")}
          value={inPoint}
          clearLabel={t("timeline.sc.clearIn")}
          onClear={() => setInPoint(null)}
        />
        <WorkAreaPoint
          label={t("timeline.sc.out")}
          value={outPoint}
          clearLabel={t("timeline.sc.clearOut")}
          onClear={() => setOutPoint(null)}
        />
      </div>
      <ShortcutRows rows={compact ? [WORK_AREA_KEYS[0]!, WORK_AREA_KEYS[2]!] : WORK_AREA_KEYS} />
    </Section>
  );
}

function JumpSection({ onSeek }: { onSeek?: (time: number) => void }) {
  const duration = usePlayerStore((s) => s.duration);
  const [frame, setFrame] = useState("");
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const value = Number.parseInt(frame, 10);
    if (!onSeek || !Number.isFinite(value) || duration <= 0) return;
    onSeek(Math.min(duration, frameToSeconds(Math.max(0, value))));
  };
  return (
    <Section title={t("timeline.sc.jump")}>
      <form className="flex items-center gap-2" onSubmit={submit}>
        <input
          aria-label={t("timeline.sc.jump")}
          placeholder={t("timeline.sc.jumpPlaceholder")}
          inputMode="numeric"
          value={frame}
          onChange={(event) => setFrame(event.target.value.replace(/[^0-9]/g, ""))}
          className="h-10 min-w-0 flex-1 rounded-md bg-[var(--st-sf)] px-3.5 text-[13px] tabular-nums text-[var(--st-tx)] shadow-[inset_0_0_0_1px_var(--st-sbd)] outline-none focus:shadow-[inset_0_0_0_1.5px_var(--st-tx)]"
        />
        <button
          type="submit"
          aria-label={t("timeline.sc.goLabel")}
          className="h-10 flex-none rounded-full px-4 text-[13px] font-semibold text-[var(--st-tx)] shadow-[inset_0_0_0_1.5px_var(--st-sbd)] hover:bg-[var(--st-sub)]"
        >
          {t("timeline.sc.go")}
        </button>
      </form>
    </Section>
  );
}

function shortcutColumns(view: ShortcutView, onSeek?: (time: number) => void): ReactNode[] {
  if (view === "advanced") {
    return [
      <GroupSection key="kf" group={KEYFRAMES} />,
      <GroupSection key="nav" group={NAVIGATION} />,
      <div key="g" className="flex flex-col gap-[22px]">
        <GroupSection group={GESTURES} />
        <GroupSection group={CANVAS} />
        <GroupSection group={CROP} />
      </div>,
    ];
  }
  return [
    <div key="play" className="flex flex-col gap-[22px]">
      <GroupSection group={PLAYBACK} />
      <GroupSection group={PANELS} />
    </div>,
    <div key="edit" className="flex flex-col gap-[22px]">
      <GroupSection group={EDITING} />
      <GroupSection group={TOOLS} />
    </div>,
    <div key="work" className="flex flex-col gap-[22px]">
      <WorkAreaSection compact={false} />
      <JumpSection onSeek={onSeek} />
    </div>,
  ];
}

export interface TimelineShortcutsSheetProps {
  open: boolean;
  phone: boolean;
  onClose: () => void;
  onSeek?: (time: number) => void;
}

export function TimelineShortcutsSheet({
  open,
  phone,
  onClose,
  onSeek,
}: TimelineShortcutsSheetProps) {
  useLocale();
  const containerRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<ShortcutView>("basic");
  useDialogBehavior({ open, onClose, containerRef });
  if (!open) return null;
  const viewSwitch = (
    <Segment<ShortcutView>
      label={t("timeline.sc.view")}
      options={[
        { value: "basic", label: t("timeline.sc.basic") },
        { value: "advanced", label: t("timeline.sc.advanced") },
      ]}
      value={view}
      onChange={setView}
    />
  );
  const close = (
    <button
      type="button"
      aria-label={t("common.close")}
      onClick={onClose}
      className="flex h-9 w-9 flex-none items-center justify-center rounded-full text-[var(--st-tx)] hover:bg-[var(--st-sub)]"
    >
      <TimelineIcon name="close" size={18} />
    </button>
  );
  if (phone) {
    return createPortal(
      <div
        role="presentation"
        className="fixed inset-0 z-[150] flex items-end bg-[var(--st-ov)]"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) onClose();
        }}
      >
        <div
          ref={containerRef}
          role="dialog"
          aria-modal="true"
          aria-label={t("timeline.sc.title")}
          tabIndex={-1}
          data-timeline-shortcuts="sheet"
          className="flex max-h-[85dvh] w-full flex-col gap-4 rounded-t-sheet bg-studio-surface px-4 pb-5 pt-2.5 outline-none"
        >
          <span
            aria-hidden="true"
            className="mx-auto block h-1 w-10 flex-none rounded-full bg-[var(--st-hd)]"
          />
          <div className="flex flex-none items-center gap-2">
            <h2 className="flex-1 font-display text-[17px] font-semibold leading-6 text-studio-text">
              {t("timeline.sc.title")}
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="h-11 flex-none rounded-full bg-[var(--st-btn)] px-[18px] text-[13px] font-semibold text-[var(--st-on-btn)]"
            >
              {t("common.close")}
            </button>
          </div>
          <div className="flex min-h-0 flex-col gap-[18px] overflow-y-auto">
            <GroupSection group={{ ...PLAYBACK, rows: PLAYBACK.rows.slice(0, 4) }} />
            <GroupSection group={TOOLS} />
            <WorkAreaSection compact />
          </div>
        </div>
      </div>,
      document.body,
    );
  }
  return createPortal(
    <div
      role="presentation"
      className="fixed inset-0 z-[150] flex items-center justify-center bg-[var(--st-ov)] p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-label={t("timeline.sc.title")}
        tabIndex={-1}
        data-timeline-shortcuts="dialog"
        className="flex max-h-[calc(100dvh-32px)] w-[min(1240px,100%)] flex-col gap-5 overflow-y-auto rounded-sheet bg-studio-surface p-6 shadow-studio outline-none"
      >
        <div className="flex items-center gap-3">
          <h2 className="flex-1 font-display text-xl font-semibold leading-7 text-studio-text">
            {t("timeline.sc.title")}
          </h2>
          {viewSwitch}
          {close}
        </div>
        <div className="grid grid-cols-3 items-start gap-7">{shortcutColumns(view, onSeek)}</div>
      </div>
    </div>,
    document.body,
  );
}
