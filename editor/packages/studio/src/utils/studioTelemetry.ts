import { recordBreadcrumb } from "../telemetry/breadcrumbs";

type EventProperties = Record<string, string | number | boolean | null | undefined>;

/** Keep local diagnostics without collecting identifiers or sending network requests. */
export function trackStudioEvent(event: string, properties: EventProperties = {}): void {
  recordBreadcrumb(event, properties);
}

/** Compatibility hook for existing lifecycle callers; nothing leaves the browser. */
export function flushViaBeacon(): void {}
