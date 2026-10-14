import { afterEach, beforeEach, expect, it, mock, spyOn } from "bun:test";
import { createAiRoutes } from "./ai";

// The asset path belongs to a synthetic project; these tests never load media files.
// noinspection HtmlUnknownTarget
const html = '<html lang="en"><body><video src="/assets/clip.mp4"></video></body></html>';
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
  provider: process.env.AI_PROVIDER,
  openRouterKey: process.env.OPENROUTER_API_KEY,
  openRouterModel: process.env.OPENROUTER_MODEL_NAME,
  geminiKey: process.env.GEMINI_API_KEY,
  geminiModel: process.env.GEMINI_MODEL_NAME,
  routing: process.env.SNEEPCUT_AI_ROUTING,
  authBase: process.env.SNEEPCUT_AUTH_BASE_URL,
  studioSecret: process.env.STUDIO_AGENT_SECRET,
};
beforeEach(() => {
  for (const name of [
    "SNEEPCUT_AI_BASE_URL",
    "SNEEPCUT_AI_MODEL",
    "SNEEPCUT_AI_API_KEY",
    "AI_PROVIDER",
    "OPENROUTER_API_KEY",
    "OPENROUTER_MODEL_NAME",
    "GEMINI_API_KEY",
    "GEMINI_MODEL_NAME",
    "SNEEPCUT_AI_ROUTING",
    "SNEEPCUT_AUTH_BASE_URL",
    "STUDIO_AGENT_SECRET",
  ]) {
    delete process.env[name];
  }
});
afterEach(() => {
  for (const [name, value] of Object.entries({
    SNEEPCUT_AI_BASE_URL: savedEnv.base,
    SNEEPCUT_AI_MODEL: savedEnv.model,
    SNEEPCUT_AI_API_KEY: savedEnv.key,
    AI_PROVIDER: savedEnv.provider,
    OPENROUTER_API_KEY: savedEnv.openRouterKey,
    OPENROUTER_MODEL_NAME: savedEnv.openRouterModel,
    GEMINI_API_KEY: savedEnv.geminiKey,
    GEMINI_MODEL_NAME: savedEnv.geminiModel,
    SNEEPCUT_AI_ROUTING: savedEnv.routing,
    SNEEPCUT_AUTH_BASE_URL: savedEnv.authBase,
    STUDIO_AGENT_SECRET: savedEnv.studioSecret,
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
  { html: '<img src="https://unknown.invalid/media.png" alt="">', summary: "Remote resource" },
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
  delete process.env.SNEEPCUT_AI_API_KEY;
  delete process.env.OPENROUTER_API_KEY;
  const app = createAiRoutes({ userId: "u", resolveProject: async () => ({}) });
  expect((await app.request(request())).status).toBe(503);
});

it.each(["not-a-url", "file:///tmp/provider", "https://user:secret@provider.invalid/v1"])(
  "rejects invalid provider endpoint %j before making a request",
  async (base) => {
    process.env.SNEEPCUT_AI_BASE_URL = base;
    process.env.SNEEPCUT_AI_MODEL = "test-model";
    const provider = spyOn(globalThis, "fetch").mockRejectedValue(new Error("Unexpected request"));
    try {
      const app = createAiRoutes({ userId: "u", resolveProject: async () => ({}) });
      const response = await app.request(request());
      expect(response.status).toBe(503);
      expect(provider).not.toHaveBeenCalled();
      expect(await response.text()).not.toContain("secret");
    } finally {
      provider.mockRestore();
    }
  },
);

it.each(["openrouter", "OpenRouter", " openrouter ", "auto", " AuTo ", ""])(
  "uses OpenRouter with normalized shared provider configuration %j",
  async (providerName) => {
    delete process.env.SNEEPCUT_AI_BASE_URL;
    delete process.env.SNEEPCUT_AI_MODEL;
    delete process.env.SNEEPCUT_AI_API_KEY;
    process.env.AI_PROVIDER = providerName;
    process.env.OPENROUTER_API_KEY = "router-private-key";
    process.env.OPENROUTER_MODEL_NAME = "anthropic/claude-test";
    const provider = spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({
        choices: [{ message: { content: JSON.stringify(proposal) } }],
      }),
    );
    try {
      const app = createAiRoutes({ userId: "u", resolveProject: async () => ({}) });
      const response = await app.request(request());
      expect(response.status).toBe(200);
      expect(String(provider.mock.calls[0]?.[0])).toBe(
        "https://openrouter.ai/api/v1/chat/completions",
      );
      const init = provider.mock.calls[0]?.[1];
      const body = JSON.parse(String(init?.body));
      expect(body.model).toBe("anthropic/claude-test");
      expect(body).not.toHaveProperty("response_format");
      expect(init?.headers).toMatchObject({
        Authorization: "Bearer router-private-key",
        "X-Title": "Sneepcut",
      });
    } finally {
      provider.mockRestore();
    }
  },
);

it.each(["gemini", " Gemini ", "unknown", " "])(
  "does not select OpenRouter for provider configuration %j",
  async (providerName) => {
    process.env.AI_PROVIDER = providerName;
    process.env.OPENROUTER_API_KEY = "router-private-key";
    const provider = spyOn(globalThis, "fetch");
    try {
      const app = createAiRoutes({ userId: "u", resolveProject: async () => ({}) });
      expect((await app.request(request())).status).toBe(503);
      expect(provider).not.toHaveBeenCalled();
    } finally {
      provider.mockRestore();
    }
  },
);

it.each(["gemini", " Gemini ", "auto", " AuTo ", ""])(
  "uses Gemini and matches shared provider precedence for %j",
  async (providerName) => {
    process.env.AI_PROVIDER = providerName;
    process.env.GEMINI_API_KEY = "gemini-private-key";
    process.env.GEMINI_MODEL_NAME = "gemini-test";
    process.env.OPENROUTER_API_KEY = "router-private-key";
    const provider = spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({ choices: [{ message: { content: JSON.stringify(proposal) } }] }),
    );
    try {
      const app = createAiRoutes({ userId: "u", resolveProject: async () => ({}) });
      const response = await app.request(request());
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual(proposal);
      expect(String(provider.mock.calls[0]?.[0])).toBe(
        "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
      );
      const init = provider.mock.calls[0]?.[1];
      expect(init?.headers).toMatchObject({ Authorization: "Bearer gemini-private-key" });
      expect(JSON.parse(String(init?.body))).toMatchObject({
        model: "gemini-test",
        response_format: { type: "json_object" },
      });
      expect(provider).toHaveBeenCalledTimes(1);
    } finally {
      provider.mockRestore();
    }
  },
);

it("honors explicit OpenRouter even when Gemini is configured", async () => {
  process.env.AI_PROVIDER = "openrouter";
  process.env.GEMINI_API_KEY = "gemini-private-key";
  process.env.OPENROUTER_API_KEY = "router-private-key";
  const provider = spyOn(globalThis, "fetch").mockResolvedValue(
    Response.json({ choices: [{ message: { content: JSON.stringify(proposal) } }] }),
  );
  try {
    const app = createAiRoutes({ userId: "u", resolveProject: async () => ({}) });
    expect((await app.request(request())).status).toBe(200);
    expect(String(provider.mock.calls[0]?.[0])).toBe(
      "https://openrouter.ai/api/v1/chat/completions",
    );
  } finally {
    provider.mockRestore();
  }
});

it("does not fall back to Gemini when explicit OpenRouter lacks a key", async () => {
  process.env.AI_PROVIDER = "openrouter";
  process.env.GEMINI_API_KEY = "gemini-private-key";
  const provider = spyOn(globalThis, "fetch");
  try {
    const app = createAiRoutes({ userId: "u", resolveProject: async () => ({}) });
    expect((await app.request(request())).status).toBe(503);
    expect(provider).not.toHaveBeenCalled();
  } finally {
    provider.mockRestore();
  }
});

it.each([
  ["bare JSON", JSON.stringify(proposal)],
  ["JSON fence", `\`\`\`json\n${JSON.stringify(proposal)}\n\`\`\``],
  ["plain fence", `\`\`\`\n${JSON.stringify(proposal)}\n\`\`\``],
  ["CRLF and outer whitespace", ` \n\`\`\`JSON\r\n${JSON.stringify(proposal)}\r\n\`\`\`\n `],
])("accepts an OpenRouter proposal with %s", async (_name, content) => {
  process.env.AI_PROVIDER = "openrouter";
  process.env.OPENROUTER_API_KEY = "router-private-key";
  const provider = spyOn(globalThis, "fetch").mockResolvedValue(
    Response.json({ choices: [{ message: { content } }] }),
  );
  try {
    const app = createAiRoutes({ userId: "u", resolveProject: async () => ({}) });
    const response = await app.request(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(proposal);
  } finally {
    provider.mockRestore();
  }
});

it.each([
  `\`\`\`json\ninvalid JSON secret\n\`\`\``,
  `\`\`\`json\n${JSON.stringify(proposal)}`,
  `\`\`\`json\n${JSON.stringify([proposal])}\n\`\`\``,
  `\`\`\`json\n${JSON.stringify({ html, summary: 123 })}\n\`\`\``,
  `\`\`\`json\n${JSON.stringify({ html: '<img src="https://unknown.invalid/media.png" alt="">', summary: "Unsafe" })}\n\`\`\``,
  `\`\`\`json\n${JSON.stringify({ ...proposal, html: "x".repeat(500_001) })}\n\`\`\``,
])("rejects malformed or unsafe fenced proposals", async (content) => {
  process.env.AI_PROVIDER = "openrouter";
  process.env.OPENROUTER_API_KEY = "router-private-key";
  const provider = spyOn(globalThis, "fetch").mockResolvedValue(
    Response.json({ choices: [{ message: { content } }] }),
  );
  try {
    const app = createAiRoutes({ userId: "u", resolveProject: async () => ({}) });
    const response = await app.request(request());
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      error: "AI provider could not produce a valid proposal",
    });
  } finally {
    provider.mockRestore();
  }
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
  process.env.AI_PROVIDER = "gemini";
  process.env.GEMINI_API_KEY = "gemini-private-key";
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
    const body = JSON.parse(String(provider.mock.calls[0]?.[1]?.body));
    expect(body.response_format).toEqual({ type: "json_object" });
    expect(await response.text()).not.toContain("private-key");
  } finally {
    provider.mockRestore();
  }
});

