// Canvas chrome drawn over the composition (St-Preview-Resize, -Rotate, -Crop, -Marquee,
// -SnapGuides): white 2px outlines and white handles with a thin dark ring, so they read on
// any frame in both themes. The app's black primary would vanish on dark footage.
// Class strings are written out in full so Tailwind's scanner sees them.

/** Selected element outline. */
export const SELECTION_OUTLINE =
  "border-2 border-white [box-shadow:0_0_0_1px_color-mix(in_srgb,black_35%,transparent)]";
/** Outline for clip-path mirrored shapes (drawn inset so it follows the clip). */
export const SELECTION_OUTLINE_INSET = "shadow-[inset_0_0_0_2px_white]";
/** Group member outline inside a multi-selection. */
export const GROUP_MEMBER_OUTLINE =
  "border border-white [box-shadow:0_0_0_1px_color-mix(in_srgb,black_35%,transparent)]";
/** 10px resize handle. */
export const RESIZE_HANDLE =
  "h-[10px] w-[10px] rounded-full bg-white [box-shadow:0_0_0_1px_color-mix(in_srgb,black_35%,transparent)]";
/** Crop edge bar. */
export const CROP_BAR =
  "rounded-full bg-white [box-shadow:0_0_0_1px_color-mix(in_srgb,black_35%,transparent)]";
/** Dimmed area outside a crop. */
export const CROP_SHADE = "color-mix(in srgb, black 55%, transparent)";
/** Marquee rectangle while dragging. */
export const MARQUEE_RECT =
  "border border-dashed border-white bg-[color-mix(in_srgb,white_12%,transparent)]";
/** Snap guide line colour. */
export const GUIDE_COLOR = "white";
/** Grid line colour. */
export const GRID_LINE = "color-mix(in srgb, white 22%, transparent)";
