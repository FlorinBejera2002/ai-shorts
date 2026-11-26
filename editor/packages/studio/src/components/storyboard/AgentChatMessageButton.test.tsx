// @vitest-environment happy-dom

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AgentChatMessageButton } from "./AgentChatMessageButton";
import { closeAgent, useAgentContext, useAgentOpen } from "../agent/agentSession";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  document.body.innerHTML = "";
  closeAgent();
  vi.restoreAllMocks();
});

function AgentProbe() {
  const open = useAgentOpen();
  const context = useAgentContext();
  return <output data-open={String(open)}>{context?.prompt ?? ""}</output>;
}

describe("AgentChatMessageButton", () => {
  it("hands the storyboard message to Ana și Radu and reports it", () => {
    const onCopied = vi.fn();
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    act(() => {
      root.render(
        <>
          <AgentChatMessageButton message="handoff" onCopied={onCopied} />
          <AgentProbe />
        </>,
      );
    });

    const button = host.querySelector("button");
    if (!button) throw new Error("agent button not rendered");
    expect(button.textContent).toBe("Ask for help");
    act(() => button.click());

    const probe = host.querySelector("output");
    expect(probe?.getAttribute("data-open")).toBe("true");
    expect(probe?.textContent).toBe("handoff");
    expect(onCopied).toHaveBeenCalledOnce();
    act(() => root.unmount());
  });
});