function configureCentralRouting() {
  process.env.SNEEPCUT_AI_ROUTING = "central";
  process.env.SNEEPCUT_AUTH_BASE_URL = "http://backend.internal:8080";
  process.env.STUDIO_AGENT_SECRET = "synthetic-studio-routing-secret-32-characters";
  process.env.OPENROUTER_API_KEY = "router-private-key";
  process.env.GEMINI_API_KEY = "gemini-private-key";
}

function providerProposal() {
  return Response.json({ choices: [{ message: { content: JSON.stringify(proposal) } }] });
}

it("fetches the current central route for every proposal and ignores standalone overrides", async () => {
  configureCentralRouting();
  process.env.SNEEPCUT_AI_BASE_URL = "https://standalone.invalid/v1";
  process.env.SNEEPCUT_AI_MODEL = "standalone-model";
  process.env.SNEEPCUT_AI_API_KEY = "standalone-private-key";
  const provider = spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(Response.json({ provider: "openrouter", model: "anthropic/first" }))
    .mockResolvedValueOnce(providerProposal())
    .mockResolvedValueOnce(Response.json({ provider: "openrouter", model: "openai/next" }))
    .mockResolvedValueOnce(providerProposal());
  try {
    const app = createAiRoutes({ userId: "u", resolveProject: async () => ({}) });
    expect((await app.request(request())).status).toBe(200);
    const second = await app.request(request());
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual(proposal);
    expect(provider).toHaveBeenCalledTimes(4);
    for (const index of [0, 2]) {
      expect(String(provider.mock.calls[index]?.[0])).toBe(
        "http://backend.internal:8080/api/internal/ai-routing/studio",
      );
      expect(provider.mock.calls[index]?.[1]).toMatchObject({
        headers: { "X-Studio-Agent-Secret": process.env.STUDIO_AGENT_SECRET },
        redirect: "error",
        cache: "no-store",
      });
    }
    expect(JSON.parse(String(provider.mock.calls[1]?.[1]?.body)).model).toBe("anthropic/first");
    expect(JSON.parse(String(provider.mock.calls[3]?.[1]?.body)).model).toBe("openai/next");
    for (const index of [1, 3]) {
      expect(String(provider.mock.calls[index]?.[0])).toBe(
        "https://openrouter.ai/api/v1/chat/completions",
      );
      expect(provider.mock.calls[index]?.[1]?.headers).toMatchObject({
        Authorization: "Bearer router-private-key",
      });
      expect(provider.mock.calls[index]?.[1]?.headers).not.toHaveProperty("X-Studio-Agent-Secret");
    }
  } finally {
    provider.mockRestore();
  }
});

