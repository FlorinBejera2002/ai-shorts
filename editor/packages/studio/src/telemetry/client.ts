import { recordBreadcrumb } from "./breadcrumbs";

type EventProperties = Record<string, string | number | boolean | undefined>;

/** SneepCut never sends usage data to an upstream analytics service. */
export function shouldTrack(): boolean {
  return false;
}

/** Retain a short, memory-only diagnostic trail for reports the user exports. */
export function trackEvent(event: string, properties: EventProperties = {}): void {
  recordBreadcrumb(event, properties);
}
