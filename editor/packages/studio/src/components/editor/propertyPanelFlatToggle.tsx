/* ------------------------------------------------------------------ */
/*  FlatToggle — 24×14 pill switch                                     */
/*  (split out of propertyPanelFlatPrimitives.tsx to stay under the    */
/*  600-line file-size gate)                                           */
/* ------------------------------------------------------------------ */

import { flatLabel } from "./flatLabel";
import { useTrackDesignInput } from "../../contexts/DesignPanelInputContext";

export function FlatToggle({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
}) {
  const track = useTrackDesignInput();
  return (
    <div className="flex min-h-10 items-center justify-between gap-3">
      <span
        data-flat-toggle-label="true"
        className={`text-[13px] font-medium ${checked ? "text-studio-text" : "text-studio-muted"}`}
      >
        {flatLabel(label)}
      </span>
      <button
        type="button"
        data-flat-toggle="true"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => {
          track("toggle", label);
          onChange(!checked);
        }}
        className={`relative h-6 w-10 flex-shrink-0 rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
          checked ? "bg-studio-accent" : "bg-[var(--st-hd)]"
        }`}
      >
        <span
          data-flat-toggle-knob="true"
          className={`absolute top-0.5 h-5 w-5 rounded-full transition-all ${
            checked ? "right-0.5 bg-studio-on-accent" : "left-0.5 bg-studio-surface"
          }`}
        />
      </button>
    </div>
  );
}
