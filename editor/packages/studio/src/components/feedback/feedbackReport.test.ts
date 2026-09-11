import { beforeEach, expect, it } from "vitest";
import { recordBreadcrumb, resetBreadcrumbs } from "../../telemetry/breadcrumbs";
import { createFeedbackReport } from "./feedbackReport";

beforeEach(resetBreadcrumbs);

it("prepares portable feedback with a sanitized local diagnostic trail", () => {
  recordBreadcrumb("studio:render", { status: "failed", token: "private-token" });
  const report = JSON.parse(createFeedbackReport({ comment: "Export stopped", rating: 3 }));
  expect(report.product).toBe("SneepCut Studio");
  expect(report.feedback).toEqual({ comment: "Export stopped", rating: 3 });
  expect(report.diagnostics.trail).toContain("render:failed");
  expect(JSON.stringify(report)).not.toContain("private-token");
});
