// Shortcut groups for the timeline shortcuts sheet (St-Timeline-ShortcutsEdit and
// St-Timeline-ShortcutsAdvanced). Keys are plain glyphs; words are message keys.
import type { MessageKey } from "../../i18n/dictionary";

/** A key cap: a literal glyph, or a message key for a word ("Drag", "Scroll"). */
export type ShortcutKey = string | { word: MessageKey };
export type ShortcutRow = readonly [MessageKey, readonly ShortcutKey[]];
export interface ShortcutGroup {
  title: MessageKey;
  rows: readonly ShortcutRow[];
}

const drag: ShortcutKey = { word: "timeline.sc.kDrag" };
const scroll: ShortcutKey = { word: "timeline.sc.kScroll" };
const click: ShortcutKey = { word: "timeline.sc.kClick" };

export const PLAYBACK: ShortcutGroup = {
  title: "timeline.sc.playback",
  rows: [
    ["timeline.sc.playPause", [{ word: "timeline.sc.kSpace" }]],
    ["timeline.sc.back", ["J"]],
    ["timeline.sc.stop", ["K"]],
    ["timeline.sc.forward", ["L"]],
    ["timeline.sc.mute", ["M"]],
    ["timeline.sc.loop", ["⇧", "L"]],
    ["timeline.sc.oneFrame", ["←", "→"]],
    ["timeline.sc.tenFrames", ["⇧←", "⇧→"]],
    ["timeline.sc.fullscreen", ["F"]],
  ],
};

export const PANELS: ShortcutGroup = {
  title: "timeline.sc.panels",
  rows: [
    ["timeline.sc.tabComps", ["⌘", "1"]],
    ["timeline.sc.tabAssets", ["⌘", "2"]],
  ],
};

export const EDITING: ShortcutGroup = {
  title: "timeline.sc.editing",
  rows: [
    ["timeline.sc.undo", ["⌘", "Z"]],
    ["timeline.sc.redo", ["⌘", "⇧", "Z"]],
    ["timeline.sc.copy", ["⌘", "C"]],
    ["timeline.sc.paste", ["⌘", "V"]],
    ["timeline.sc.cut", ["⌘", "X"]],
    ["timeline.sc.split", ["S"]],
    ["timeline.sc.splitAll", ["⇧", click]],
    ["timeline.sc.group", ["⌘", "G"]],
    ["timeline.sc.ungroup", ["⌘", "⇧", "G"]],
    ["timeline.sc.deleteEl", ["Del"]],
  ],
};

export const TOOLS: ShortcutGroup = {
  title: "timeline.sc.tools",
  rows: [
    ["timeline.sc.selectTool", ["V"]],
    ["timeline.sc.razorTool", ["B"]],
    ["timeline.sc.snap", ["N"]],
    ["timeline.sc.escape", ["Esc"]],
  ],
};

export const WORK_AREA_KEYS: readonly ShortcutRow[] = [
  ["timeline.sc.setIn", ["I"]],
  ["timeline.sc.clearIn", ["⇧", "I"]],
  ["timeline.sc.setOut", ["O"]],
  ["timeline.sc.clearOut", ["⇧", "O"]],
  ["timeline.sc.goIn", ["A"]],
  ["timeline.sc.goOut", ["E"]],
];

export const KEYFRAMES: ShortcutGroup = {
  title: "timeline.sc.keyframes",
  rows: [
    ["timeline.sc.kfAdd", ["K"]],
    ["timeline.sc.kfDelete", ["Del"]],
    ["timeline.sc.kfReset", ["⌫"]],
    ["timeline.sc.kfHold", ["H"]],
    ["timeline.sc.kfExpand", ["U"]],
    ["timeline.sc.kfRecord", ["R"]],
    ["timeline.sc.kfPrev", ["J"]],
    ["timeline.sc.kfNext", ["⇧", "J"]],
    ["timeline.sc.frameBack", ["K", "J"]],
    ["timeline.sc.frameForward", ["K", "L"]],
    ["timeline.sc.kfNudge", ["←", "→"]],
    ["timeline.sc.kfNudgeBig", ["⇧", "←", "→"]],
  ],
};

export const NAVIGATION: ShortcutGroup = {
  title: "timeline.sc.navigation",
  rows: [
    ["timeline.sc.navMove", ["←", "→", "↑", "↓"]],
    ["timeline.sc.navEnds", ["Home", "End"]],
    ["timeline.sc.navPage", ["PgUp", "PgDn"]],
    ["timeline.sc.navActivate", ["Enter", { word: "timeline.sc.kSpace" }]],
    ["timeline.sc.navExpand", ["←", "→"]],
    ["timeline.sc.navMenu", ["⇧", "F10"]],
  ],
};

export const GESTURES: ShortcutGroup = {
  title: "timeline.sc.gestures",
  rows: [
    ["timeline.sc.gPos", [drag]],
    ["timeline.sc.gDepth", [scroll]],
    ["timeline.sc.gRot3d", ["⇧", drag]],
    ["timeline.sc.gRot", ["⌥", drag]],
    ["timeline.sc.gOpacity", ["⌘", drag]],
    ["timeline.sc.gScale", ["⌘", scroll]],
  ],
};

export const CANVAS: ShortcutGroup = {
  title: "timeline.sc.canvas",
  rows: [
    ["timeline.sc.cMove", [drag]],
    ["timeline.sc.cPath", ["⌥", drag]],
    ["timeline.sc.cUniform", ["⇧", drag]],
  ],
};

export const CROP: ShortcutGroup = {
  title: "timeline.sc.crop",
  rows: [
    ["timeline.sc.cropSide", [{ word: "timeline.sc.kDragEdge" }]],
    ["timeline.sc.cropMove", [{ word: "timeline.sc.kDragCenter" }]],
  ],
};
