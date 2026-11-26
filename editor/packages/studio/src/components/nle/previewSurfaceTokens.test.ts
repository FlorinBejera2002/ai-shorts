// Colour discipline for the preview and transport surfaces: no hard-coded navy, hex or
// rgba literals, and no opacity modifiers on token colours (they do not apply to var()).
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const studioSrc = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const SURFACE_FILES = [
  "components/nle/PreviewPane.tsx",
  "components/nle/PreviewOverlays.tsx",
  "components/nle/NLEPreview.tsx",
  "components/editor/DomEditOverlay.tsx",
  "components/nle/CompositionBreadcrumb.tsx",
  "components/nle/AssetPreviewOverlay.tsx",
  "components/editor/SnapToolbar.tsx",
  "components/editor/CanvasContextMenu.tsx",
  "components/editor/InlineTextToolbar.tsx",
  "components/StudioGlobalDragOverlay.tsx",
  "components/SourceImportNotice.tsx",
  "player/components/PlayerControls.tsx",
  "player/components/SpeedMenu.tsx",
  "player/components/ShortcutsPanel.tsx",
  "player/components/VolumeControl.tsx",
  "player/components/transport/TransportTools.tsx",
  "player/components/transport/ShortcutList.tsx",
  "components/nle/preview/previewChrome.tsx",
  "components/nle/preview/PreviewHeader.tsx",
  "components/nle/preview/PreviewStatus.tsx",
  "components/nle/preview/PhonePlaybackSheets.tsx",
  "components/nle/preview/CanvasModeChrome.tsx",
  "components/nle/preview/AssetMediaTransport.tsx",
  "components/editor/canvasChromeStyles.ts",
  "components/editor/OffCanvasIndicators.tsx",
];

// Data defaults (the colour a text run starts with) are not chrome colours.
const ALLOWED_LITERALS: Record<string, string[]> = {
  "components/editor/InlineTextToolbar.tsx": ['"#ffffff"'],
};

describe("preview surface colour discipline", () => {
  for (const file of SURFACE_FILES) {
    it(`${file} uses tokens instead of literal colours`, () => {
      const source = readFileSync(join(studioSrc, file), "utf8");
      const allowed = ALLOWED_LITERALS[file] ?? [];
      const literals = source.match(/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/g) ?? [];
      const unexpected = literals.filter((literal) => !allowed.some((a) => a.includes(literal)));
      expect(unexpected).toEqual([]);
      expect(source).not.toMatch(/studio-accent\/\d|studio-accent\/\[/);
      expect(source).not.toMatch(/neutral-(800|900|950)\/\d/);
      expect(source).not.toMatch(/bg-black\/\d/);
    });
  }
});
