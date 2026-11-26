// Studio client of the workspace agent API, through the Studio server's allowlisted proxy
// (`/sneepcut/agent-api/*` → backend `/api/workspace-agent/*`). The session cookie authenticates;
// no bearer token is handled in the browser.
import {
  isAgentRun,
  type AgentCommand,
  type AgentRun,
  type AgentRunRequest,
  type AgentSuggestion,
} from "./agentModel";

export const AGENT_API_BASE = "/sneepcut/agent-api";

/** The agent answered with an error the user can act on (validation, rate limit, conflict). */
export class AgentApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/** The agent service cannot be reached from this Studio (no backend, proxy missing, network). */
export class AgentOfflineError extends Error {}

// Proxy or gateway failures. A JSON 4xx from the backend is a real answer (AgentApiError).
const OFFLINE_STATUSES = new Set([502, 503, 504]);

function errorText(data: unknown, fallback: string): string {
  if (data && typeof data === "object") {
    const record = data as Record<string, unknown>;
    for (const key of ["error", "message", "detail"]) {
      const value = record[key];
      if (typeof value === "string" && value.trim()) return value;
    }
  }
  return fallback;
}

export type AgentFetch = (input: string, init?: RequestInit) => Promise<Response>;

export function createAgentApi(fetcher: AgentFetch = (input, init) => fetch(input, init)) {
  async function request<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
    let response: Response;
    try {
      response = await fetcher(`${AGENT_API_BASE}${path}`, {
        method: body === undefined ? "GET" : "POST",
        credentials: "same-origin",
        signal,
        ...(body === undefined
          ? {}
          : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
      });
    } catch (cause) {
      if (signal?.aborted) throw cause;
      throw new AgentOfflineError("offline");
    }
    if (response.status === 204) return undefined as T;
    // The Vite dev server answers unknown paths with index.html: that is an offline agent too.
    const isJson = (response.headers.get("Content-Type") ?? "").includes("application/json");
    const data: unknown = isJson ? await response.json().catch(() => null) : null;
    if (!isJson || OFFLINE_STATUSES.has(response.status)) throw new AgentOfflineError("offline");
    if (!response.ok)
      throw new AgentApiError(
        errorText(data, `Request failed (${response.status})`),
        response.status,
      );
    return data as T;
  }

  async function runRequest(path: string, body?: unknown, expectedId?: string): Promise<AgentRun> {
    const run = await request<unknown>(path, body);
    if (!isAgentRun(run) || (expectedId && run.id !== expectedId)) throw new Error("invalid-run");
    return run;
  }

  return {
    preferences: (signal?: AbortSignal) =>
      request<{ follow: boolean; recommendations: boolean }>("/preferences", undefined, signal),
    list: async (before?: string, signal?: AbortSignal) => {
      const page = await request<{ runs?: unknown[]; has_more?: boolean }>(
        `/runs${before ? `?before=${encodeURIComponent(before)}` : ""}`,
        undefined,
        signal,
      );
      return { runs: (page?.runs ?? []).filter(isAgentRun), hasMore: page?.has_more === true };
    },
    run: (id: string) => runRequest(`/runs/${encodeURIComponent(id)}`, undefined, id),
    // An accepted suggestion can return its original run id.
    send: (body: AgentRunRequest) =>
      runRequest("/runs", body, body.suggestion_id ? undefined : body.request_id),
    control: (run: AgentRun, command: AgentCommand, resourceIds: string[] = []) =>
      runRequest(
        `/runs/${encodeURIComponent(run.id)}/control`,
        {
          command,
          revision: run.revision,
          ...(command === "resume" && resourceIds.length ? { resource_ids: resourceIds } : {}),
        },
        command === "undo" ? undefined : run.id,
      ),
    suggestions: async (locale: "ro" | "en", projectId?: string, signal?: AbortSignal) => {
      const query = `?locale=${locale}${projectId ? `&project_id=${encodeURIComponent(projectId)}` : ""}`;
      const data = await request<{ suggestions?: AgentSuggestion[] }>(
        `/suggestions${query}`,
        undefined,
        signal,
      );
      return Array.isArray(data?.suggestions) ? data.suggestions : [];
    },
    dismiss: (id: string) => request<void>(`/suggestions/${encodeURIComponent(id)}/dismiss`, {}),
  };
}

export type AgentApi = ReturnType<typeof createAgentApi>;
