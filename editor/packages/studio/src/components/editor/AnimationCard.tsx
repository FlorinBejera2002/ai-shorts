import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GsapAnimation } from "@hyperframes/core/gsap-parser";
import { SUPPORTED_EASES, SUPPORTED_PROPS } from "@hyperframes/core/gsap-constants";
import { trackStudioSegmentEaseEdit } from "../../telemetry/events";
import { controlPointsForGsapEase } from "./studioMotion";
import { PROP_LABELS } from "./gsapAnimationConstants";
import { AnimationCardHeader } from "./AnimationCardHeader";
import {
  MOTION_CARD,
  MOTION_HEADING,
  MOTION_TEXT_BUTTON,
  MotionNumberField,
  MotionSelect,
  easeOptions,
} from "./motionUi";
import { t, useLocale } from "../../i18n/translate";
import { buildTweenSummary } from "./gsapAnimationHelpers";
import { EaseCurveSection } from "./EaseCurveSection";
import { ArcPathControls } from "./ArcPathControls";
import type { GsapAnimationEditCallbacks } from "./gsapAnimationCallbacks";
import { ComputedTweenNotice } from "./ComputedTweenNotice";
import { KeyframeEaseList } from "./KeyframeEaseList";
import {
  PropertyRow,
  AddPropertyTrigger,
  parseNumericOrString,
  BOOLEAN_PROPS,
} from "./AnimationCardParts";
import type { AnimationKeyframeTarget } from "../../hooks/gsapTweenSynth";

interface AnimationCardProps extends GsapAnimationEditCallbacks {
  animation: GsapAnimation;
  defaultExpanded: boolean;
  flat?: boolean;
  focusedSegment?: {
    tweenPercentage: number;
    collidingAnimationTargets?: AnimationKeyframeTarget[];
  } | null;
  onFocusSegmentConsumed?: () => void;
}

