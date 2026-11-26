// @vitest-environment happy-dom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setStudioLocale } from "../i18n/translate";
import { copyTextToClipboard } from "../utils/clipboard";
import { LintModal, type LintFinding } from "./LintModal";
import { openAgent } from "./agent/agentSession";

vi.mock("../utils/clipboard", () => ({ copyTextToClipboard: vi.fn() }));
vi.mock("./agent/agentSession", () => ({ openAgent: vi.fn() }));

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;

const findings: LintFinding[] = [
  {
    severity: "error",
    message: "Elementul „titlu” nu are durată",
    file: "compositions/intro.html",
    fixHint: "Setează data-duration",
  },
  { severity: "error", message: "Lipsește clasa „clip”", file: "compositions/outro.html" },
  { severity: "warning", message: "Font neîncărcat: Sora", file: "styles.css" },
];

beforeEach(() => {
  setStudioLocale("ro");
});

afterEach(() => {
  if (root) {
    act(() => root?.unmount());
    root = null;
  }
  document.body.innerHTML = "";
  setStudioLocale("en");
  vi.clearAllMocks();
});

function mount(node: React.ReactElement): void {
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => {
    root?.render(node);
  });
}

function findButton(label: string): HTMLButtonElement {
  const button = Array.from(document.querySelectorAll("button")).find(
    (b) => b.textContent?.trim() === label,
  );
  if (!button) throw new Error(`no button ${label}`);
  return button;
}

describe("LintModal", () => {
  it("lists errors and warnings with Romanian counts and the ask-for-help action", () => {
    mount(<LintModal findings={findings} projectId="p1" onClose={vi.fn()} />);
    expect(document.body.textContent).toContain("Rezultate verificare HyperFrame");
    expect(document.body.textContent).toContain("2 erori · 1 avertisment");
    expect(document.body.textContent).toContain("Setează data-duration");
    expect(findButton("Cere ajutor")).toBeTruthy();
    expect(findButton("Închide")).toBeTruthy();
  });

  it("hands the findings to Ana și Radu with a lint context chip and closes", () => {
    const onClose = vi.fn();
    mount(<LintModal findings={findings} projectId="p1" projectDir="/work/p1" onClose={onClose} />);
    act(() => findButton("Cere ajutor").click());
    expect(openAgent).toHaveBeenCalledWith({
      context: expect.objectContaining({
        label: "Erori din previzualizare · 3",
        kind: "lint",
        prompt: expect.stringContaining("Project path: /work/p1"),
      }),
    });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("still copies the findings as a prompt and reports success", async () => {
    vi.mocked(copyTextToClipboard).mockResolvedValue(true);
    mount(<LintModal findings={findings} projectId="p1" projectDir="/work/p1" onClose={vi.fn()} />);
    await act(async () => {
      findButton("Copiază").click();
    });
    expect(copyTextToClipboard).toHaveBeenCalledWith(expect.stringContaining('for project "p1"'));
    expect(document.body.textContent).toContain("Copiat!");
  });

  it("shows the all-passed title and no action when there are no findings", () => {
    mount(<LintModal findings={[]} projectId="p1" onClose={vi.fn()} />);
    expect(document.body.textContent).toContain("Totul este în regulă");
    expect(
      Array.from(document.querySelectorAll("button")).some(
        (b) => b.textContent?.trim() === "Cere ajutor",
      ),
    ).toBe(false);
  });
});
