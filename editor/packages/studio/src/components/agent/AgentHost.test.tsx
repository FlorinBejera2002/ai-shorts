// @vitest-environment happy-dom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AgentHost } from "./AgentHost";
import { closeAgent, openAgent } from "./agentSession";
import { AgentApiError, AgentOfflineError, type AgentApi } from "./agentApi";
import type { AgentRun } from "./agentModel";
import { resetLauncherGreeting } from "./AnaRaduLauncher";
import { createPersistentEditHistoryController } from "../../hooks/usePersistentEditHistory";
import { createMemoryEditHistoryStorage } from "../../utils/editHistoryStorage";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const PROJECT = "11111111-1111-4111-8111-111111111111";

const mocks = vi.hoisted(() => ({
  projectId: "project-1",
  files: {
    flushPendingSourceSave: vi.fn(),
    readProjectFile: vi.fn(),
    writeProjectFile: vi.fn(),
    updateEditingFileContent: vi.fn(),
    editingPathRef: { current: "scenes/intro.html" as string | undefined },
  },
  wait: vi.fn(),
  refresh: vi.fn(),
  undo: vi.fn(),
  undoLabel: "AI edit" as string | undefined,
  record: vi.fn(),
}));
vi.mock("../../contexts/FileManagerContext", () => ({ useFileManagerContext: () => mocks.files }));
vi.mock("../../contexts/StudioContext", () => ({
  useStudioShellContext: () => ({
    projectId: mocks.projectId,
    activeCompPath: "scenes/intro.html",
    writeBlockedReason: null,
    waitForPendingDomEditSaves: mocks.wait,
    showToast: vi.fn(),
    editHistory: { canUndo: true, canRedo: false, undoLabel: mocks.undoLabel },
    handleUndo: mocks.undo,
  }),
  useStudioPlaybackContext: () => ({ setRefreshKey: mocks.refresh }),
}));

function run(patch: Partial<AgentRun>): AgentRun {
  return {
    id: "run-1",
    message: "Mărește titlul",
    reply: "",
    status: "running",
    context: { route: "/dashboard/studio" },
    created_at: "2026-11-25T10:00:00Z",
    updated_at: "2026-11-25T10:00:00Z",
    revision: 1,
    cost_credits: 0,
    ...patch,
  };
}

function offlineApi(): AgentApi {
  const offline = () => Promise.reject(new AgentOfflineError("offline"));
  return {
    preferences: vi.fn(offline),
    list: vi.fn(offline),
    run: vi.fn(offline),
    send: vi.fn(offline),
    control: vi.fn(offline),
    suggestions: vi.fn(offline),
    dismiss: vi.fn(offline),
  };
}

function onlineApi(): AgentApi {
  return {
    preferences: vi.fn().mockResolvedValue({ follow: false, recommendations: true }),
    list: vi.fn().mockResolvedValue({ runs: [], hasMore: false }),
    run: vi.fn(),
    send: vi.fn(),
    control: vi.fn(),
    suggestions: vi.fn().mockResolvedValue([
      {
        id: "s1",
        title: "Mărește subtitrările",
        description: "Subtitrări mai mari pentru telefon",
        action: { name: "studio.revise", input: {} },
        missing_resources: [],
        cost_credits: 0,
      },
    ]),
    dismiss: vi.fn().mockResolvedValue(undefined),
  };
}

let root: ReturnType<typeof createRoot>;
let container: HTMLDivElement;

type HostProps = React.ComponentProps<typeof AgentHost>;

async function render(api: AgentApi, extra: Partial<HostProps> = {}) {
  await act(async () => {
    root.render(
      <AgentHost
        recordEdit={mocks.record}
        selection={null}
        onSelectionSubmit={vi.fn()}
        onSelectionClose={vi.fn()}
        api={api}
        {...extra}
      />,
    );
  });
}

