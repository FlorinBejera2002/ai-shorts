// Romanian names for the element inspector's row labels. Section files pass the English
// label (also used for telemetry); the primitives show it through flatLabel().
import { t } from "../../i18n/translate";
import type { MessageKey } from "../../i18n/dictionary";

const LABEL_KEYS: Partial<Record<string, MessageKey>> = {
  "Has audio track": "fl.hasAudio",
  Volume: "fl.volume",
  Muted: "fl.muted",
  Loop: "fl.loop",
  "Z-index": "fl.zIndex",
  "Text color": "fl.textColor",
  Style: "fl.style",
  "Stroke width": "fl.strokeWidth",
  "Stroke style": "fl.strokeStyle",
  "Stroke color": "fl.strokeColor",
  "Starts at": "fl.startsAt",
  Start: "fl.start",
  Speed: "fl.speed",
  Size: "fl.size",
  Shape: "fl.shape",
  Shadow: "fl.shadow",
  Scale: "fl.scale",
  Rate: "fl.rate",
  Quality: "fl.quality",
  Position: "fl.position",
  Perspective: "fl.perspective",
  Overflow: "fl.overflow",
  Opacity: "fl.opacity",
  "Media start": "fl.mediaStart",
  Mask: "fl.mask",
  "Mask inset": "fl.maskInset",
  Length: "fl.length",
  "Layer blur": "fl.layerBlur",
  Justify: "fl.justify",
  Gap: "fl.gap",
  Fit: "fl.fit",
  Fill: "fl.fill",
  End: "fl.end",
  Duration: "fl.duration",
  Direction: "fl.direction",
  Color: "fl.color",
  Blend: "fl.blend",
  Backdrop: "fl.backdrop",
  Angle: "fl.angle",
  Align: "fl.align",
  Radius: "fl.radius",
  Rotation: "fl.rotation",
  Delay: "fl.delay",
  Ease: "fl.ease",
};

const OPTION_KEYS: Partial<Record<string, MessageKey>> = {
  none: "opt.none",
  solid: "opt.solid",
  dashed: "opt.dashed",
  dotted: "opt.dotted",
  double: "opt.double",
  groove: "opt.groove",
  ridge: "opt.ridge",
  inset: "opt.inset",
  outset: "opt.outset",
  hidden: "opt.hidden",
  soft: "opt.soft",
  lift: "opt.lift",
  glow: "opt.glow",
  custom: "opt.custom",
  normal: "opt.normal",
  multiply: "opt.multiply",
  screen: "opt.screen",
  overlay: "opt.overlay",
  darken: "opt.darken",
  lighten: "opt.lighten",
  visible: "opt.visible",
  clip: "opt.clip",
  auto: "opt.auto",
  scroll: "opt.scroll",
  circle: "opt.circle",
};

/** Creator-facing name of a CSS keyword offered in a select (none → Fără); others as is. */
export function flatOptionLabel(value: string): string {
  const key = OPTION_KEYS[value];
  return key ? t(key) : value;
}

export function flatLabel(label: string): string {
  const key = LABEL_KEYS[label];
  return key ? t(key) : label;
}
