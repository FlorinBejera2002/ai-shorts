/**
 * SneepCut does not enrol browsers in upstream measurement or percentage rollouts.
 * Explicit local feature overrides remain available through the canary adapter.
 */
export function browserTelemetryAllowed(): boolean {
  return false;
}
