const ROUTING_TIMEOUT_MS = 5_000;

export class AiUnavailable extends Error {
  constructor() {
    super("SneepCut AI configuration is unavailable");
  }
}

type StudioAiStage = "studio" | "studio-background";
type ModelRoute = { provider: string; model: string };

export async function readCentralAiRoute(
  stage: StudioAiStage,
  signal: AbortSignal,
): Promise<ModelRoute | null> {
  const mode = (process.env.SNEEPCUT_AI_ROUTING || "standalone").trim().toLowerCase();
  if (mode === "standalone") return null;
  if (mode !== "central") throw new AiUnavailable();

  const secret = process.env.STUDIO_AGENT_SECRET;
  if (!secret || secret.length < 32) throw new AiUnavailable();
  try {
    const endpoint = new URL(
      `/api/internal/ai-routing/${stage}`,
      process.env.SNEEPCUT_AUTH_BASE_URL || "http://localhost:8080",
    );
    if (
      !["http:", "https:"].includes(endpoint.protocol) ||
      endpoint.username ||
      endpoint.password
    ) {
      throw new AiUnavailable();
    }
    const response = await fetch(endpoint, {
      headers: { "X-Studio-Agent-Secret": secret },
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.any([signal, AbortSignal.timeout(ROUTING_TIMEOUT_MS)]),
    });
    if (!response.ok) throw new AiUnavailable();
    const route: unknown = await response.json();
    if (
      typeof route !== "object" ||
      route === null ||
      !("provider" in route) ||
      typeof route.provider !== "string" ||
      !("model" in route) ||
      typeof route.model !== "string" ||
      !route.model.trim() ||
      route.model.length > 200
    ) {
      throw new AiUnavailable();
    }
    return { provider: route.provider, model: route.model };
  } catch {
    // Never bypass central admin settings with a stale model or local override.
    throw new AiUnavailable();
  }
}

export async function resolveBackgroundRemovalModel(
  signal: AbortSignal,
): Promise<"u2net_human_seg"> {
  const route = await readCentralAiRoute("studio-background", signal);
  if (route && (route.provider !== "u2net_onnx" || route.model !== "u2net_human_seg")) {
    throw new AiUnavailable();
  }
  return "u2net_human_seg";
}