async function openPanel() {
  await act(async () => openAgent());
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.projectId = "project-1";
  mocks.undoLabel = "AI edit";
  mocks.files.flushPendingSourceSave.mockResolvedValue({ status: "clean" });
  mocks.files.readProjectFile.mockResolvedValue("<html>original</html>");
  mocks.files.writeProjectFile.mockResolvedValue(undefined);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string) =>
      String(input).endsWith("/api/projects")
        ? Response.json({ projects: [{ id: "project-1", title: "Interviu Mara" }] })
        : Response.json({ html: "<html>edited</html>", summary: "Updated title" }),
    ),
  );
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  act(() => closeAgent());
  container.remove();
  vi.unstubAllGlobals();
});

function typeMessage(text: string) {
  const field = container.querySelector("textarea")!;
  const setValue = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
  act(() => {
    setValue.call(field, text);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function send(text = "Make the title bigger") {
  typeMessage(text);
  await act(async () => {
    container
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
}

function button(text: string) {
  const found = Array.from(document.querySelectorAll("button")).find(
    (node) => node.textContent?.trim() === text || node.getAttribute("aria-label") === text,
  );
  if (!found) throw new Error(`no button ${text}`);
  return found;
}

async function click(text: string) {
  await act(async () => button(text).click());
}

/** The Undo action of the "applied" toast (run cards have their own Undo). */
function toastUndo() {
  const toast = Array.from(document.querySelectorAll('[role="status"]')).find((node) =>
    node.querySelector("button"),
  );
  return Array.from(toast?.querySelectorAll("button") ?? []).find(
    (node) => node.textContent?.trim() === "Undo",
  );
}

const assistantCalls = () =>
  vi.mocked(fetch).mock.calls.filter(([url]) => String(url).endsWith("/assistant"));

describe("launcher", () => {
  it("greets once and opens the docked panel", async () => {
    resetLauncherGreeting();
    await render(offlineApi());
    expect(container.textContent).toContain("Hi! How can we help?");
    await click("Open Ana & Radu");
    expect(container.querySelector("#workspace-agent-panel")).not.toBeNull();
    expect(container.querySelector("[data-agent-launcher]")).toBeNull();
    await click("Collapse panel");
    expect(container.querySelector("#workspace-agent-panel")).toBeNull();
  });
});

describe("offline: Studio composition proposals", () => {
  beforeEach(async () => {
    await render(offlineApi());
    await openPanel();
  });

  it("shows the offline state and still reviews a version-checked edit with undo", async () => {
    expect(container.textContent).toContain("Ana & Radu are offline");
    expect(container.querySelector('img[src$="agent-offline.webp"]')).not.toBeNull();
    await send();
    expect(mocks.files.readProjectFile).toHaveBeenCalledWith("scenes/intro.html");
    expect(assistantCalls()[0][0]).toBe("/api/projects/project-1/assistant");
    expect(mocks.files.writeProjectFile).not.toHaveBeenCalled();
    expect(container.querySelector('[aria-label="AI proposal"]')?.textContent).toContain(
      "Needs approval",
    );
    await click("Approve action");
    expect(mocks.files.writeProjectFile).toHaveBeenCalledWith(
      "scenes/intro.html",
      "<html>edited</html>",
      "<html>original</html>",
    );
    expect(mocks.record).toHaveBeenCalledWith(
      expect.objectContaining({
        label: "AI edit",
        files: {
          "scenes/intro.html": { before: "<html>original</html>", after: "<html>edited</html>" },
        },
      }),
    );
    expect(mocks.refresh).toHaveBeenCalledOnce();
    expect(document.body.textContent).toContain("The agent applied the change");
    mocks.files.readProjectFile.mockResolvedValue("<html>edited</html>");
    await click("Undo");
    expect(mocks.undo).toHaveBeenCalledOnce();
  });

  it("does not undo when the composition changed after the agent edit", async () => {
    await send();
    await click("Approve action");
    mocks.files.readProjectFile.mockResolvedValue("<html>edited by hand</html>");
    await click("Undo");
    expect(mocks.undo).not.toHaveBeenCalled();
  });

  it("keeps a conflicting proposal for review without recording or refreshing it", async () => {
    await send();
    mocks.files.writeProjectFile.mockRejectedValueOnce(new Error("The composition changed"));
    await click("Approve action");
    expect(container.querySelector('[role="alert"]')?.textContent).toBe("The composition changed");
    expect(container.querySelector('[aria-label="AI proposal"]')).not.toBeNull();
    expect(mocks.record).not.toHaveBeenCalled();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("rejects a proposal without writing", async () => {
    await send();
    await click("Reject");
    expect(mocks.files.writeProjectFile).not.toHaveBeenCalled();
    expect(container.textContent).toContain("Rejected");
  });

  it("does not ask AI while local source changes failed to save", async () => {
    mocks.files.flushPendingSourceSave.mockResolvedValue({ status: "blocked" });
    await send();
    expect(assistantCalls()).toHaveLength(0);
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("Save or resolve");
  });

  it("reports unavailable AI without changing the composition", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 503 }));
    await send();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("unavailable");
    expect(mocks.files.writeProjectFile).not.toHaveBeenCalled();
  });

  it("refuses a proposal from another project", async () => {
    await send();
    mocks.projectId = "project-2";
    await render(offlineApi());
    await click("Approve action");
    expect(mocks.files.writeProjectFile).not.toHaveBeenCalled();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("project changed");
  });

  it("locks duplicate submissions synchronously", async () => {
    typeMessage("Make the title bigger");
    await act(async () => {
      const form = container.querySelector("form")!;
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    expect(assistantCalls()).toHaveLength(1);
  });

  it("does not send a stopped request when the pending file read resolves", async () => {
    let resolveRead!: (source: string) => void;
    mocks.files.readProjectFile.mockReturnValueOnce(
      new Promise<string>((resolve) => {
        resolveRead = resolve;
      }),
    );
    await send();
    await act(async () => {
      button("Stop").click();
      resolveRead("<html>original</html>");
    });
    expect(assistantCalls()).toHaveLength(0);
    expect(container.textContent).toContain("Stopped");
  });

  it("rejects an empty composition without offering an approve action", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({ html: "  ", summary: "Updated" }));
    await send();
    expect(container.querySelector('[aria-label="AI proposal"]')).toBeNull();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("invalid proposal");
  });
});

describe("offline: selected element", () => {
  it("sends a selected element instruction for its source composition", async () => {
    const onSelectionSubmit = vi
      .fn()
      .mockResolvedValue({ message: "Change the selected headline", path: "scenes/outro.html" });
    await render(offlineApi(), { selection: { label: "Headline" }, onSelectionSubmit });
    expect(container.textContent).toContain("Selection: Headline");
    await send("Change the headline colour");
    expect(onSelectionSubmit).toHaveBeenCalledWith("Change the headline colour");
    expect(mocks.files.readProjectFile).toHaveBeenCalledWith("scenes/outro.html");
    // The conversation shows the user's words, not the generated element prompt.
    expect(container.textContent).toContain("Change the headline colour");
    await click("Approve action");
    expect(mocks.files.writeProjectFile).toHaveBeenCalledWith(
      "scenes/outro.html",
      "<html>edited</html>",
      "<html>original</html>",
    );
  });

  it("persists the approved proposal and restores the original source after reload", async () => {
    const storage = createMemoryEditHistoryStorage();
    const options = { projectId: "project-1", storage, onChange: () => {} };
    const history = await createPersistentEditHistoryController(options);
    await render(offlineApi(), { recordEdit: history.recordEdit });
    await openPanel();
    await send();
    await click("Approve action");
    const reloaded = await createPersistentEditHistoryController(options);
    expect(reloaded.snapshot().undoLabel).toBe("AI edit");
    const writeFile = vi.fn();
    await reloaded.undo({ readFile: async () => "<html>edited</html>", writeFile });
    expect(writeFile).toHaveBeenCalledWith("scenes/intro.html", "<html>original</html>");
  });
});

describe("online: workspace agent", () => {
  it("shows suggestions; Do it sends the suggestion with the Studio context", async () => {
    mocks.projectId = PROJECT;
    const api = onlineApi();
    vi.mocked(api.send).mockResolvedValue(
      run({
        id: "r1",
        status: "waiting_for_confirmation",
        action: { name: "studio.revise", input: {} },
      }),
    );
    vi.mocked(api.control).mockResolvedValue(
      run({
        id: "r1",
        status: "running",
        revision: 2,
        action: { name: "studio.revise", input: {} },
      }),
    );
    await render(api);
    await openPanel();
    expect(container.textContent).toContain("Suggested next steps");
    await click("Explain");
    expect(container.textContent).toContain("Subtitrări mai mari pentru telefon");
    await click("Do it");
    expect(api.send).toHaveBeenCalledWith(
      expect.objectContaining({
        suggestion_id: "s1",
        context: expect.objectContaining({ route: "/dashboard/studio", project_id: PROJECT }),
      }),
    );
    expect(container.textContent).toContain("Needs approval");
    await click("Approve action");
    expect(api.control).toHaveBeenCalledWith(
      expect.objectContaining({ id: "r1" }),
      "approve",
      undefined,
    );
    expect(container.textContent).toContain("Working");
    expect(assistantCalls()).toHaveLength(0);
  });

  it("sends a message with the selected layer and clears the composer", async () => {
    mocks.projectId = PROJECT;
    const api = onlineApi();
    vi.mocked(api.send).mockResolvedValue(run({ id: "r2", message: "Fă cuvântul galben" }));
    await render(api, { selection: { label: "Subtitrare", ids: ["caption-1"] } });
    await send("Fă cuvântul galben");
    expect(api.send).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "Fă cuvântul galben",
        context: expect.objectContaining({ studio_selection: ["caption-1"], locale: "en" }),
      }),
    );
    expect(container.querySelector("textarea")!.value).toBe("");
  });

  it("pauses and stops a working run", async () => {
    const api = onlineApi();
    const working = run({ id: "r3", action: { name: "studio.edit", input: {} } });
    vi.mocked(api.list).mockResolvedValue({ runs: [working], hasMore: false });
    vi.mocked(api.control).mockImplementation(async (target, command) =>
      run({
        ...target,
        revision: target.revision + 1,
        status: command === "pause" ? "paused" : "cancelled",
      }),
    );
    await render(api);
    await openPanel();
    await click("Pause");
    expect(api.control).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: "r3" }),
      "pause",
      undefined,
    );
    expect(container.textContent).toContain("Paused");
    await click("Stop");
    expect(container.textContent).toContain("Stopped");
  });

  it("refreshes the preview and offers Undo when a run finishes a Studio edit", async () => {
    vi.useFakeTimers();
    try {
      const api = onlineApi();
      const working = run({ id: "r4", action: { name: "studio.edit", input: {} } });
      const done = run({
        id: "r4",
        status: "completed",
        revision: 2,
        action: { name: "studio.edit", input: {} },
        result: { summary: "Gata", undo: { token: "u" } },
      });
      vi.mocked(api.list).mockResolvedValue({ runs: [working], hasMore: false });
      vi.mocked(api.run).mockResolvedValue(done);
      vi.mocked(api.control).mockResolvedValue({ ...done, revision: 3 });
      await render(api);
      await openPanel();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2100);
      });
      expect(mocks.refresh).toHaveBeenCalledOnce();
      expect(document.body.textContent).toContain("The agent applied the change");
      const toast = document.body.querySelector('[role="status"] button')!;
      expect(toast.textContent).toBe("Undo");
      await act(async () => (toast as HTMLButtonElement).click());
      expect(api.control).toHaveBeenCalledWith(
        expect.objectContaining({ id: "r4" }),
        "undo",
        undefined,
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("prefills the composer and the chip from openAgent context", async () => {
    await render(onlineApi());
    await act(async () =>
      openAgent({ context: { prompt: "Fix 3 errors", label: "Preview errors · 3", kind: "lint" } }),
    );
    expect(container.querySelector("textarea")!.value).toBe("Fix 3 errors");
    expect(container.textContent).toContain("Preview errors · 3");
    await click("Remove from context");
    expect(container.textContent).toContain("Studio · Interviu Mara");
  });
  it("sends a new message after an ambiguous failure, and Retry resends the failed one", async () => {
    mocks.projectId = PROJECT;
    const api = onlineApi();
    vi.mocked(api.send)
      .mockRejectedValueOnce(new AgentApiError("Server error", 500))
      .mockResolvedValueOnce(run({ id: "r6", message: "Al doilea" }))
      .mockRejectedValueOnce(new AgentApiError("Server error", 500))
      .mockResolvedValueOnce(run({ id: "r7", message: "Al treilea" }));
    await render(api);
    await openPanel();
    await send("Primul");
    expect(container.textContent).toContain("Server error");
    expect(button("Retry")).toBeTruthy();
    await send("Al doilea");
    const bodies = () => vi.mocked(api.send).mock.calls.map(([body]) => body);
    expect(bodies()[1].message).toBe("Al doilea");
    expect(bodies()[1].request_id).not.toBe(bodies()[0].request_id);
    await send("Al treilea");
    await click("Retry");
    expect(bodies()[3]).toEqual(bodies()[2]);
    expect(container.textContent).not.toContain("Server error");
  });

  it("reports a run completed on send, reloads the editor, and an undo as undone", async () => {
    vi.useFakeTimers();
    try {
      mocks.projectId = PROJECT;
      const api = onlineApi();
      const edit = { name: "studio.edit", input: {} };
      const old = run({ id: "r0", status: "completed", action: edit, result: { undo: {} } });
      vi.mocked(api.list).mockResolvedValue({ runs: [old], hasMore: false });
      const done = run({ id: "r8", status: "completed", action: edit, result: { undo: {} } });
      const undoing = run({
        id: "r8-undo",
        message: "Undo: Mărește titlul",
        action: { name: "studio.restore", input: {} },
        created_at: "2026-11-25T10:01:00Z",
      });
      vi.mocked(api.send).mockResolvedValue(done);
      vi.mocked(api.control).mockResolvedValue(undoing);
      vi.mocked(api.run).mockResolvedValue({ ...undoing, status: "completed", revision: 2 });
      mocks.files.readProjectFile.mockResolvedValue("<html>agent</html>");
      await render(api);
      await openPanel();
      // History is not reported again.
      expect(mocks.refresh).not.toHaveBeenCalled();
      await send("Mărește titlul");
      expect(mocks.refresh).toHaveBeenCalledOnce();
      expect(mocks.files.updateEditingFileContent).toHaveBeenCalledWith(
        "scenes/intro.html",
        "<html>agent</html>",
      );
      await act(async () => toastUndo()!.click());
      expect(api.control).toHaveBeenCalledWith(
        expect.objectContaining({ id: "r8" }),
        "undo",
        undefined,
      );
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2100);
      });
      expect(mocks.refresh).toHaveBeenCalledTimes(2);
      expect(document.body.textContent).toContain("The change was undone");
      expect(toastUndo()).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps the hand-off chip when the open panel is reopened, then removes it", async () => {
    await render(onlineApi());
    await act(async () => openAgent({ context: { label: "Preview errors · 3", kind: "lint" } }));
    await act(async () => openAgent());
    expect(container.textContent).toContain("Preview errors · 3");
    await click("Remove from context");
    expect(container.textContent).not.toContain("Preview errors · 3");
  });

  it("sends the handed-over layer ids as the Studio selection", async () => {
    mocks.projectId = PROJECT;
    const api = onlineApi();
    vi.mocked(api.send).mockResolvedValue(run({ id: "r9" }));
    await render(api);
    await act(async () => openAgent({ context: { label: "Titlu", ids: ["title-1"] } }));
    await send("Fă-l mai mare");
    expect(api.send).toHaveBeenCalledWith(
      expect.objectContaining({
        context: expect.objectContaining({ studio_selection: ["title-1"] }),
      }),
    );
  });
});

describe("offline: handed-over context", () => {
  it("edits the handed-over composition, not a time range label", async () => {
    await render(offlineApi());
    await act(async () => openAgent({ context: { path: "scenes/outro.html", kind: "range" } }));
    await send();
    expect(mocks.files.readProjectFile).toHaveBeenCalledWith("scenes/outro.html");
    await act(async () => closeAgent());
    await act(async () => openAgent({ context: { path: "1.00s – 2.00s", kind: "range" } }));
    await send();
    expect(mocks.files.readProjectFile).toHaveBeenLastCalledWith("scenes/intro.html");
  });
});
