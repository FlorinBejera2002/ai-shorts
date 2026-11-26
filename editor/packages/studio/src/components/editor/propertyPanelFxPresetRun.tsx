/**
 * One preset's bracket in the rack: its own header, on/off switch, amount lane
 * and the rows it wraps — or, for a run with no preset, just the rows.
 *
 * Split out of `propertyPanelFxSection.tsx`, whose `runs.map()` callback this
 * body used to be — one card per run, hand-built nodes included as runs with no
 * preset attached.
 */

import type {
  HfAudioFxNode,
  HfAudioFxParam,
  HfAudioFxParamValues,
} from "@hyperframes/core/audio-fx";
import { getAudioFxPreset } from "@hyperframes/core/audio-fx-presets";
import { FxParamRow } from "./propertyPanelFxControls.js";
import { t, useLocale } from "../../i18n/translate";
import { LOOK_ICONS, LookIcon } from "./propertyPanelColorLookUi";
import { audioText } from "./propertyPanelFxText.js";
import { FxNodeRow } from "./propertyPanelFxNodeRow.js";

/**
 * The one control over a whole preset: how much of it is applied.
 *
 * Not in the effect registry — a preset is not an effect — so the row is
 * fabricated the same way the derived one-knob control is, and rendered by the
 * ordinary controls.
 */
const PRESET_AMOUNT_PARAM: HfAudioFxParam = {
  kind: "number",
  key: "amount",
  label: "Amount",
  unit: "",
  min: 0,
  max: 1,
  step: 0.01,
  default: 1,
  hint: "How much of this preset is applied. Automate it to bring the whole preset in or out over time.",
};

export interface FxPresetRunProps {
  run: { preset?: string; items: { node: HfAudioFxNode; i: number }[] };
  /** The number each row wears, counted over the whole rack. */
  positions: ReadonlyMap<number, number>;
  /** So the last row in the WHOLE chain knows it cannot move further down. */
  totalNodes: number;
  automatedTargets?: ReadonlySet<string>;
  liveAutomationValues?: ReadonlyMap<string, number>;
  onAutomateParam?(nodeId: string, paramKey: string): void;
  onRemoveParamAutomation?(nodeId: string, paramKey: string): void;
  openNode: number | null;
  onToggleOpenNode(index: number): void;
  disabled?: boolean;
  onUpdateNode(index: number, patch: Partial<HfAudioFxNode>): void;
  onMoveNode(index: number, delta: number): void;
  onRemoveNode(index: number): void;
  onPreviewNode(index: number, params: HfAudioFxParamValues): void;
  /** What the track reads as, carried onto each row's own telemetry events. */
  trackKind?: string;
  /** Whether this run's card is folded shut. Meaningless when there is no preset. */
  collapsed: boolean;
  onToggleCollapse(): void;
  /** How much of the preset is applied, 0..1 — the switch and the lane read the same value. */
  amount: number;
  onSetAmount(amount: number, persist?: boolean): void;
  onRemoveRun(): void;
  automated: boolean;
  onAutomate?(): void;
  onRemoveAutomation?(): void;
}

