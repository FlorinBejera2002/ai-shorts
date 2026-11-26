/**
 * The rack's own signal path: the carve, the Tone EQ modules, and every
 * hand-built effect or preset run in between — bracketed by the `In` / `Out`
 * labels that say the order is the point. What those two name depends on what
 * is selected; see `audioFxSignalPath`.
 *
 * Split out of `propertyPanelFxSection.tsx`, which owned this whole chain
 * before the file grew past a size where the chain and the add/pick menus
 * were still one thing to read.
 */

import type { HfAudioFxChain, HfAudioFxNode } from "@hyperframes/core/audio-fx";
import { t, useLocale } from "../../i18n/translate";
import { withContentKeys } from "../agent/stableKeys";
import { audioText } from "./propertyPanelFxText.js";
import { getAudioFxPreset } from "@hyperframes/core/audio-fx-presets";
import { LOOK_ICONS, LookIcon } from "./propertyPanelColorLookUi";
import { fxFamilyOf, type FxFamily } from "./propertyPanelFxFamily.js";
import type { MessageKey } from "../../i18n/dictionary";
import { readAudioEqBands } from "@hyperframes/core/audio-fx-eq";
import { DEFAULT_CARVE, type HfCarveSettings } from "@hyperframes/core/audio-carve";
import { trackEqChanged, trackPresetAmount } from "./audioFxTelemetry.js";
import { FxCarveModule, type AudioTrackOption } from "./propertyPanelFxCarveModule.js";
import { FxEqModule } from "./propertyPanelFxEqModule.js";
import { FxPresetRun } from "./propertyPanelFxPresetRun.js";
import type { AudioFxSignalPath } from "./audioFxSignalPath.js";

export interface FxRackChainProps {
  /** What the `In`/`Out` lines name — a clip's answer differs from a bus's. */
  signalPath: AudioFxSignalPath;
  chain: HfAudioFxChain;
  showCarve: boolean;
  carveNodes: HfAudioFxNode[];
  carve: HfCarveSettings | null;
  sourceOptions: AudioTrackOption[];
  automatedTargets?: ReadonlySet<string>;
  liveAutomationValues?: ReadonlyMap<string, number>;
  carveOpen: boolean;
  disabled?: boolean;
  analysing?: boolean;
  onToggleCarveOpen(): void;
  onCarveChange(carve: HfCarveSettings | null): void;
  onCarvePreview(carve: HfCarveSettings): void;
  eqIds: string[];
  openEq: string | null;
  onToggleEq(eqId: string): void;
  onPreviewEqBand(eqId: string, band: string, gain: number): void;
  onCommitEqBand(eqId: string, band: string, gain: number): void;
  onRemoveEq(eqId: string): void;
  handBuiltCount: number;
  runs: { preset?: string; items: { node: HfAudioFxNode; i: number }[] }[];
  positions: ReadonlyMap<number, number>;
  openNode: number | null;
  onToggleOpenNode(index: number): void;
  onUpdateNode(index: number, patch: Partial<HfAudioFxNode>): void;
  onMoveNode(index: number, delta: number): void;
  onRemoveNode(index: number): void;
  onPreviewNode(
    index: number,
    params: import("@hyperframes/core/audio-fx").HfAudioFxParamValues,
  ): void;
  trackKind?: string;
  collapsedRuns: ReadonlySet<string>;
  onToggleCollapse(runKey: string): void;
  onSetRunAmount(
    items: { node: HfAudioFxNode; i: number }[],
    amount: number,
    persist?: boolean,
  ): void;
  onRemoveRun(items: { node: HfAudioFxNode; i: number }[], presetId?: string): void;
  onAutomateParam?(nodeId: string, paramKey: string): void;
  onRemoveParamAutomation?(nodeId: string, paramKey: string): void;
  presetAutomated: ReadonlySet<string>;
  presetAutomateHandler(presetId: string | undefined, amount: number): (() => void) | undefined;
  presetRemoveAutomationHandler(presetId: string | undefined): (() => void) | undefined;
}

