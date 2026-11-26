export const DEFAULT_COLOR = "#ffffff";

/**
 * The selection's colours as one swatch: a diagonal sweep through each distinct
 * colour, evenly spaced. A selection with one colour is a plain swatch.
 *
 * Distinct rather than weighted, and evenly spaced rather than proportional,
 * matching the mixed-colour swatch in the design tool this sits alongside. The
 * swatch answers "which colours are in here", and at 16px a colour used by one
 * character has to be as visible as one used by thirty or it may as well not be
 * drawn.
 */
export function swatchBackground(
  distinctColours: readonly string[],
  agreed: string | undefined,
): string {
  if (distinctColours.length === 0) return agreed || DEFAULT_COLOR;
  if (distinctColours.length === 1) return distinctColours[0]!;
  const stops = distinctColours.map(
    (colour, index) => `${colour} ${((index / (distinctColours.length - 1)) * 100).toFixed(2)}%`,
  );
  return `linear-gradient(135deg, ${stops.join(", ")})`;
}
