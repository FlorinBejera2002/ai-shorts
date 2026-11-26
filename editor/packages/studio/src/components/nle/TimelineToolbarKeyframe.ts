// Keyframe toggle state for the timeline toolbar: whether the selection can be keyframed at
// the playhead, whether that adds, removes or extends, and the copy for each case.
import { useRef } from "react";
import type { GsapAnimation } from "@hyperframes/core/gsap-parser";
import {
  useEnableKeyframes,
  isPlayheadWithinTween,
  type EnableKeyframesSession,
} from "../../hooks/useEnableKeyframes";
import { computeElementPercentage, KEYFRAME_PCT_MATCH } from "../../hooks/gsapShared";
import { usePlayerStore, type TimelineElement } from "../../player";
import type { DomEditSelection } from "../editor/domEditingTypes";
import type { MessageKey } from "../../i18n/dictionary";

export interface DomEditSessionSlice extends EnableKeyframesSession {
  domEditSelection: DomEditSelection | null;
  selectedGsapAnimations: GsapAnimation[];
}

export interface KeyframeToggleState {
  state: "active" | "inactive" | "none";
  isMotionPath: boolean;
  pathEndpoint: boolean;
  willExtend: boolean;
}

const NO_KEYFRAME_TOGGLE: KeyframeToggleState = {
  state: "none",
  isMotionPath: false,
  pathEndpoint: false,
  willExtend: false,
};

function isMotionPathEndpoint(animation: GsapAnimation | undefined, percentage: number): boolean {
  if (!animation?.keyframes) return false;
  const keyframes = animation.keyframes.keyframes;
  return (
    Math.abs((keyframes[0]?.percentage ?? -Infinity) - percentage) <= KEYFRAME_PCT_MATCH ||
    Math.abs((keyframes.at(-1)?.percentage ?? Infinity) - percentage) <= KEYFRAME_PCT_MATCH
  );
}

function resolveKeyframeToggleState(
  session: DomEditSessionSlice | undefined,
  currentTime: number,
): KeyframeToggleState {
  if (!session?.domEditSelection) return NO_KEYFRAME_TOGGLE;
  const arcAnimation = session.selectedGsapAnimations.find(
    (animation) => animation.arcPath && animation.keyframes,
  );
  const animation =
    arcAnimation ??
    session.selectedGsapAnimations.find((candidate) => candidate.keyframes && !candidate.arcPath);
  if (!animation?.keyframes) return NO_KEYFRAME_TOGGLE;

  const isMotionPath = Boolean(arcAnimation);
  if (!isPlayheadWithinTween(animation, currentTime, session.domEditSelection)) {
    return { state: "inactive", isMotionPath, pathEndpoint: false, willExtend: true };
  }

  const percentage = computeElementPercentage(currentTime, session.domEditSelection, animation);
  const pathEndpoint = isMotionPathEndpoint(arcAnimation, percentage);
  const active = animation.keyframes.keyframes.some(
    (keyframe) => Math.abs(keyframe.percentage - percentage) <= KEYFRAME_PCT_MATCH,
  );
  return {
    state: pathEndpoint ? "none" : active ? "active" : "inactive",
    isMotionPath,
    pathEndpoint,
    willExtend: false,
  };
}

/**
 * Can this element be keyframed at all?
 *
 * An audio clip cannot. It has no box on the canvas, so there is nothing to move, scale or
 * fade, and "add a keyframe" on one seeded a position lane on a track that has no position.
 * Audio is automated instead: volume and effect parameters, on their own lanes.
 */
function isKeyframeable(element: TimelineElement | undefined): boolean {
  return element?.tag !== "audio";
}

export function useKeyframeToggle(session?: DomEditSessionSlice) {
  const currentTime = usePlayerStore((s) => s.currentTime);
  const selectedElementId = usePlayerStore((s) => s.selectedElementId);
  const elements = usePlayerStore((s) => s.elements);
  const sessionRef = useRef(session);
  sessionRef.current = session;

  const onToggle = useEnableKeyframes(
    sessionRef as React.RefObject<EnableKeyframesSession | undefined>,
  );

  const selected = elements.find((element) => (element.key ?? element.id) === selectedElementId);
  if (!isKeyframeable(selected)) return { ...NO_KEYFRAME_TOGGLE, onToggle: undefined };

  const toggleState = resolveKeyframeToggleState(session, currentTime);

  return {
    ...toggleState,
    onToggle: session?.domEditSelection && !toggleState.pathEndpoint ? onToggle : undefined,
  };
}

/** Tooltip key for the keyframe button. */
// fallow-ignore-next-line complexity
export function keyframeTipKey(toggle: KeyframeToggleState, enabled: boolean): MessageKey {
  if (toggle.pathEndpoint) return "timeline.kfEndpointTip";
  if (!enabled) return "timeline.kfSelectTip";
  if (toggle.isMotionPath) {
    if (toggle.willExtend) return "timeline.kfExtendPathTip";
    return toggle.state === "active" ? "timeline.kfRemoveWaypointTip" : "timeline.kfAddWaypointTip";
  }
  if (toggle.state === "active") return "timeline.kfRemoveTip";
  if (toggle.state === "inactive") {
    return toggle.willExtend ? "timeline.kfAddExtendTip" : "timeline.kfAddTip";
  }
  return "timeline.kfAddPlainTip";
}

/** Accessible name key for the keyframe button. */
export function keyframeLabelKey(toggle: KeyframeToggleState): MessageKey {
  if (toggle.pathEndpoint) return "timeline.kfEndpoint";
  if (toggle.isMotionPath) {
    if (toggle.state === "active") return "timeline.kfRemoveWaypoint";
    return toggle.willExtend ? "timeline.kfExtendPath" : "timeline.kfAddWaypoint";
  }
  return toggle.state === "active" ? "timeline.kfRemove" : "timeline.kfAdd";
}
