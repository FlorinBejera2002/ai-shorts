import { describe, expect, it } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Hono } from "hono";
import {
  agentApiBodyLimit,
  agentApiQueryTooLong,
  agentApiTarget,
  proxyAgentApi,
} from "./agent-api-proxy";
import { createApp } from "./app";
import { ProjectStore } from "./store";

const alice = "11111111-1111-4111-8111-111111111111";

describe("agentApiTarget", () => {
  it("maps allowlisted routes and keeps only their known query parameters", () => {
    expect(agentApiTarget("GET", "/sneepcut/agent-api/runs", "?before=a%7Cb&x=1")).toBe(
      "/api/workspace-agent/runs?before=a%7Cb",
    );
    expect(
      agentApiTarget("GET", "/sneepcut/agent-api/suggestions", "?locale=ro&project_id=p&evil=1"),
    ).toBe("/api/workspace-agent/suggestions?locale=ro&project_id=p");
    expect(agentApiTarget("POST", "/sneepcut/agent-api/runs/abc-1/control", "")).toBe(
      "/api/workspace-agent/runs/abc-1/control",
    );
  });

  it("rejects other methods, paths and traversal", () => {
    expect(agentApiTarget("DELETE", "/sneepcut/agent-api/runs", "")).toBeNull();
    expect(agentApiTarget("GET", "/sneepcut/agent-api/admin/users", "")).toBeNull();
    expect(agentApiTarget("GET", "/sneepcut/agent-api/runs/../../auth/me", "")).toBeNull();
    expect(agentApiTarget("POST", "/sneepcut/agent-api/runs/a%2Fb/control", "")).toBeNull();
    expect(agentApiTarget("GET", "/sneepcut/agent-api", "")).toBeNull();
  });
});