it("uses the central Gemini model with only the local Gemini credentials", async () => {
  configureCentralRouting();
  process.env.AI_PROVIDER = "openrouter";
  const provider = spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(Response.json({ provider: "gemini", model: "gemini-central" }))
    .mockResolvedValueOnce(providerProposal());
  try {
    const app = createAiRoutes({ userId: "u", resolveProject: async () => ({}) });
    expect((await app.request(request())).status).toBe(200);
    expect(String(provider.mock.calls[1]?.[0])).toBe(
      "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
    );
    expect(provider.mock.calls[1]?.[1]?.headers).toMatchObject({
      Authorization: "Bearer gemini-private-key",
    });
    expect(JSON.parse(String(provider.mock.calls[1]?.[1]?.body))).toMatchObject({
      model: "gemini-central",
      response_format: { type: "json_object" },
    });
  } finally {
    provider.mockRestore();
  }
});

it.each([
  null,
  { provider: "custom", model: "model", base: "https://untrusted.invalid" },
  { provider: "openrouter", model: "" },
  { provider: "openrouter", model: " " },
  { provider: "openrouter", model: 42 },
  { provider: "openrouter", model: "a".repeat(201) },
])("rejects an invalid central route without invoking a model", async (route) => {
  configureCentralRouting();
  const provider = spyOn(globalThis, "fetch").mockResolvedValue(Response.json(route));
  try {
    const app = createAiRoutes({ userId: "u", resolveProject: async () => ({}) });
    expect((await app.request(request())).status).toBe(503);
    expect(provider).toHaveBeenCalledTimes(1);
  } finally {
    provider.mockRestore();
  }
});

