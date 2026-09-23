// @vitest-environment happy-dom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { StudioAssistant } from "./StudioAssistant";
import { openAssistantDraft } from "./assistantDraft";
import { createPersistentEditHistoryController } from "../../hooks/usePersistentEditHistory";
import { createMemoryEditHistoryStorage } from "../../utils/editHistoryStorage";

const mocks = vi.hoisted(() => ({
  projectId: "project-1",
  files: {
    flushPendingSourceSave: vi.fn(),
    readProjectFile: vi.fn(),
    writeProjectFile: vi.fn(),
    updateEditingFileContent: vi.fn(),
  },
  wait: vi.fn(),
  refresh: vi.fn(),
  toast: vi.fn(),
  record: vi.fn(),
}));
vi.mock("../../contexts/FileManagerContext", () => ({ useFileManagerContext: () => mocks.files }));
vi.mock("../../contexts/StudioContext", () => ({
  useStudioShellContext: () => ({
    projectId: mocks.projectId,
    activeCompPath: "scenes/intro.html",
    writeBlockedReason: null,
    waitForPendingDomEditSaves: mocks.wait,
    showToast: mocks.toast,
  }),
  useStudioPlaybackContext: () => ({ setRefreshKey: mocks.refresh }),
}));
let root: ReturnType<typeof createRoot>;
let container: HTMLDivElement;
beforeEach(() => {
  vi.clearAllMocks();
  mocks.projectId = "project-1";
  mocks.files.flushPendingSourceSave.mockResolvedValue({ status: "clean" });
  mocks.files.readProjectFile.mockResolvedValue("<html>original</html>");
  mocks.files.writeProjectFile.mockResolvedValue(undefined);
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(Response.json({ html: "<html>edited</html>", summary: "Updated title" })),
  );
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root.render(<StudioAssistant recordEdit={mocks.record} />));
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

async function generate() {
  await act(async () => {
    container
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
}
async function apply() {
  const button = Array.from(container.querySelectorAll("button")).find(
    (node) => node.textContent === "Apply edit",
  )!;
  await act(async () => button.click());
}

it("reviews the active composition before a version-checked write and records undo", async () => {
  await generate();
  expect(mocks.files.readProjectFile).toHaveBeenCalledWith("scenes/intro.html");
  expect(fetch).toHaveBeenCalledWith(
    "/api/projects/project-1/assistant",
    expect.objectContaining({ method: "POST" }),
  );
  expect(mocks.files.writeProjectFile).not.toHaveBeenCalled();
  await apply();
  expect(mocks.files.writeProjectFile).toHaveBeenCalledWith(
    "scenes/intro.html",
    "<html>edited</html>",
    "<html>original</html>",
  );
  expect(mocks.record).toHaveBeenCalledWith(
    expect.objectContaining({
      files: {
        "scenes/intro.html": { before: "<html>original</html>", after: "<html>edited</html>" },
      },
    }),
  );
  expect(mocks.refresh).toHaveBeenCalledOnce();
  expect(mocks.toast).toHaveBeenCalledWith(
    "AI edit applied. You can undo it from the toolbar.",
    "info",
  );
});
it("keeps a conflicting proposal for review without recording or refreshing it", async () => {
  await generate();
  mocks.files.writeProjectFile.mockRejectedValueOnce(new Error("The composition changed"));
  await apply();
  expect(container.querySelector('[role="alert"]')?.textContent).toBe("The composition changed");
  expect(container.querySelector('[aria-label="AI proposal"]')).not.toBeNull();
  expect(mocks.record).not.toHaveBeenCalled();
  expect(mocks.refresh).not.toHaveBeenCalled();
});
it("does not ask AI while local source changes failed to save", async () => {
  mocks.files.flushPendingSourceSave.mockResolvedValue({ status: "blocked" });
  await generate();
  expect(fetch).not.toHaveBeenCalled();
  expect(container.querySelector('[role="alert"]')?.textContent).toContain("Save or resolve");
});
it("reports unavailable AI without changing the composition", async () => {
  vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 503 }));
  await generate();
  expect(container.querySelector('[role="alert"]')?.textContent).toContain("unavailable");
  expect(mocks.files.writeProjectFile).not.toHaveBeenCalled();
});

it("routes a selected element instruction to its source composition", async () => {
  const modal = container.querySelector("dialog")!;
  modal.showModal = vi.fn();
  act(() =>
    openAssistantDraft({ message: "Change the selected headline", path: "scenes/outro.html" }),
  );
  expect(modal.showModal).toHaveBeenCalledOnce();
  expect(container.querySelector("textarea")?.value).toBe("Change the selected headline");
  await generate();
  expect(mocks.files.readProjectFile).toHaveBeenCalledWith("scenes/outro.html");
  await apply();
  expect(mocks.files.writeProjectFile).toHaveBeenCalledWith(
    "scenes/outro.html",
    "<html>edited</html>",
    "<html>original</html>",
  );
});

it("refuses a proposal from another project even if mounted without the header key", async () => {
  await generate();
  mocks.projectId = "project-2";
  act(() => root.render(<StudioAssistant recordEdit={mocks.record} />));
  await apply();
  expect(mocks.files.writeProjectFile).not.toHaveBeenCalled();
  expect(container.querySelector('[role="alert"]')?.textContent).toContain("project changed");
});

it("locks duplicate submissions synchronously", async () => {
  await act(async () => {
    const form = container.querySelector("form")!;
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
  expect(fetch).toHaveBeenCalledOnce();
});

it("does not send a cancelled request when the pending file read resolves", async () => {
  let resolveRead!: (source: string) => void;
  mocks.files.readProjectFile.mockReturnValueOnce(
    new Promise<string>((resolve) => {
      resolveRead = resolve;
    }),
  );
  await generate();
  const cancel = Array.from(container.querySelectorAll("button")).find(
    (node) => node.textContent === "Cancel",
  )!;
  await act(async () => {
    cancel.click();
    resolveRead("<html>original</html>");
  });
  expect(fetch).not.toHaveBeenCalled();
});

it("rejects an empty composition without offering an apply action", async () => {
  vi.mocked(fetch).mockResolvedValueOnce(Response.json({ html: "  ", summary: "Updated" }));
  await generate();
  expect(container.querySelector('[aria-label="AI proposal"]')).toBeNull();
  expect(container.querySelector('[role="alert"]')?.textContent).toContain("invalid proposal");
});

it("persists the applied proposal in history and restores its original source after reload", async () => {
  const storage = createMemoryEditHistoryStorage();
  const options = { projectId: "project-1", storage, onChange: () => {} };
  const history = await createPersistentEditHistoryController(options);
  act(() => root.render(<StudioAssistant recordEdit={history.recordEdit} />));
  await generate();
  await apply();
  const reloaded = await createPersistentEditHistoryController(options);
  expect(reloaded.snapshot().undoLabel).toBe("AI edit");
  const writeFile = vi.fn();
  await reloaded.undo({ readFile: async () => "<html>edited</html>", writeFile });
  expect(writeFile).toHaveBeenCalledWith("scenes/intro.html", "<html>original</html>");
  expect(reloaded.snapshot().canRedo).toBe(true);
});
