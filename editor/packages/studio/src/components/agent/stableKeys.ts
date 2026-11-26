/**
 * Pairs each item with a React key derived from its content. Items that share content get an
 * occurrence suffix (`text#0`, `text#1`), so keys stay unique without depending on list position.
 */
export function withContentKeys<T>(
  items: readonly T[],
  contentOf: (item: T) => string,
): { key: string; item: T }[] {
  const occurrences = new Map<string, number>();
  return items.map((item) => {
    const content = contentOf(item);
    const occurrence = occurrences.get(content) ?? 0;
    occurrences.set(content, occurrence + 1);
    return { key: `${content}#${occurrence}`, item };
  });
}
