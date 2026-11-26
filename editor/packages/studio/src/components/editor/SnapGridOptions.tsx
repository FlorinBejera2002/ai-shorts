// Grid spacing and snap-to-grid options, shared by the desktop popover and the phone sheet.
import type { RefObject } from "react";
import { t } from "../../i18n/translate";
import { Switch } from "../ui";
import { POPOVER_PANEL } from "../nle/preview/previewChrome";
import type { SnapPrefs } from "./snapPrefs";

/** Grid spacing (10–500) and snap-to-grid, shared by the desktop popover and the phone sheet. */
export function GridOptionsFields({
  prefs,
  onChange,
  phone,
}: {
  prefs: SnapPrefs;
  onChange: (patch: Partial<SnapPrefs>) => void;
  phone: boolean;
}) {
  return (
    <>
      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] font-medium text-studio-text">{t("preview.gridSpacing")}</span>
        <input
          type="number"
          min={10}
          max={500}
          step={10}
          value={prefs.gridSpacing}
          aria-label={t("preview.gridSpacing")}
          onChange={(e) => {
            const val = Number.parseInt(e.target.value, 10);
            if (Number.isFinite(val) && val >= 10 && val <= 500) onChange({ gridSpacing: val });
          }}
          className="h-10 rounded-md border-0 bg-studio-surface px-3 text-[13px] tabular-nums text-studio-text shadow-[inset_0_0_0_1px_var(--st-sbd)] outline-none focus-visible:shadow-[inset_0_0_0_2px_var(--st-sbd)]"
        />
      </label>
      {phone ? (
        <div className="flex min-h-10 items-center justify-between gap-3">
          <span className="text-[13px] font-medium text-studio-text">
            {t("preview.snapToGrid")}
          </span>
          <Switch
            label={t("preview.snapToGrid")}
            checked={prefs.snapToGrid}
            onChange={(snapToGrid) => onChange({ snapToGrid })}
          />
        </div>
      ) : (
        <label className="flex min-h-10 cursor-pointer items-center justify-between gap-3 text-[13px] font-medium text-studio-text">
          {t("preview.snapToGrid")}
          <input
            type="checkbox"
            checked={prefs.snapToGrid}
            onChange={() => onChange({ snapToGrid: !prefs.snapToGrid })}
            className="h-[18px] w-[18px] accent-[var(--st-btn)]"
          />
        </label>
      )}
    </>
  );
}

/**
 * Desktop grid options popover. A non-modal `<dialog>` shown with `open`; the static and zero
 * margin classes keep the dialog's UA positioning out of the toolbar's flow.
 */
export function SnapGridPopover({
  dialogRef,
  prefs,
  onChange,
}: {
  dialogRef: RefObject<HTMLDialogElement | null>;
  prefs: SnapPrefs;
  onChange: (patch: Partial<SnapPrefs>) => void;
}) {
  return (
    <dialog
      open
      ref={dialogRef}
      aria-label={t("preview.gridOptions")}
      className={`static m-0 block h-auto max-h-none w-[250px] max-w-none overflow-visible text-inherit ${POPOVER_PANEL}`}
    >
      <b className="text-[13px] font-semibold">{t("preview.gridOptions")}</b>
      <GridOptionsFields prefs={prefs} onChange={onChange} phone={false} />
    </dialog>
  );
}
