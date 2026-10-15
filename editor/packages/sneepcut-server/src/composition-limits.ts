export const COMPOSITION_REQUEST_MAX_BYTES = 8 * 1024 ** 2;

/** Explicit aggregate source budget; never an unbounded upload or memory allocation. */
export function compositionMaxBytes(): number {
  const configured = Number(process.env.SNEEPCUT_COMPOSITION_MAX_BYTES ?? 2 * 1024 ** 3);
  if (
    !Number.isSafeInteger(configured) ||
    configured < 512 * 1024 ** 2 ||
    configured > 16 * 1024 ** 3
  )
    throw new Error("SNEEPCUT_COMPOSITION_MAX_BYTES must be between 512 MiB and 16 GiB");
  return configured;
}
