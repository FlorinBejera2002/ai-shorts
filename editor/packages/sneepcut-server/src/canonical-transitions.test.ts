import { expect, test } from "bun:test";
import { parseHTML } from "linkedom";
import { canonicalFixture } from "./canonical-composition.test";
import { compileCanonicalComposition, parseCanonicalComposition } from "./canonical-composition";

test("persists visual transition intent on the editable host without changing nominal clocks", () => {
  const plan = canonicalFixture();
  delete plan.scenes[0]!.fade_out;
  delete plan.scenes[1]!.fade_in;
  plan.scenes[1]!.transition_in = 0.3;
  const parsed = parseCanonicalComposition(plan);
  expect(parsed.scenes[1]!.transition_in).toBe(0.3);
  expect(parsed.audio).toEqual(plan.audio);
  const result = compileCanonicalComposition(
    parsed,
    new Map(plan.assets.map((asset) => [asset.id, `assets/${asset.id}.mp4`])),
  );
  const { document } = parseHTML(result.files.get("index.html")!);
  const incoming = document.getElementById("scene-second")!;
  expect(incoming.getAttribute("data-transition-in")).toBe("0.3");
  expect(incoming.getAttribute("data-start")).toBe("2");
  expect(incoming.getAttribute("data-duration")).toBe("2");
  expect(incoming.getAttribute("data-playback-start")).toBe("4");
  expect(document.querySelectorAll("[data-hf-visual-transition]")).toHaveLength(0);
  expect(result.files.get("index.html")).not.toContain("{opacity:0}");
});

test("rejects malformed visual transition metadata", () => {
  for (const transition_in of [-0.3, "0.3", NaN, Infinity, 3]) {
    const plan = canonicalFixture();
    expect(() =>
      parseCanonicalComposition({
        ...plan,
        scenes: plan.scenes.map((scene, i) => (i === 1 ? { ...scene, transition_in } : scene)),
      }),
    ).toThrow();
  }
});
