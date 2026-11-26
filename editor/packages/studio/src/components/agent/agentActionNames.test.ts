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

  it("falls back to the action name only for unknown actions", () => {
    expect(actionTitle(action("unknown.thing"), "en")).toBe("unknown.thing");
  });
});
