import { describe, expect, it } from "vitest";
import { actionTitle } from "./agentActionNames";
import type { AgentAction } from "./agentModel";

const action = (name: string) => ({ name, input: {} }) as unknown as AgentAction;

describe("actionTitle", () => {
  it("shows a readable title, not the raw action name, for suggested backend actions", () => {
    for (const name of ["projects.list", "stories.create", "stories.get", "stories.generate"]) {
      expect(actionTitle(action(name), "en")).not.toBe(name);
      expect(actionTitle(action(name), "ro")).not.toBe(name);
    }
    expect(actionTitle(action("projects.list"), "ro")).toBe("Arată proiectele");
  });

  it("titles every backend catalogue action instead of showing its dotted key", () => {
    for (const name of ["scripts.update", "publishing.disconnect", "settings.preferences.update"]) {
      expect(actionTitle(action(name), "en")).not.toContain(".");
      expect(actionTitle(action(name), "ro")).not.toContain(".");
    }
    expect(actionTitle(action("scripts.update"), "ro")).toBe("Modifică scriptul");
    expect(actionTitle(action("publishing.disconnect"), "ro")).toBe("Deconectează contul");
  });

  it("humanizes unknown actions instead of showing the raw dotted key", () => {
    expect(actionTitle(action("unknown.thing"), "en")).toBe("Unknown thing");
    expect(actionTitle(action("future_area.do_it"), "ro")).toBe("Future area do it");
  });
});
