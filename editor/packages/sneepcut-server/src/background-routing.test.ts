import { afterEach, beforeEach, expect, it, mock, spyOn } from "bun:test";
import {
  createBackgroundRemovalJob,
  type BackgroundRemovalRender,
} from "../../studio-server/src/helpers/backgroundRemovalJob";
import { resolveBackgroundRemovalModel } from "./ai-routing";
import { startSandboxBackgroundRemoval } from "./sandbox";

const environmentNames = ["SNEEPCUT_AI_ROUTING", "SNEEPCUT_AUTH_BASE_URL", "STUDIO_AGENT_SECRET"];
const savedEnvironment = new Map(environmentNames.map((name) => [name, process.env[name]]));
const backgroundOptions = {
  project: { id: "synthetic-background", dir: "/synthetic-background" },
  inputPath: "/synthetic-background/input.jpg",
  inputAssetPath: "input.jpg",
  outputPath: "/synthetic-background/output.png",
  outputAssetPath: "output.png",
  quality: "balanced",
  jobId: "synthetic-background-job",
} satisfies Parameters<typeof startSandboxBackgroundRemoval>[0];

beforeEach(() => {
  process.env.SNEEPCUT_AI_ROUTING = "central";
  process.env.SNEEPCUT_AUTH_BASE_URL = "http://backend.internal:8080";
  process.env.STUDIO_AGENT_SECRET = "synthetic-background-routing-secret-32-characters";
});

afterEach(() => {
  for (const [name, value] of savedEnvironment) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

it("resolves the background stage and forwards its selected model into the rendering pipeline", async () => {
  const provider = spyOn(globalThis, "fetch").mockResolvedValue(
    Response.json({ provider: "u2net_onnx", model: "u2net_human_seg" }),
  );
  const render = mock(async (_options: Parameters<BackgroundRemovalRender>[0]) => ({
    provider: "CPU",
    framesProcessed: 1,
    durationSeconds: 0,
    avgMsPerFrame: 1,
  }));
  try {
    const model = await resolveBackgroundRemovalModel(new AbortController().signal);
    const job = createBackgroundRemovalJob({ ...backgroundOptions, model }, render);
    await Bun.sleep(0);
    expect(job.status).toBe("complete");
    expect(render.mock.calls[0]?.[0]).toMatchObject({
      model: "u2net_human_seg",
      inputPath: backgroundOptions.inputPath,
    });
    expect(String(provider.mock.calls[0]?.[0])).toBe(
      "http://backend.internal:8080/api/internal/ai-routing/studio-background",
    );
    expect(provider.mock.calls[0]?.[1]).toMatchObject({
      redirect: "error",
      cache: "no-store",
      headers: { "X-Studio-Agent-Secret": process.env.STUDIO_AGENT_SECRET },
    });
  } finally {
    provider.mockRestore();
  }
});

it.each([
  { provider: "openrouter", model: "qwen/segmentation" },
  { provider: "u2net_onnx", model: "uninstalled-model" },
  { provider: "u2net_onnx", model: "../untrusted-model" },
  null,
])(
  "fails before starting a sandbox job when the background route is incompatible",
  async (route) => {
    const provider = spyOn(globalThis, "fetch").mockResolvedValue(Response.json(route));
    try {
      const job = startSandboxBackgroundRemoval(backgroundOptions);
      await Bun.sleep(0);
      expect(job.status).toBe("failed");
      expect(job.error).toBe("SneepCut AI configuration is unavailable");
      expect(provider).toHaveBeenCalledTimes(1);
    } finally {
      provider.mockRestore();
    }
  },
);

it("does not start background removal when central routing is unavailable", async () => {
  const provider = spyOn(globalThis, "fetch").mockRejectedValue(new Error("backend secret detail"));
  try {
    const job = startSandboxBackgroundRemoval(backgroundOptions);
    await Bun.sleep(0);
    expect(job.status).toBe("failed");
    expect(job.error).toBe("SneepCut AI configuration is unavailable");
    expect(provider).toHaveBeenCalledTimes(1);
  } finally {
    provider.mockRestore();
  }
});

it("uses the existing installed model without network lookup in standalone mode", async () => {
  process.env.SNEEPCUT_AI_ROUTING = "standalone";
  const provider = spyOn(globalThis, "fetch");
  try {
    expect(await resolveBackgroundRemovalModel(new AbortController().signal)).toBe(
      "u2net_human_seg",
    );
    expect(provider).not.toHaveBeenCalled();
  } finally {
    provider.mockRestore();
  }
});
