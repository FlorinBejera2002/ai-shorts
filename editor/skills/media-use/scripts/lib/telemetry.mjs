// SneepCut keeps the workflow API without analytics, account reads or identities.
// Environment flags cannot enable upstream delivery.
export function optedOut() {
  return true;
}
export async function track(_event, _properties = {}) {}
export function __anonymousIdForTest() {
  return null;
}
export function __resetTelemetryForTest() {}
