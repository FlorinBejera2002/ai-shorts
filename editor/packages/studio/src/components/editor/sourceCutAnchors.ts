/** Browsers serialise "top" as "center top"; map either form to the anchor's name. */
export function positionAnchor(value: string): string {
  const parts = value
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter((part) => part !== "center" && part !== "50%");
  if (parts.length === 0) return "center";
  return parts.length === 1 ? parts[0] : value;
}
