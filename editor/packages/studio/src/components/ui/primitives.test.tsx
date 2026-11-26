// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Dialog } from "./Dialog";
import { EmptyState } from "./EmptyState";
import { PillButton } from "./PillButton";
import { Segment } from "./Segment";
import { Sheet } from "./Sheet";
import { Switch } from "./Switch";
import { Toast } from "./Toast";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  document.body.innerHTML = "";
});

function render(node: React.ReactNode) {
  act(() => root.render(node));
}

describe("Segment", () => {
  it("marks the selected option and reports the chosen value", () => {
    const onChange = vi.fn();
    render(
      <Segment
        label="Mode"
        options={[
          { value: "all", label: "Toate" },
          { value: "project", label: "Proiect" },
        ]}
        value="all"
        onChange={onChange}
      />,
    );
    const buttons = Array.from(host.querySelectorAll("button"));
    expect(buttons.map((button) => button.getAttribute("aria-pressed"))).toEqual(["true", "false"]);
    act(() => buttons[1].click());
    expect(onChange).toHaveBeenCalledWith("project");
  });
});

describe("Switch", () => {
  it("is a switch that toggles its checked state", () => {
    const onChange = vi.fn();
    render(<Switch label="Fără sunet" checked={false} onChange={onChange} />);
    const toggle = host.querySelector('[role="switch"]') as HTMLButtonElement;
    expect(toggle.getAttribute("aria-checked")).toBe("false");
    act(() => toggle.click());
    expect(onChange).toHaveBeenCalledWith(true);
  });
});

describe("PillButton", () => {
  it("defaults to type button and uses the primary token for primary actions", () => {
    render(<PillButton variant="primary">Exportă</PillButton>);
    const button = host.querySelector("button") as HTMLButtonElement;
    expect(button.type).toBe("button");
    expect(button.className).toContain("bg-studio-accent");
    expect(button.className).toContain("rounded-full");
    expect(button.className).not.toMatch(/blue|2563eb/);
  });
});

describe("EmptyState", () => {
  it("shows one illustration from public/illustrations and a title", () => {
    render(<EmptyState illustration="delete" title="Ștergi exportul?" />);
    const image = host.querySelector("img") as HTMLImageElement;
    expect(image.getAttribute("src")).toBe("/illustrations/delete.webp");
    expect(image.getAttribute("alt")).toBe("");
    expect(host.textContent).toContain("Ștergi exportul?");
  });
});

describe("Dialog and Sheet", () => {
  it("renders a labelled dialog only while open and closes on Escape", () => {
    const onClose = vi.fn();
    render(
      <Dialog open title="Ștergi exportul?" onClose={onClose}>
        Nu poate fi recuperat.
      </Dialog>,
    );
    const dialog = document.querySelector('[role="dialog"]') as HTMLElement;
    expect(dialog.getAttribute("aria-label")).toBe("Ștergi exportul?");
    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(onClose).toHaveBeenCalled();
    render(
      <Dialog open={false} title="Closed" onClose={onClose}>
        Hidden
      </Dialog>,
    );
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it("sheet closes from its Gata action", () => {
    const onClose = vi.fn();
    render(
      <Sheet open title="Audio" onClose={onClose}>
        Conținut
      </Sheet>,
    );
    const done = Array.from(document.querySelectorAll("button")).find(
      (button) => button.textContent === "Done",
    ) as HTMLButtonElement;
    act(() => done.click());
    expect(onClose).toHaveBeenCalled();
  });
});

describe("Toast", () => {
  it("uses an alert role for errors and a status role otherwise", () => {
    render(<Toast message="Salvare eșuată" tone="error" />);
    expect(host.querySelector('[role="alert"]')).not.toBeNull();
    render(<Toast message="Salvat" />);
    expect(host.querySelector('[role="status"]')).not.toBeNull();
  });
});

describe("primitive colour discipline", () => {
  it("keeps hex literals out of the shared UI primitives", () => {
    const directory = join(dirname(fileURLToPath(import.meta.url)));
    const offenders = readdirSync(directory)
      .filter((file) => file.endsWith(".tsx") || file.endsWith(".ts"))
      .filter((file) => !file.endsWith(".test.tsx") && !file.endsWith(".test.ts"))
      .filter((file) => /#[0-9a-fA-F]{3,6}\b/.test(readFileSync(join(directory, file), "utf8")));
    expect(offenders).toEqual([]);
  });
});
