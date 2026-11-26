// @vitest-environment happy-dom

// The header's Export opens the settings first; nothing renders until the dialog's own
// Export is pressed, and that render is followed by the export dialogs.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const startRender = vi.fn(async (_options: unknown) => {});
const waitForPendingDomEditSaves = vi.fn(async () => {});

vi.mock("../../contexts/StudioContext", () => ({
  useStudioShellContext: () => ({
    compositionDimensions: { width: 1080, height: 1920 },
    waitForPendingDomEditSaves,
    renderQueue: {
      isRendering: false,
      ffmpeg: { ok: true },
      ffmpegChecking: false,
      recheckFfmpeg: () => {},
      startRender,
    },
  }),
}));

const { ExportSettingsDialog } = await import("./ExportSettingsDialog");
const { closeExportSettings, openExportSettings } = await import("./exportSettingsDialogStore");

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let root: Root | null = null;
let host: HTMLElement;

beforeEach(() => {
  startRender.mockClear();
  localStorage.clear();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => root?.render(<ExportSettingsDialog />));
});

afterEach(() => {
  act(() => closeExportSettings());
  if (root) act(() => root?.unmount());
  root = null;
  document.body.innerHTML = "";
});

const dialog = () => document.querySelector('[data-testid="export-settings"]');
const exportButton = () =>
  [...(dialog()?.querySelectorAll("button") ?? [])].find((button) =>
    /^Export$/.test(button.textContent?.trim() ?? ""),
  );

describe("ExportSettingsDialog", () => {
  it("stays closed until the header asks for it", () => {
    expect(dialog()).toBeNull();
    act(() => openExportSettings());
    expect(dialog()?.textContent).toContain("Export clip");
    expect(dialog()?.textContent).toContain("MP4");
    expect(startRender).not.toHaveBeenCalled();
  });

  it("starts the chosen render with the export dialogs and closes", async () => {
    act(() => openExportSettings());
    await act(async () => {
      exportButton()?.click();
    });
    expect(dialog()).toBeNull();
    expect(startRender).toHaveBeenCalledTimes(1);
    expect(startRender.mock.calls[0][0]).toMatchObject({ format: "mp4", showExportFlow: true });
  });
});
