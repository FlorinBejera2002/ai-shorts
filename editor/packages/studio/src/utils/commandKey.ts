interface NavigatorPlatformInfo {
  userAgentData?: { platform?: string };
  platform?: string;
}

/** True on Apple devices, where the command modifier is ⌘ rather than Ctrl. */
export function isApplePlatform(): boolean {
  const nav = navigator as NavigatorPlatformInfo;
  return /Mac|iPhone|iPad|iPod/i.test(nav.userAgentData?.platform ?? nav.platform ?? "");
}

/** Stand-in for the command modifier in shortcut data; shown as ⌘ on Apple devices, Ctrl elsewhere. */
export const COMMAND_KEY = "⌘";

/** Stand-in for the option modifier in shortcut data; shown as ⌥ on Apple devices, Alt elsewhere. */
export const OPTION_KEY = "⌥";

/** Label for the command modifier: ⌘ on Apple devices, Ctrl elsewhere (useAppHotkeys accepts both). */
export function commandKeyLabel(): string {
  return isApplePlatform() ? COMMAND_KEY : "Ctrl";
}

/** Label for the option modifier: ⌥ on Apple devices, Alt elsewhere. */
export function optionKeyLabel(): string {
  return isApplePlatform() ? OPTION_KEY : "Alt";
}

/** Maps a modifier stand-in to this platform's label; any other key cap is returned unchanged. */
export function modifierKeyLabel(key: string): string {
  if (key === COMMAND_KEY) return commandKeyLabel();
  if (key === OPTION_KEY) return optionKeyLabel();
  return key;
}