export function FxRackChain({
  chain,
  showCarve,
  carveNodes,
  carve,
  sourceOptions,
  automatedTargets,
  liveAutomationValues,
  carveOpen,
  disabled,
  analysing,
  onToggleCarveOpen,
  onCarveChange,
  onCarvePreview,
  eqIds,
  openEq,
  onToggleEq,
  onPreviewEqBand,
  onCommitEqBand,
  onRemoveEq,
  handBuiltCount,
  runs,
  positions,
  openNode,
  onToggleOpenNode,
  onUpdateNode,
  onMoveNode,
  onRemoveNode,
  onPreviewNode,
  trackKind,
  collapsedRuns,
  onToggleCollapse,
  onSetRunAmount,
  onRemoveRun,
  onAutomateParam,
  onRemoveParamAutomation,
  presetAutomated,
  presetAutomateHandler,
  presetRemoveAutomationHandler,
  signalPath,
}: FxRackChainProps) {
  useLocale();
  const segments = splitByFamily(runs);
  const pathStages = [
    ...(showCarve && carveNodes.length > 0 ? [audioText("Voiceover carve")] : []),
    ...eqIds.map(() => t("audio.tone")),
    ...segments.map(({ run, family }) =>
      family ? t(FAMILY_TITLE[family]) : audioText(getAudioFxPreset(run.preset ?? "")?.label ?? ""),
    ),
  ].filter((stage, index, all) => stage && stage !== all[index - 1]);
  return (
    <div className="hf-fx-chain flex flex-col gap-2">
      {/* The rack IS the signal path, and saying so is what makes "move up" read as the
          consequential control it is: the breadcrumb names each stage in order. */}
      <nav aria-label={t("audio.path")} data-fx-path="true">
        <ol className="hf-fx-term flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[13px] font-medium text-studio-text">
          {withContentKeys([t("audio.in"), ...pathStages, t("audio.out")], (stage) => stage).map(
            ({ key, item: stage }, index) => (
              <li key={key} className="flex items-center gap-1.5">
                {index > 0 ? <LookIcon d={LOOK_ICONS.chevronRight} size={14} /> : null}
                <span className={index === 0 ? "hf-fx-term-cap" : undefined}>{stage}</span>
              </li>
            ),
          )}
        </ol>
      </nav>
      {/* Carve leads the rack, which is also where its effects sit in the signal
          path — corrective work before anything the author added. Present
          whenever there is a voice for it to listen to, rather than appearing
          only once it has already produced something: a control that materialises
          after the fact cannot be the thing you reach for to start. */}
      {showCarve ? (
        <FxCarveModule
          nodes={carveNodes}
          carve={carve ?? { ...DEFAULT_CARVE }}
          sourceOptions={sourceOptions}
          automatedTargets={automatedTargets}
          liveAutomationValues={liveAutomationValues}
          open={carveOpen}
          disabled={disabled}
          analysing={analysing}
          onToggleOpen={onToggleCarveOpen}
          onCarveChange={onCarveChange}
          onCarvePreview={onCarvePreview}
        />
      ) : null}
      {eqIds.map((eqId) => (
        <FxEqModule
          key={eqId}
          eqId={eqId}
          bands={readAudioEqBands(chain, eqId)}
          open={openEq === eqId}
          disabled={disabled}
          onToggleOpen={() => onToggleEq(eqId)}
          onPreview={(band, gain) => onPreviewEqBand(eqId, band, gain)}
          onCommit={(band, gain) => {
            trackEqChanged(band, gain);
            onCommitEqBand(eqId, band, gain);
          }}
          onRemove={() => onRemoveEq(eqId)}
        />
      ))}
      {handBuiltCount === 0 && eqIds.length === 0 ? (
        <p className="hf-fx-empty py-2 text-[13px] text-studio-muted">
          {t(showCarve ? "audio.emptyOther" : "audio.empty", {
            subject: t(
              signalPath.subject === "group" ? "audio.subject.group" : "audio.subject.track",
            ),
          })}
        </p>
      ) : (
        segments.map(({ run, family }) => {
          // How much of the preset is applied. Any node of the run carries
          // it, and the first is the one the graph reads.
          const rawAmount = run.items[0]?.node.presetAmount;
          const amount = typeof rawAmount === "number" ? rawAmount : 1;
          const runKey = `${run.preset}-${run.items[0]?.i ?? 0}`;
          const runView = (
            <FxPresetRun
              key={`preset-${run.preset}-${run.items[0]?.i}`}
              run={run}
              positions={positions}
              totalNodes={chain.nodes.length}
              automatedTargets={automatedTargets}
              liveAutomationValues={liveAutomationValues}
              onAutomateParam={onAutomateParam}
              onRemoveParamAutomation={onRemoveParamAutomation}
              openNode={openNode}
              onToggleOpenNode={onToggleOpenNode}
              disabled={disabled}
              onUpdateNode={onUpdateNode}
              onMoveNode={onMoveNode}
              onRemoveNode={onRemoveNode}
              onPreviewNode={onPreviewNode}
              trackKind={trackKind}
              collapsed={collapsedRuns.has(runKey)}
              onToggleCollapse={() => onToggleCollapse(runKey)}
              amount={amount}
              onSetAmount={(v, persist = true) => {
                if (persist && run.preset) trackPresetAmount(run.preset, v, { trackKind });
                onSetRunAmount(run.items, v, persist);
              }}
              onRemoveRun={() => onRemoveRun(run.items, run.preset)}
              automated={presetAutomated.has(run.preset ?? "")}
              onAutomate={presetAutomateHandler(run.preset, amount)}
              onRemoveAutomation={presetRemoveAutomationHandler(run.preset)}
            />
          );
          if (!family) return runView;
          return (
            <section
              key={`family-${runKey}`}
              className="flex flex-col gap-2"
              data-fx-family-group={family}
            >
              <h4 className="pt-1 text-[13px] font-semibold text-studio-text">
                {t(FAMILY_TITLE[family])}
              </h4>
              {runView}
            </section>
          );
        })
      )}
    </div>
  );
}

type ChainRun = FxRackChainProps["runs"][number];

const FAMILY_TITLE: Record<FxFamily, MessageKey> = {
  filter: "audio.fam.filter",
  dynamics: "audio.fam.dynamics",
  nonlinear: "audio.fam.nonlinear",
  time: "audio.fam.time",
  smart: "audio.fam.smart",
};

/**
 * St-Inspector-AudioRack: hand-built effects sit under a heading for their family (Filtre,
 * Dinamică). Only consecutive effects of one family share a heading, so the headings read in
 * signal order and never claim an adjacency the chain does not have. A preset run keeps its own
 * card and gets no heading.
 */
function splitByFamily(runs: readonly ChainRun[]): { run: ChainRun; family: FxFamily | null }[] {
  const out: { run: ChainRun; family: FxFamily | null }[] = [];
  for (const run of runs) {
    if (run.preset) {
      out.push({ run, family: null });
      continue;
    }
    for (const item of run.items) {
      const family = fxFamilyOf(item.node);
      const last = out.at(-1);
      if (last && !last.run.preset && last.family === family) last.run.items.push(item);
      else out.push({ run: { items: [item] }, family });
    }
  }
  return out;
}
