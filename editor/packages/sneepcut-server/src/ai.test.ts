import { afterEach, expect, it, mock, spyOn } from "bun:test";
import { createAiRoutes } from "./ai";

const html = '<html><body><video src="/assets/clip.mp4"></video></body></html>';
const proposal = { html, summary: "Updated composition" };
const request = (body: unknown = { message: "Improve the title", html }) =>
  new Request("http://localhost/projects/project-1/assistant", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
const savedEnv = {
  base: process.env.SNEEPCUT_AI_BASE_URL,
  model: process.env.SNEEPCUT_AI_MODEL,
  key: process.env.SNEEPCUT_AI_API_KEY,
};
afterEach(() => {
  for (const [name, value] of Object.entries({
    SNEEPCUT_AI_BASE_URL: savedEnv.base,
    SNEEPCUT_AI_MODEL: savedEnv.model,
    SNEEPCUT_AI_API_KEY: savedEnv.key,
  })) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

it("checks user ownership before calling the provider", async () => {
  const generate = mock(async () => proposal);
  const resolveProject = mock(async () => null);
  const app = createAiRoutes({ userId: "user-1", resolveProject, generate });
  expect((await app.request(request())).status).toBe(404);
  expect(resolveProject).toHaveBeenCalledWith("user-1", "project-1");
  expect(generate).not.toHaveBeenCalled();
});

it("rejects unauthenticated requests before project lookup", async () => {
  const resolveProject = mock(async () => ({}));
  const app = createAiRoutes({ userId: "", resolveProject });
  expect((await app.request(request())).status).toBe(401);
  expect(resolveProject).not.toHaveBeenCalled();
});

it("returns a proposal only, stripping provider metadata without touching the project", async () => {
  const project = Object.freeze({ id: "project-1", html: "original" });
  const generate = mock(async () => ({ ...proposal, headers: { Authorization: "secret" } }));
  const app = createAiRoutes({ userId: "user-1", resolveProject: async () => project, generate });
  const response = await app.request(
    request({ message: "Improve title", html, expectedVersion: 3 }),
  );
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual(proposal);
  expect(project.html).toBe("original");
});

it.each([
  { message: "", html },
  { message: "x".repeat(10_001), html },
  { message: "edit", html: "x".repeat(500_001) },
  { message: "edit", html, expectedVersion: {} },
])("rejects invalid request before generation", async (body) => {
  const generate = mock(async () => proposal);
  const app = createAiRoutes({ userId: "u", resolveProject: async () => ({}), generate });
  expect((await app.request(request(body))).status).toBe(400);
  expect(generate).not.toHaveBeenCalled();
});

it.each([
  null,
  { html, summary: 123 },
  { html: "x".repeat(500_001), summary: "Too large" },
  { html: '<img src="https://unknown.invalid/media.png">', summary: "Remote resource" },
])("rejects malformed or unsafe provider proposals", async (result) => {
  const app = createAiRoutes({
    userId: "u",
    resolveProject: async () => ({}),
    generate: async () => result,
  });
  expect((await app.request(request())).status).toBe(502);
});

it("does not expose provider errors or credentials", async () => {
  const app = createAiRoutes({
    userId: "u",
    resolveProject: async () => ({}),
    generate: async () => {
      throw new Error("secret-api-key server-header");
    },
  });
  const response = await app.request(request());
  expect(response.status).toBe(502);
  expect(await response.text()).not.toContain("secret");
});

it("reports an unavailable provider explicitly", async () => {
  delete process.env.SNEEPCUT_AI_BASE_URL;
  delete process.env.SNEEPCUT_AI_MODEL;
  const app = createAiRoutes({ userId: "u", resolveProject: async () => ({}) });
  expect((await app.request(request())).status).toBe(503);
});

it("sanitizes malformed chat-completion responses", async () => {
  process.env.SNEEPCUT_AI_BASE_URL = "http://127.0.0.1:11434/v1";
  process.env.SNEEPCUT_AI_MODEL = "local-model";
  const provider = spyOn(globalThis, "fetch").mockResolvedValue(
    Response.json({ choices: [{ message: { content: "invalid JSON secret" } }] }),
  );
  try {
    const app = createAiRoutes({ userId: "u", resolveProject: async () => ({}) });
    const response = await app.request(request());
    expect(response.status).toBe(502);
    expect(await response.text()).not.toContain("secret");
  } finally {
    provider.mockRestore();
  }
});

it("uses only the configured provider and preserves existing remote asset URLs", async () => {
  process.env.SNEEPCUT_AI_BASE_URL = "http://127.0.0.1:11434/v1";
  process.env.SNEEPCUT_AI_MODEL = "local-model";
  process.env.SNEEPCUT_AI_API_KEY = "private-key";
  const remoteHtml = '<video src="https://owned.invalid/clip.mp4"></video>';
  const provider = spyOn(globalThis, "fetch").mockResolvedValue(
    Response.json({
      choices: [
        { message: { content: JSON.stringify({ html: remoteHtml, summary: "Kept media" }) } },
      ],
    }),
  );
  try {
    const app = createAiRoutes({ userId: "u", resolveProject: async () => ({}) });
    const response = await app.request(request({ message: "Keep this media", html: remoteHtml }));
    expect(response.status).toBe(200);
    expect(String(provider.mock.calls[0]?.[0])).toBe("http://127.0.0.1:11434/v1/chat/completions");
    expect(await response.text()).not.toContain("private-key");
  } finally {
    provider.mockRestore();
  }
});
