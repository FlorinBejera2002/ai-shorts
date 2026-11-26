import { describe, expect, it, vi } from "vitest";
import { AgentApiError, AgentOfflineError, createAgentApi } from "./agentApi";
import { mergeRuns, pollingDelay, studioScope, touchesStudio, type AgentRun } from "./agentModel";

const PROJECT = "11111111-1111-4111-8111-111111111111";

function run(patch: Partial<AgentRun> = {}): AgentRun {
  return {
    id: "r1",
    message: "m",
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

describe("agent API client", () => {
  it("calls the Studio proxy, not the backend directly", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ runs: [run()], has_more: true }));
    const page = await createAgentApi(fetcher).list("a|b");
    expect(fetcher.mock.calls[0][0]).toBe("/sneepcut/agent-api/runs?before=a%7Cb");
    expect(page).toEqual({ runs: [run()], hasMore: true });
  });

  it("treats a missing service as offline: HTML fallback, gateway errors, network errors", async () => {
    const html = createAgentApi(async () => new Response("<html>", { status: 200 }));
    await expect(html.list()).rejects.toBeInstanceOf(AgentOfflineError);
    const gateway = createAgentApi(async () => Response.json({ error: "x" }, { status: 503 }));
    await expect(gateway.list()).rejects.toBeInstanceOf(AgentOfflineError);
    const network = createAgentApi(async () => {
      throw new TypeError("Failed to fetch");
    });
    await expect(network.list()).rejects.toBeInstanceOf(AgentOfflineError);
  });

  it("reports backend validation errors with their message", async () => {
    const api = createAgentApi(async () =>
      Response.json({ error: "Mesajul este prea lung" }, { status: 422 }),
    );
    const failure = api.send({
      request_id: "q",
      message: "x",
      context: { route: "/dashboard/studio" },
    });
    await expect(failure).rejects.toBeInstanceOf(AgentApiError);
    await expect(failure).rejects.toHaveProperty("message", "Mesajul este prea lung");
  });

  it("verifies the run it gets back and sends the revision with control commands", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json(run({ id: "other" })));
    const api = createAgentApi(fetcher);
    await expect(
      api.send({ request_id: "q", message: "x", context: { route: "/dashboard/studio" } }),
    ).rejects.toThrow();
    fetcher.mockResolvedValue(Response.json(run({ revision: 4 })));
    await api.control(run({ revision: 3 }), "resume", ["res-1"]);
    const [url, init] = fetcher.mock.calls.at(-1)!;
    expect(url).toBe("/sneepcut/agent-api/runs/r1/control");
    expect(JSON.parse(String(init.body))).toEqual({
      command: "resume",
      revision: 3,
      resource_ids: ["res-1"],
    });
  });
});

describe("agent model", () => {
  it("sends the project and selection only for a SneepCut project id", () => {
    expect(studioScope("sneepcut-test", "ro", ["a"])).toEqual({
      route: "/dashboard/studio",
      locale: "ro",
    });
    expect(studioScope(PROJECT, "en", ["a", "", "b\nc"])).toEqual({
      route: "/dashboard/studio",
      locale: "en",
      project_id: PROJECT,
      studio_selection: ["a"],
    });
  });

  it("polls while working and keeps newer revisions", () => {
    expect(pollingDelay([run()])).toBe(2000);
    expect(pollingDelay([run({ status: "waiting_for_resources" })])).toBe(15000);
    expect(pollingDelay([run({ status: "completed" })])).toBeNull();
    const merged = mergeRuns([run({ revision: 3, status: "paused" })], [run({ revision: 2 })]);
    expect(merged[0].status).toBe("paused");
  });

  it("knows which runs changed the composition", () => {
    expect(touchesStudio(run({ action: { name: "studio.edit", input: {} } }))).toBe(true);
    expect(touchesStudio(run({ action: { name: "studio.get", input: {} } }))).toBe(false);
    expect(touchesStudio(run({ action: { name: "clips.list", input: {} } }))).toBe(false);
  });
});