describe("agent API proxy route", () => {
  async function application(agentFetch?: (input: URL, init: RequestInit) => Promise<Response>) {
    const root = await mkdtemp(join(tmpdir(), "sneepcut-agent-proxy-"));
    return createApp({
      appOrigin: "https://app.sneepcut.test",
      editorOrigin: "http://localhost",
      authBaseUrl: "https://api.sneepcut.test",
      store: new ProjectStore(join(root, "projects")),
      fetchAuth: async (_input, init) =>
        new Headers(init?.headers).get("Authorization") === "Bearer alice"
          ? Response.json({
              user: { id: alice, access_role: "member", deletion_pending: false, name: "A" },
            })
          : new Response(null, { status: 401 }),
      createStudioApiForUser: () => new Hono(),
      fetchAgentApi: agentFetch,
    });
  }

  it("forwards an allowed request with the session bearer and only safe headers", async () => {
    const seen: { url: string; init: RequestInit }[] = [];
    const app = await application(async (input, init) => {
      seen.push({ url: String(input), init });
      return Response.json(
        { id: "r1", revision: 1, status: "running" },
        { headers: { "Set-Cookie": "x=1" } },
      );
    });
    const response = await app.request("http://localhost/sneepcut/agent-api/runs", {
      method: "POST",
      headers: {
        Authorization: "Bearer alice",
        "Content-Type": "application/json",
        Cookie: "other=1",
        "Idempotency-Key": "abc-123",
        "X-Forwarded-For": "1.2.3.4",
      },
      body: JSON.stringify({ message: "Salut" }),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("Set-Cookie")).toBeNull();
    expect(await response.json()).toEqual({ id: "r1", revision: 1, status: "running" });
    expect(seen).toHaveLength(1);
    expect(seen[0].url).toBe("https://api.sneepcut.test/api/workspace-agent/runs");
    const headers = new Headers(seen[0].init.headers);
    expect(headers.get("Authorization")).toBe("Bearer alice");
    expect(headers.get("Idempotency-Key")).toBeNull();
    expect(headers.get("Cookie")).toBeNull();
    expect(headers.get("X-Forwarded-For")).toBeNull();
    expect(seen[0].init.body).toBe(JSON.stringify({ message: "Salut" }));
  });

  it("does not forward unknown routes or unauthenticated requests", async () => {
    let calls = 0;
    const app = await application(async () => {
      calls++;
      return Response.json({});
    });
    const unknown = await app.request("http://localhost/sneepcut/agent-api/admin", {
      headers: { Authorization: "Bearer alice" },
    });
    expect(unknown.status).toBe(404);
    const anonymous = await app.request("http://localhost/sneepcut/agent-api/runs");
    expect(anonymous.status).toBe(401);
    expect(calls).toBe(0);
  });

  it("rejects a cross-origin browser write before it reaches the backend", async () => {
    let calls = 0;
    const app = await application(async () => {
      calls++;
      return Response.json({});
    });
    const response = await app.request("http://localhost/sneepcut/agent-api/runs", {
      method: "POST",
      headers: { Authorization: "Bearer alice", Origin: "https://evil.test" },
      body: "{}",
    });
    expect(response.status).toBe(403);
    expect(calls).toBe(0);
  });

  it("reports an unreachable or non-JSON backend as a JSON error", async () => {
    const down = await application(async () => {
      throw new TypeError("connect ECONNREFUSED");
    });
    const unreachable = await down.request("http://localhost/sneepcut/agent-api/preferences", {
      headers: { Authorization: "Bearer alice" },
    });
    expect(unreachable.status).toBe(502);
    expect(await unreachable.json()).toHaveProperty("error");
    const html = await application(async () => new Response("<html>", { status: 200 }));
    const page = await html.request("http://localhost/sneepcut/agent-api/preferences", {
      headers: { Authorization: "Bearer alice" },
    });
    expect(page.status).toBe(502);
  });

  it("refuses bodies over the limit", async () => {
    const app = await application(async () => Response.json({}));
    const response = await app.request("http://localhost/sneepcut/agent-api/runs", {
      method: "POST",
      headers: { Authorization: "Bearer alice", "Content-Type": "application/json" },
      body: "x".repeat(70 * 1024),
    });
    expect(response.status).toBe(413);
  });

  it("limits each route by the backend's read size, in bytes", async () => {
    let calls = 0;
    const app = await application(async () => {
      calls++;
      return Response.json({ id: "res-1" });
    });
    const post = (path: string, body: string) =>
      app.request(`http://localhost/sneepcut/agent-api${path}`, {
        method: "POST",
        headers: { Authorization: "Bearer alice", "Content-Type": "application/json" },
        body,
      });
    // A ~90 KB text resource fits the backend's 100000-byte read for /resources.
    const resource = JSON.stringify({ kind: "text", text: "a".repeat(90_000) });
    expect((await post("/resources", resource)).status).toBe(200);
    expect(calls).toBe(1);
    expect((await post("/resources", "a".repeat(100_001))).status).toBe(413);
    // 20000 "ș" are 20000 UTF-16 units but 40000 bytes: over the 32 KiB read for /runs.
    const multibyte = JSON.stringify({ message: "ș".repeat(20_000) });
    expect(multibyte.length).toBeLessThan(32 * 1024);
    expect((await post("/runs", multibyte)).status).toBe(413);
    expect(calls).toBe(1);
  });

  it("exposes the per-route body limits", () => {
    expect(agentApiBodyLimit("POST", "/sneepcut/agent-api/resources")).toBe(100_000);
    expect(agentApiBodyLimit("POST", "/sneepcut/agent-api/runs")).toBe(32 * 1024);
    expect(agentApiBodyLimit("POST", "/sneepcut/agent-api/admin")).toBeNull();
  });
});

describe("proxyAgentApi hardening", () => {
  const baseUrl = "https://api.sneepcut.test";
  const runsUrl = "http://localhost/sneepcut/agent-api/runs";
  const jsonHeaders = { "Content-Type": "application/json" };

  function stubFetch(upstream: () => Response | Promise<Response>) {
    const calls: URL[] = [];
    const fetch = async (input: URL) => {
      calls.push(input);
      return upstream();
    };
    return { calls, fetch };
  }

  it("rejects an over-long query value with 400 before reaching the backend", async () => {
    const { calls, fetch } = stubFetch(() => Response.json({}));
    const longBefore = "a".repeat(201);
    const request = new Request(`${runsUrl}?before=${longBefore}`, {
      headers: jsonHeaders,
    });
    const response = await proxyAgentApi(request, "Bearer alice", { baseUrl, fetch });
    expect(response.status).toBe(400);
    expect(calls).toHaveLength(0);
    expect(agentApiQueryTooLong("GET", "/sneepcut/agent-api/runs", `?before=${longBefore}`)).toBe(
      true,
    );
  });

  it("accepts a query value of exactly 200 characters and forwards it intact", async () => {
    const value = "a".repeat(200);
    const { calls, fetch } = stubFetch(() => Response.json({ runs: [] }));
    const request = new Request(`${runsUrl}?before=${value}&extra=1`);
    const response = await proxyAgentApi(request, "Bearer alice", { baseUrl, fetch });
    expect(response.status).toBe(200);
    expect(calls[0].search).toBe(`?before=${value}`);
  });

  it("returns 400 when the request body cannot be read", async () => {
    const { calls, fetch } = stubFetch(() => Response.json({}));
    const broken = new Request(runsUrl, {
      method: "POST",
      headers: jsonHeaders,
      body: new ReadableStream({
        start(controller) {
          controller.error(new Error("client reset"));
        },
      }),
      duplex: "half",
    } as RequestInit);
    const response = await proxyAgentApi(broken, "Bearer alice", { baseUrl, fetch });
    expect(response.status).toBe(400);
    expect(calls).toHaveLength(0);
  });

  it.each([204, 205, 304])("relays a null-body %i status without a body", async (status) => {
    const { fetch } = stubFetch(() => new Response(null, { status }));
    const request = new Request("http://localhost/sneepcut/agent-api/preferences", {
      headers: jsonHeaders,
    });
    const response = await proxyAgentApi(request, "Bearer alice", { baseUrl, fetch });
    expect(response.status).toBe(status);
    expect(response.body).toBeNull();
  });

  it("returns 502 when the upstream body exceeds 1 MiB", async () => {
    const oversized = "x".repeat(1024 * 1024 + 1);
    const { fetch } = stubFetch(
      () => new Response(oversized, { status: 200, headers: jsonHeaders }),
    );
    const request = new Request("http://localhost/sneepcut/agent-api/preferences");
    const response = await proxyAgentApi(request, "Bearer alice", { baseUrl, fetch });
    expect(response.status).toBe(502);
    expect(await response.json()).toHaveProperty("error");
  });

  it("returns 502 when reading the upstream body fails", async () => {
    const { fetch } = stubFetch(
      () =>
        new Response(
          new ReadableStream({
            start(controller) {
              controller.error(new Error("socket closed"));
            },
          }),
          { status: 200, headers: jsonHeaders },
        ),
    );
    const request = new Request("http://localhost/sneepcut/agent-api/preferences");
    const response = await proxyAgentApi(request, "Bearer alice", { baseUrl, fetch });
    expect(response.status).toBe(502);
    expect(await response.json()).toHaveProperty("error");
  });
});