/** One run: a preset's bracket around its nodes, or a bare hand-built node. */
export function FxPresetRun({
  run,
  positions,
  totalNodes,
  automatedTargets,
  liveAutomationValues,
  onAutomateParam,
  onRemoveParamAutomation,
  openNode,
  onToggleOpenNode,
  disabled,
  onUpdateNode,
  onMoveNode,
  onRemoveNode,
  onPreviewNode,
  trackKind,
  collapsed,
  onToggleCollapse,
  amount,
  onSetAmount,
  onRemoveRun,
  automated,
  onAutomate,
  onRemoveAutomation,
}: FxPresetRunProps) {
  useLocale();
  const rows = run.items.map(({ node, i }) => (
    <FxNodeRow
      // Keyed by id, as the carve module's list above already is. On
      // `${type}-${index}` two effects of the same type keep their keys through
      // a reorder, so React reuses each row where it stands — and the controls
      // hold real state (a half-typed number, an in-flight drag), which then
      // lands on whichever effect moved into that slot.
      key={node.id ?? `${node.type}-${i}`}
      node={node}
      index={i}
      position={positions.get(i)}
      automatedTargets={automatedTargets}
      liveAutomationValues={liveAutomationValues}
      onAutomateParam={onAutomateParam}
      onRemoveParamAutomation={onRemoveParamAutomation}
      open={openNode === i}
      last={i === totalNodes - 1}
      disabled={disabled}
      onToggleOpen={() => onToggleOpenNode(i)}
      onUpdate={onUpdateNode}
      onMove={onMoveNode}
      onRemove={onRemoveNode}
      onPreview={onPreviewNode}
      trackKind={trackKind}
    />
  ));

  const preset = run.preset ? getAudioFxPreset(run.preset) : null;
  if (!preset) return rows;

  // On unless every node in it is bypassed: one switched back on means the
  // preset is doing something, and the switch has to offer to stop it rather
  // than claiming it has already stopped.
  const runOn = amount > 0;
  const label = audioText(preset.label);

  return (
    <div
      className="hf-fx-preset-run flex flex-col gap-2 rounded-md p-2.5 shadow-[inset_0_0_0_1px_var(--st-bd)]"
      data-fx-preset={run.preset}
      data-collapsed={collapsed ? "" : undefined}
    >
      <div className="hf-fx-preset-run-head flex min-h-9 items-center gap-1">
        <button
          type="button"
          className="hf-fx-preset-run-label flex min-w-0 flex-1 items-center gap-1 truncate text-left text-[13px] font-semibold text-studio-text"
          aria-expanded={!collapsed}
          title={
            collapsed ? `Show what ${preset.label} contains` : `Hide ${preset.label}'s effects`
          }
          onClick={onToggleCollapse}
        >
          <span
            className={`hf-fx-preset-run-caret flex-none transition-transform ${collapsed ? "-rotate-90" : ""}`}
            aria-hidden="true"
          >
            <LookIcon d={LOOK_ICONS.chevronDown} size={14} />
          </span>
          <span className="truncate">{label}</span>
          {/* Collapsed, the count is what says the preset is still a chain
              rather than one opaque effect. */}
          {collapsed ? (
            <span className="hf-fx-preset-run-count text-[12px] font-medium text-studio-muted">
              {run.items.length}
            </span>
          ) : null}
        </button>
        {/* The whole preset, on or off. Partly-bypassed reads as off, because
            "some of it is running" is not a state an author set — it is one
            they arrived at, and the switch is how they get back out of it. */}
        <button
          type="button"
          className={`hf-fx-preset-run-toggle inline-flex h-9 flex-none items-center rounded-full px-3 text-[12px] font-semibold text-studio-text disabled:opacity-40 ${
            runOn
              ? "bg-[var(--st-sub)] hover:shadow-[inset_0_0_0_1.5px_var(--st-sbd)]"
              : "shadow-[inset_0_0_0_1.5px_var(--st-sbd)] hover:bg-[var(--st-sub)]"
          }`}
          aria-pressed={runOn}
          title={runOn ? `Switch ${preset.label} off` : `Switch ${preset.label} back on`}
          disabled={disabled}
          onClick={() => onSetAmount(runOn ? 0 : 1)}
        >
          {t(runOn ? "audio.bypass" : "audio.enable")}
        </button>
        <button
          type="button"
          className="hf-fx-preset-run-remove inline-flex h-8 w-8 flex-none items-center justify-center rounded-full text-studio-text hover:bg-[var(--st-danger-bg)] hover:text-studio-danger disabled:opacity-40"
          title={`Remove ${preset.label}`}
          aria-label={`${t("audio.remove")} ${label}`}
          disabled={disabled}
          onClick={onRemoveRun}
        >
          <LookIcon d={LOOK_ICONS.trash} />
        </button>
      </div>
      {/* The same value the switch sets, so an author can put the preset half
          in — and the lane below ramps it continuously. */}
      <FxParamRow
        param={PRESET_AMOUNT_PARAM}
        value={amount}
        disabled={disabled || automated}
        automated={automated}
        onChange={(_k, v) => onSetAmount(Number(v), false)}
        onCommit={(_k, v) => onSetAmount(Number(v))}
        onAutomate={onAutomate}
        onRemoveAutomation={onRemoveAutomation}
      />
      {collapsed ? null : rows}
    </div>
  );
}
