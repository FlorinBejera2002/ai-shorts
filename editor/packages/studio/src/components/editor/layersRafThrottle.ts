/**
 * A trailing-rAF + cooldown throttle: `invoke` runs `run` at most once per
 * animation frame and no more often than `throttleMs`. `cancel` clears any
 * pending frame (call on cleanup). Extracted so the throttle can be exercised
 * directly in tests instead of being reconstructed there.
 */
export function createRafThrottle(
  run: () => void,
  throttleMs = 100,
): { invoke: () => void; cancel: () => void } {
  let rafId: number | null = null;
  let lastFired = 0;
  return {
    invoke: () => {
      const now = performance.now();
      if (rafId !== null || now - lastFired < throttleMs) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        lastFired = performance.now();
        run();
      });
    },
    cancel: () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
    },
  };
}
