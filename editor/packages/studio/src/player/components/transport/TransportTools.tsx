// "Sari la cadru" and "Zonă de lucru" (St-Preview-Tools, St-M-Preview-Tools). Shared by the
// desktop shortcuts dialog and the phone "Instrumente" sheet.
import { useCallback, useState, type FormEvent } from "react";
import { t } from "../../../i18n/translate";
import { frameToSeconds } from "../../lib/time";
import { OutlinePill, PrimaryPill } from "../../../components/nle/preview/previewChrome";
import { PanelSectionTitle } from "./ShortcutList";
import { formatPointTime } from "./transportFormat";

export interface TransportToolsProps {
  disabled: boolean;
  duration: number;
  inPoint: number | null;
  outPoint: number | null;
  setInPoint: (v: number | null) => void;
  setOutPoint: (v: number | null) => void;
  onSeek: (time: number) => void;
}

export function JumpToFrameSection({
  disabled,
  duration,
  onSeek,
}: Pick<TransportToolsProps, "disabled" | "duration" | "onSeek">) {
  const [jumpFrame, setJumpFrame] = useState("");
  const commitJumpFrame = useCallback(() => {
    if (disabled) return;
    const frame = Number.parseInt(jumpFrame, 10);
    if (!Number.isFinite(frame) || duration <= 0) return;
    onSeek(Math.min(duration, frameToSeconds(Math.max(0, frame))));
  }, [disabled, duration, jumpFrame, onSeek]);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    commitJumpFrame();
  };

  return (
    <section className="flex min-w-0 flex-col gap-2.5">
      <PanelSectionTitle>{t("preview.jumpToFrame")}</PanelSectionTitle>
      <form onSubmit={handleSubmit} className="flex gap-2">
        <label className="flex h-10 min-w-0 flex-1 items-center rounded-md bg-studio-surface px-3 shadow-[inset_0_0_0_1px_var(--st-sbd)] focus-within:shadow-[inset_0_0_0_2px_var(--st-sbd)]">
          <input
            value={jumpFrame}
            onChange={(event) => setJumpFrame(event.target.value)}
            disabled={disabled}
            inputMode="numeric"
            pattern="[0-9]*"
            aria-label={t("preview.jumpToFrame")}
            placeholder={t("preview.framePlaceholder")}
            className="w-full min-w-0 border-0 bg-transparent text-[13px] tabular-nums text-studio-text outline-none placeholder:text-studio-muted"
            onBlur={commitJumpFrame}
          />
        </label>
        <PrimaryPill type="submit" height={40} disabled={disabled}>
          {t("preview.go")}
        </PrimaryPill>
      </form>
    </section>
  );
}

function WorkAreaRow({
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
    <div className="flex min-h-11 items-center gap-2.5 rounded-md bg-studio-surface pl-3.5 pr-2 shadow-[inset_0_0_0_1px_var(--st-bd)]">
      <span className="flex-1 text-[13px] font-medium text-studio-text">{label}</span>
      <span className="text-[13px] font-semibold tabular-nums text-studio-muted">
        {value === null ? "—" : formatPointTime(value)}
      </span>
      {value !== null && (
        <OutlinePill height={32} aria-label={clearLabel} onClick={onClear}>
          {t("preview.clear")}
        </OutlinePill>
      )}
    </div>
  );
}

export function WorkAreaSection({
  inPoint,
  outPoint,
  setInPoint,
  setOutPoint,
}: Pick<TransportToolsProps, "inPoint" | "outPoint" | "setInPoint" | "setOutPoint">) {
  return (
    <section className="flex min-w-0 flex-col gap-2.5">
      <PanelSectionTitle>{t("preview.workArea")}</PanelSectionTitle>
      <div className="flex flex-col gap-2">
        <WorkAreaRow
          label={t("preview.inPoint")}
          value={inPoint}
          clearLabel={t("preview.clearIn")}
          onClear={() => setInPoint(null)}
        />
        <WorkAreaRow
          label={t("preview.outPoint")}
          value={outPoint}
          clearLabel={t("preview.clearOut")}
          onClear={() => setOutPoint(null)}
        />
      </div>
    </section>
  );
}
