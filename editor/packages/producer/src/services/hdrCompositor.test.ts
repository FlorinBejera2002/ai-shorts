import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeSync, mkdirSync, mkdtempSync, openSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ElementStackingInfo } from "@hyperframes/engine";
import { blitHdrImageLayer, blitHdrVideoLayer, selectDomLayerShowIds } from "./hdrCompositor.js";
import { createHdrImageTransferCache } from "./hdrImageTransferCache.js";

function makeEl(id: string, overrides?: Partial<ElementStackingInfo>): ElementStackingInfo {
  return {
    id,
    zIndex: 0,
    x: 0,
    y: 0,
    width: 1920,
    height: 1080,
    layoutWidth: 1920,
    layoutHeight: 1080,
    opacity: 1,
    visible: true,
    renderFrameVisible: false,
    isHdr: false,
    transform: "none",
    borderRadius: [0, 0, 0, 0],
    objectFit: "fill",
    objectPosition: "50% 50%",
    clipRect: null,
    ...overrides,
  };
}

describe("selectDomLayerShowIds", () => {
  it("does not re-show hidden DOM elements while preserving visible injected video frames", () => {
    expect(
      selectDomLayerShowIds(
        ["visible-overlay", "hidden-later-scene", "hidden-sdr-video"],
        [
          makeEl("visible-overlay"),
          makeEl("hidden-later-scene", { visible: false }),
          makeEl("hidden-sdr-video", {
            visible: false,
            renderFrameVisible: true,
          }),
        ],
      ),
    ).toEqual(["visible-overlay", "hidden-sdr-video"]);
  });

  it("does not re-show opacity-zero scene members or their injected frames", () => {
    expect(
      selectDomLayerShowIds(
        ["active-overlay", "inactive-scene-video", "inactive-scene-label"],
        [
          makeEl("active-overlay"),
          makeEl("inactive-scene-video", {
            opacity: 0,
            visible: false,
            renderFrameVisible: true,
          }),
          makeEl("inactive-scene-label", {
            opacity: 0,
            visible: true,
          }),
        ],
      ),
    ).toEqual(["active-overlay"]);
  });
});

describe("HDR layer opacity transfer", () => {
  // Independent SMPTE ST 2084 reference codes: 1000, 203 and 601.5 nits.
  const backgroundPq = 49271,
    foregroundPq = 38055,
    mixedPq = 45649;
  const frame = (code: number) => {
    const buffer = Buffer.alloc(2 * 2 * 6);
    for (let offset = 0; offset < buffer.length; offset += 2) buffer.writeUInt16LE(code, offset);
    return buffer;
  };
  let directory: string;
  let rawPath: string;
  let fd: number;
  beforeAll(() => {
    const temporary = fileURLToPath(new URL("../../../../../.cache/tmp/", import.meta.url));
    mkdirSync(temporary, { recursive: true });
    directory = mkdtempSync(join(temporary, "hdr-layer-opacity-"));
    if (!directory.startsWith(join(temporary, "hdr-layer-opacity-")))
      throw new Error("Unexpected HDR test cleanup directory");
    rawPath = join(directory, "source.rgb48le");
    writeFileSync(rawPath, frame(foregroundPq));
    fd = openSync(rawPath, "r");
  });
  afterAll(() => {
    if (fd !== undefined) closeSync(fd);
    if (directory) rmSync(directory, { recursive: true, force: true });
  });
  const cases: Array<{
    name: string;
    kind: "image" | "video";
    patch: Partial<ElementStackingInfo>;
  }> = [
    { name: "image region", kind: "image", patch: {} },
    { name: "image affine", kind: "image", patch: { transform: "matrix(1.2,0,0,1.2,0,0)" } },
    { name: "video region", kind: "video", patch: {} },
    {
      name: "video clipped region",
      kind: "video",
      patch: { clipRect: { x: 0, y: 0, width: 2, height: 2 } },
    },
    { name: "video affine", kind: "video", patch: { transform: "matrix(1.2,0,0,1.2,0,0)" } },
  ];
  it.each(cases)("forwards target transfer through $name", ({ kind, patch }) => {
    const canvas = frame(backgroundPq);
    const element = makeEl("layer", {
      width: 2,
      height: 2,
      layoutWidth: 2,
      layoutHeight: 2,
      opacity: 0.5,
      isHdr: true,
      ...patch,
    });
    if (kind === "image") {
      blitHdrImageLayer(
        canvas,
        element,
        new Map([["layer", { data: frame(foregroundPq), width: 2, height: 2 }]]),
        createHdrImageTransferCache(),
        2,
        2,
        undefined,
        "pq",
        "pq",
      );
    } else {
      blitHdrVideoLayer(
        canvas,
        element,
        0,
        30,
        new Map([
          [
            "layer",
            {
              dir: directory,
              rawPath,
              fd,
              width: 2,
              height: 2,
              frameSize: 24,
              frameCount: 1,
              scratch: Buffer.alloc(24),
            },
          ],
        ]),
        new Map([["layer", 0]]),
        2,
        2,
        undefined,
        "pq",
        "pq",
      );
    }
    for (const offset of [0, 2, 4])
      expect(Math.abs(canvas.readUInt16LE(offset) - mixedPq)).toBeLessThanOrEqual(1);
  });
  it("retains signal-space opacity when no HDR target transfer is requested", () => {
    const canvas = frame(0);
    blitHdrImageLayer(
      canvas,
      makeEl("layer", { width: 2, height: 2, opacity: 0.5 }),
      new Map([["layer", { data: frame(65535), width: 2, height: 2 }]]),
      createHdrImageTransferCache(),
      2,
      2,
    );
    expect(canvas.readUInt16LE(0)).toBe(32768);
  });
});