it.each([401, 403, 500, 503])("fails closed when central routing returns %i", async (status) => {
  configureCentralRouting();
  const provider = spyOn(globalThis, "fetch").mockResolvedValue(
    Response.json({ error: "private backend detail" }, { status }),
  );
  try {
    const app = createAiRoutes({ userId: "u", resolveProject: async () => ({}) });
    const response = await app.request(request());
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("private");
    expect(provider).toHaveBeenCalledTimes(1);
  } finally {
    provider.mockRestore();
  }
});

it("fails closed on routing network errors instead of using a standalone model", async () => {
  configureCentralRouting();
  process.env.SNEEPCUT_AI_BASE_URL = "http://localhost:11434/v1";
  process.env.SNEEPCUT_AI_MODEL = "local-model";
  const provider = spyOn(globalThis, "fetch").mockRejectedValue(new Error("network error"));
  try {
    const app = createAiRoutes({ userId: "u", resolveProject: async () => ({}) });
    expect((await app.request(request())).status).toBe(503);
    expect(provider).toHaveBeenCalledTimes(1);
  } finally {
    provider.mockRestore();
  }
});

it("bounds central routing to five seconds and propagates its abort signal", async () => {
  configureCentralRouting();
  const timeout = spyOn(AbortSignal, "timeout").mockReturnValue(
    AbortSignal.abort(new DOMException("Routing timeout", "TimeoutError")),
  );
  const provider = spyOn(globalThis, "fetch").mockRejectedValue(
    new DOMException("Routing timeout", "TimeoutError"),
  );
  try {
    const app = createAiRoutes({ userId: "u", resolveProject: async () => ({}) });
    expect((await app.request(request())).status).toBe(503);
    expect(timeout).toHaveBeenCalledWith(5_000);
    expect(provider).toHaveBeenCalledTimes(1);
    expect(provider.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
  } finally {
    provider.mockRestore();
    timeout.mockRestore();
  }
});

it.each(["openrouter", "gemini"])(
  "never falls back if central %s credentials are absent",
  async (selected) => {
    configureCentralRouting();
    delete process.env[selected === "openrouter" ? "OPENROUTER_API_KEY" : "GEMINI_API_KEY"];
    const provider = spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({ provider: selected, model: "central-model" }),
    );
    try {
      const app = createAiRoutes({ userId: "u", resolveProject: async () => ({}) });
      expect((await app.request(request())).status).toBe(503);
      expect(provider).toHaveBeenCalledTimes(1);
    } finally {
      provider.mockRestore();
    }
  },
);

it.each(["", "short"])(
  "rejects absent or weak central authentication before fetching",
  async (secret) => {
    configureCentralRouting();
    process.env.STUDIO_AGENT_SECRET = secret;
    const provider = spyOn(globalThis, "fetch");
    try {
      const app = createAiRoutes({ userId: "u", resolveProject: async () => ({}) });
      expect((await app.request(request())).status).toBe(503);
      expect(provider).not.toHaveBeenCalled();
    } finally {
      provider.mockRestore();
    }
  },
);

it.each(["not-a-url", "file:///tmp/api", "https://user:secret@backend.invalid"])(
  "rejects an invalid central endpoint %j without disclosing the shared secret",
  async (base) => {
    configureCentralRouting();
    process.env.SNEEPCUT_AUTH_BASE_URL = base;
    const provider = spyOn(globalThis, "fetch");
    try {
      const app = createAiRoutes({ userId: "u", resolveProject: async () => ({}) });
      const response = await app.request(request());
      expect(response.status).toBe(503);
      expect(await response.text()).not.toContain("secret");
      expect(provider).not.toHaveBeenCalled();
    } finally {
      provider.mockRestore();
    }
  },
);
