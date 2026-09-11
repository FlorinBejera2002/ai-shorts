import { breadcrumbTrail } from "../../telemetry/breadcrumbs";

/** Called only when the user explicitly prepares a report. No data leaves the browser. */
export function createFeedbackReport(feedback: Record<string, unknown>): string {
  return JSON.stringify(
    {
      product: "SneepCut Studio",
      createdAt: new Date().toISOString(),
      feedback,
      diagnostics: { trail: breadcrumbTrail() },
    },
    null,
    2,
  );
}
