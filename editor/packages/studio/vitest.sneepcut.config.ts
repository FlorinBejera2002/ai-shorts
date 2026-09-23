import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// These local privacy/report tests do not need the render server or its build output.
export default defineConfig({
  resolve: {
    alias: {
      "@hyperframes/core/canary-registry": fileURLToPath(
        new URL("../core/src/canaryRegistry.ts", import.meta.url),
      ),
      "@hyperframes/core/canary": fileURLToPath(new URL("../core/src/canary.ts", import.meta.url)),
    },
  },
  test: {
    include: [
      "src/telemetry/client.test.ts",
      "src/telemetry/policy.test.ts",
      "src/utils/studioTelemetry.test.ts",
      "src/components/feedback/feedbackReport.test.ts",
      "src/components/assistant/*.test.tsx",
    ],
  },
});