// fallow-ignore-next-line complexity
export const AnimationCard = memo(function AnimationCard({
  animation,
  defaultExpanded,
  flat,
  focusedSegment,
  onFocusSegmentConsumed,
  onUpdateProperty,
  onUpdateMeta,
  onDeleteAnimation,
  onAddProperty,
  onRemoveProperty,
  onUpdateFromProperty,
  onAddFromProperty,
  onRemoveFromProperty,
  onLivePreview,
  onLivePreviewEnd,
  onSetArcPath,
  onUpdateArcSegment,
  onUpdateKeyframeEase,
  onUpdateSegmentEase,
  onSetAllKeyframeEases,
  onUnroll,
}: AnimationCardProps) {
  useLocale();
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [addingProp, setAddingProp] = useState(false);
  const [addingFromProp, setAddingFromProp] = useState(false);
  const [expandedKfPct, setExpandedKfPct] = useState<number | null>(null);
  const [focusedCollidingAnimationTargets, setFocusedCollidingAnimationTargets] = useState<
    AnimationKeyframeTarget[] | undefined
  >();
  const cardRef = useRef<HTMLDivElement>(null);
  const pendingAutoScrollRef = useRef(false);

  useEffect(() => {
    if (!focusedSegment) return;
    setExpanded(true);
    pendingAutoScrollRef.current = true;
    setExpandedKfPct(focusedSegment.tweenPercentage);
    setFocusedCollidingAnimationTargets(focusedSegment.collidingAnimationTargets);
    onFocusSegmentConsumed?.();
  }, [focusedSegment, onFocusSegmentConsumed]);

  useEffect(() => {
    if (!pendingAutoScrollRef.current || expandedKfPct === null) return;
    const segment = cardRef.current?.querySelector<HTMLElement>(
      `[data-ease-segment-pct="${expandedKfPct}"]`,
    );
    segment?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    pendingAutoScrollRef.current = false;
  }, [expandedKfPct]);

  const usedProps = useMemo(
    () => new Set(Object.keys(animation.properties)),
    [animation.properties],
  );
  const availableProps = useMemo(
    () =>
      SUPPORTED_PROPS.filter(
        (p) => !usedProps.has(p) && (animation.method === "set" || !BOOLEAN_PROPS.has(p)),
      ),
    [usedProps, animation.method],
  );

  const usedFromProps = useMemo(
    () => new Set(Object.keys(animation.fromProperties ?? {})),
    [animation.fromProperties],
  );
  const availableFromProps = useMemo(
    () => SUPPORTED_PROPS.filter((p) => !usedFromProps.has(p) && !BOOLEAN_PROPS.has(p)),
    [usedFromProps],
  );

  const commitProperty = useCallback(
    (prop: string, raw: string) => {
      const value = parseNumericOrString(raw);
      onUpdateProperty(animation.id, prop, value);
      onLivePreviewEnd?.();
    },
    [animation.id, onUpdateProperty, onLivePreviewEnd],
  );

  const scrubProperty = useCallback(
    (prop: string, raw: string) => {
      onLivePreview?.(prop, parseNumericOrString(raw));
    },
    [onLivePreview],
  );

  const commitFromProperty = useCallback(
    (prop: string, raw: string) => {
      const value = parseNumericOrString(raw);
      onUpdateFromProperty?.(animation.id, prop, value);
      onLivePreviewEnd?.();
    },
    [animation.id, onUpdateFromProperty, onLivePreviewEnd],
  );

  const commitDuration = useCallback(
    (raw: string) => {
      const num = Number(raw);
      if (Number.isFinite(num) && num >= 0)
        onUpdateMeta(animation.id, { duration: Math.max(0, num) });
    },
    [animation.id, onUpdateMeta],
  );

  const commitPosition = useCallback(
    (raw: string) => {
      const num = Number(raw);
      if (Number.isFinite(num) && num >= 0)
        onUpdateMeta(animation.id, { position: Math.max(0, num) });
    },
    [animation.id, onUpdateMeta],
  );

  const easeName =
    (animation.keyframes ? animation.keyframes.easeEach : undefined) ?? animation.ease ?? "none";
  const summary = useMemo(() => buildTweenSummary(animation), [animation]);
  const setKeys = Object.keys(animation.properties);
  if (
    animation.method === "set" &&
    // `every` is vacuously true on an empty bag — require at least one key so a
    // property-less set doesn't masquerade as a position row.
    (setKeys.includes("x") || setKeys.includes("y")) &&
    setKeys.every((k) => k === "x" || k === "y" || k === "immediateRender")
  )
    return (
      <div className={MOTION_CARD}>
        <div className="flex min-h-8 items-center gap-2">
          <b className="text-[13px] font-semibold text-studio-text">{t("motion.position")}</b>
          <span className="text-[13px] font-medium tabular-nums text-studio-muted">
            x {Math.round(Number(animation.properties.x ?? 0))}, y{" "}
            {Math.round(Number(animation.properties.y ?? 0))}
          </span>
        </div>
      </div>
    );

  const easeKey = animation.keyframes ? "easeEach" : "ease";
  const commitEase = (next: string) => {
    if (next === "custom") {
      const points = controlPointsForGsapEase(easeName !== "none" ? easeName : "power2.out");
      const path = `M0,0 C${points.x1},${points.y1} ${points.x2},${points.y2} 1,1`;
      onUpdateMeta(animation.id, { [easeKey]: `custom(${path})` });
    } else {
      onUpdateMeta(animation.id, { [easeKey]: next });
    }
  };

  return (
    <div
      ref={cardRef}
      data-flat-effect-card={flat ? "true" : undefined}
      data-animation-card="true"
      className={MOTION_CARD}
    >
      <AnimationCardHeader
        animation={animation}
        easeName={easeName}
        expanded={expanded}
        summary={summary}
        onToggle={() => setExpanded((v) => !v)}
        onDelete={() => onDeleteAnimation(animation.id)}
      />

      {expanded && (
        <div className="flex flex-col gap-3">
          <ComputedTweenNotice
            provenance={animation.provenance}
            onUnroll={onUnroll ? () => onUnroll(animation.id) : undefined}
          />
          <div className="grid grid-cols-2 gap-2">
            <MotionNumberField
              label={t("motion.startsAt")}
              value={
                typeof animation.position === "string"
                  ? animation.position
                  : String(parseFloat(Math.max(0, animation.position).toFixed(3)))
              }
              suffix={typeof animation.position === "number" ? "s" : undefined}
              onCommit={commitPosition}
            />
            {animation.method !== "set" && (
              <MotionNumberField
                label={t("motion.length")}
                value={String(Math.max(0, animation.duration ?? 0))}
                suffix="s"
                onCommit={commitDuration}
              />
            )}
          </div>

          {animation.method !== "set" &&
            (animation.keyframes && onUpdateKeyframeEase ? (
              <div className="flex flex-col gap-2">
                <span className={MOTION_HEADING}>{t("motion.keyframed")}</span>
                <KeyframeEaseList
                  keyframes={animation.keyframes.keyframes}
                  globalEase={animation.keyframes.easeEach ?? animation.ease ?? "none"}
                  expandedPct={expandedKfPct}
                  collidingAnimationTargets={focusedCollidingAnimationTargets}
                  onToggle={(pct) => {
                    setExpandedKfPct(pct);
                    setFocusedCollidingAnimationTargets(undefined);
                  }}
                  onEaseCommit={(pct, ease) => {
                    if (
                      focusedCollidingAnimationTargets &&
                      focusedCollidingAnimationTargets.length > 1 &&
                      onUpdateSegmentEase
                    ) {
                      onUpdateSegmentEase(focusedCollidingAnimationTargets, ease);
                    } else {
                      onUpdateKeyframeEase(animation.id, pct, ease);
                    }
                    trackStudioSegmentEaseEdit({ action: "commit", ease });
                  }}
                  onApplyAll={
                    onSetAllKeyframeEases
                      ? (ease) => onSetAllKeyframeEases(animation.id, ease)
                      : undefined
                  }
                />
              </div>
            ) : (
              <>
                <MotionSelect
                  label={t("motion.ease")}
                  value={easeName.startsWith("custom(") ? "custom" : easeName}
                  options={easeOptions([...SUPPORTED_EASES, "custom"])}
                  onChange={commitEase}
                />
                <EaseCurveSection
                  ease={easeName}
                  onCustomEaseCommit={(customEase) =>
                    onUpdateMeta(animation.id, { [easeKey]: customEase })
                  }
                />
              </>
            ))}

          {animation.method === "fromTo" && (
            <div className="flex flex-col gap-2">
              <span className={MOTION_HEADING}>{t("motion.from")}</span>
              {Object.entries(animation.fromProperties ?? {}).map(([prop, val]) => (
                <PropertyRow
                  key={prop}
                  prop={prop}
                  val={val}
                  onCommit={(adjusted) => commitFromProperty(prop, adjusted)}
                  onRemove={() => onRemoveFromProperty?.(animation.id, prop)}
                  removeTitle={t("motion.removeProperty", { name: PROP_LABELS[prop] ?? prop })}
                />
              ))}
              <AddPropertyTrigger
                adding={addingFromProp}
                available={availableFromProps}
                addLabel={t("motion.addFromProperty")}
                addTitle={t("motion.addFromProperty")}
                onAdd={(prop) => onAddFromProperty?.(animation.id, prop)}
                onOpen={() => setAddingFromProp(true)}
                onClose={() => setAddingFromProp(false)}
                buttonClassName={`${MOTION_TEXT_BUTTON} self-start`}
              />
            </div>
          )}

          {Object.keys(animation.properties).length > 0 && (
            <div className="flex flex-col gap-2">
              {animation.method === "fromTo" && (
                <span className={MOTION_HEADING}>{t("motion.to")}</span>
              )}
              {Object.entries(animation.properties).map(([prop, val]) => (
                <PropertyRow
                  key={prop}
                  prop={prop}
                  val={val}
                  onCommit={(adjusted) => {
                    scrubProperty(prop, adjusted);
                    commitProperty(prop, adjusted);
                  }}
                  onRemove={() => onRemoveProperty(animation.id, prop)}
                  removeTitle={t("motion.removeProperty", { name: PROP_LABELS[prop] ?? prop })}
                />
              ))}
            </div>
          )}

          {onSetArcPath &&
            (animation.properties.x != null ||
              animation.properties.y != null ||
              animation.keyframes) && (
              <ArcPathControls
                arcPath={animation.arcPath ?? { enabled: false, autoRotate: false, segments: [] }}
                segmentCount={Math.max(
                  animation.properties.x != null || animation.properties.y != null ? 1 : 0,
                  (animation.keyframes?.keyframes?.length ?? 0) - 1,
                )}
                onToggle={(enabled) =>
                  onSetArcPath(animation.id, {
                    enabled,
                    segments: animation.arcPath?.segments,
                  })
                }
                onUpdateSegment={(index, update) =>
                  onUpdateArcSegment?.(animation.id, index, update)
                }
                onToggleAutoRotate={(autoRotate) =>
                  onSetArcPath(animation.id, {
                    enabled: true,
                    autoRotate,
                    segments: animation.arcPath?.segments,
                  })
                }
              />
            )}

          <AddPropertyTrigger
            adding={addingProp}
            available={availableProps}
            addLabel={t("motion.addProperty")}
            addTitle={t("motion.addProperty")}
            onAdd={(prop) => onAddProperty(animation.id, prop)}
            onOpen={() => setAddingProp(true)}
            onClose={() => setAddingProp(false)}
            buttonClassName={`${MOTION_TEXT_BUTTON} self-start`}
          />
        </div>
      )}
    </div>
  );
});
