// Keyboard shortcut reference shown in "Comenzi rapide și instrumente" (St-Preview-Shortcuts,
// St-Preview-ShortcutsEdit) and the phone sheets. Keys are split into caps; word keys
// ("Trage", "Derulare") are message keys so they translate.
import type { MessageKey } from "../../../i18n/dictionary";
import { COMMAND_KEY } from "../../../utils/commandKey";

export type ShortcutKey = string | { word: MessageKey };

export interface ShortcutHint {
  keys: ShortcutKey[];
  label: MessageKey;
}

export interface ShortcutSection {
  id: string;
  title: MessageKey;
  hints: ShortcutHint[];
}

const drag: ShortcutKey = { word: "preview.key.drag" };
const scroll: ShortcutKey = { word: "preview.key.scroll" };

export const PLAYBACK_SECTION: ShortcutSection = {
  id: "playback",
  title: "preview.sc.playback",
  hints: [
    { keys: ["Space"], label: "preview.sc.playPause" },
    { keys: ["J"], label: "preview.sc.playBackward" },
    { keys: ["K"], label: "preview.sc.stop" },
    { keys: ["L"], label: "preview.sc.playForward" },
    { keys: ["M"], label: "preview.sc.mute" },
    { keys: ["Shift", "L"], label: "preview.sc.loop" },
    { keys: ["←", "→"], label: "preview.sc.oneFrame" },
    { keys: ["Shift", "←", "→"], label: "preview.sc.tenFrames" },
    { keys: ["F"], label: "preview.sc.fullscreen" },
  ],
};

export const TABS_SECTION: ShortcutSection = {
  id: "tabs",
  title: "preview.sc.tabs",
  hints: [
    { keys: [COMMAND_KEY, "1"], label: "preview.sc.compositions" },
    { keys: [COMMAND_KEY, "2"], label: "preview.sc.assets" },
  ],
};

export const WORK_AREA_SECTION: ShortcutSection = {
  id: "workArea",
  title: "preview.sc.workArea",
  hints: [
    { keys: ["I"], label: "preview.sc.setIn" },
    { keys: ["Shift", "I"], label: "preview.sc.clearIn" },
    { keys: ["O"], label: "preview.sc.setOut" },
    { keys: ["Shift", "O"], label: "preview.sc.clearOut" },
    { keys: ["A"], label: "preview.sc.jumpIn" },
    { keys: ["E"], label: "preview.sc.jumpOut" },
  ],
};

export const KEYFRAMES_SECTION: ShortcutSection = {
  id: "keyframes",
  title: "preview.sc.keyframes",
  hints: [
    { keys: ["K"], label: "preview.sc.addKeyframe" },
    { keys: ["Del"], label: "preview.sc.deleteKeyframe" },
    { keys: ["H"], label: "preview.sc.holdBezier" },
    { keys: ["U"], label: "preview.sc.expand" },
    { keys: ["R"], label: "preview.sc.record" },
  ],
};

export const EDITING_SECTION: ShortcutSection = {
  id: "editing",
  title: "preview.sc.editing",
  hints: [
    { keys: [COMMAND_KEY, "Z"], label: "preview.sc.undo" },
    { keys: [COMMAND_KEY, "Shift", "Z"], label: "preview.sc.redo" },
    { keys: [COMMAND_KEY, "C"], label: "preview.sc.copy" },
    { keys: [COMMAND_KEY, "V"], label: "preview.sc.paste" },
    { keys: [COMMAND_KEY, "X"], label: "preview.sc.cut" },
    { keys: ["S"], label: "preview.sc.split" },
    { keys: ["Shift", { word: "preview.key.click" }], label: "preview.sc.razorAll" },
    { keys: [COMMAND_KEY, "G"], label: "preview.sc.group" },
    { keys: [COMMAND_KEY, "Shift", "G"], label: "preview.sc.ungroup" },
    { keys: ["Del"], label: "preview.sc.delete" },
  ],
};

export const GESTURES_SECTION: ShortcutSection = {
  id: "gestures",
  title: "preview.sc.gestures",
  hints: [
    { keys: [drag], label: "preview.sc.moveXY" },
    { keys: [scroll], label: "preview.sc.depth" },
    { keys: ["Shift", drag], label: "preview.sc.rotateXY" },
    { keys: ["Alt", drag], label: "preview.sc.rotate" },
    { keys: [COMMAND_KEY, drag], label: "preview.sc.opacity" },
    { keys: [COMMAND_KEY, scroll], label: "preview.sc.scale" },
  ],
};

export const MOTION_CROP_SECTION: ShortcutSection = {
  id: "motionCrop",
  title: "preview.sc.motionCrop",
  hints: [
    { keys: [drag], label: "preview.sc.moveKeyframe" },
    { keys: ["Alt", drag], label: "preview.sc.movePath" },
    { keys: ["Shift", { word: "preview.key.corner" }], label: "preview.sc.uniformResize" },
    { keys: [drag, { word: "preview.key.edge" }], label: "preview.sc.cropSide" },
    { keys: [drag, { word: "preview.key.center" }], label: "preview.sc.cropMove" },
  ],
};

/** Desktop dialog: rows of two columns, in the boards' order (St-Preview-Shortcuts, then -ShortcutsEdit). */
export const DESKTOP_SHORTCUT_ROWS: ShortcutSection[][][] = [
  [
    [PLAYBACK_SECTION, TABS_SECTION],
    [WORK_AREA_SECTION, KEYFRAMES_SECTION],
  ],
  [[EDITING_SECTION], [GESTURES_SECTION, MOTION_CROP_SECTION]],
];

/** Phone sheet: one column, no tabs (⌘1 / ⌘2 are desktop only). */
export const PHONE_SHORTCUT_SECTIONS: ShortcutSection[] = [
  PLAYBACK_SECTION,
  WORK_AREA_SECTION,
  EDITING_SECTION,
  GESTURES_SECTION,
  KEYFRAMES_SECTION,
  MOTION_CROP_SECTION,
];
