/** Transport volume glyph for the current mute state and level. */
export function volumeIconName(muted: boolean, volume: number) {
  if (muted || volume === 0) return "muted" as const;
  return volume >= 0.5 ? ("volume" as const) : ("volumeLow" as const);
}
