import { expect, it } from "vitest";
import { parseAutomation, projectAutomationTime, sampleAutomationLane } from "./audioAutomation";

it("preserves clipped curved automation within the existing scheduling resolution and point budget", () => {
  const source = parseAutomation(
    JSON.stringify({
      version: 1,
      lanes: [
        {
          target: "volume",
          points: [
            { t: 0, v: 0, curve: 0.7 },
            { t: 4, v: 1 },
            { t: 5, v: 0 },
          ],
        },
      ],
    }),
  );
  const projected = projectAutomationTime(source, 1, 2).lanes[0]!;
  expect(projected.points.length).toBeLessThanOrEqual(512);
  for (const time of [0, 0.15, 0.7, 1.4, 1.8]) {
    expect(sampleAutomationLane(projected, time)).toBeCloseTo(
      sampleAutomationLane(source.lanes[0]!, 1 + time * 2),
      3,
    );
  }
});
