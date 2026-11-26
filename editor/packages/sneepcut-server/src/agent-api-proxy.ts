// Allowlisted proxy from Studio to the main backend's workspace agent (Ana și Radu).
// The browser talks to `/sneepcut/agent-api/*` on the Studio origin with its session cookie; the
// server adds the session bearer and forwards only the known agent routes to `/api/workspace-agent/*`.
// No bearer reaches the browser, and no other backend route is reachable through this path.

export const AGENT_API_PREFIX = "/sneepcut/agent-api";
/**
 * Largest request body forwarded, in bytes: the backend's largest read (POST /resources reads up
 * to 100000 bytes). Each route also has its own limit, matching the backend's read for it.
 */
export const AGENT_API_MAX_BODY = 100_000;
/** Default per-route limit (POST /runs reads 32 KiB; control and preferences read less). */
const DEFAULT_ROUTE_BODY = 32 * 1024;
/** Largest upstream response body read into memory, in bytes. */
const MAX_UPSTREAM_BODY = 1024 * 1024;
/** Longest accepted query parameter value, in UTF-16 code units. */
const MAX_QUERY_VALUE_LENGTH = 200;
const TIMEOUT_MS = 30_000;
const ID = "[A-Za-z0-9-]{1,64}";
/** Statuses that must be sent without a body; constructing a Response with one throws. */
const NULL_BODY_STATUSES: ReadonlySet<number> = new Set([204, 205, 304]);

interface AgentRoute {
  method: "GET" | "POST";
  pattern: RegExp;
  /** Query parameters passed through; everything else is dropped. */
  query?: readonly string[];
  /** Largest body in bytes (defaults to DEFAULT_ROUTE_BODY). */
  maxBody?: number;
}

const ROUTES: readonly AgentRoute[] = [
  { method: "GET", pattern: /^\/preferences$/ },
  { method: "POST", pattern: /^\/preferences$/ },
  { method: "POST", pattern: /^\/history\/clear$/ },
  { method: "GET", pattern: /^\/runs$/, query: ["before"] },
  { method: "GET", pattern: new RegExp(`^/runs/${ID}$`) },
  { method: "POST", pattern: /^\/runs$/ },
  { method: "POST", pattern: new RegExp(`^/runs/${ID}/control$`) },
  { method: "GET", pattern: /^\/suggestions$/, query: ["locale", "project_id"] },
  { method: "POST", pattern: new RegExp(`^/suggestions/${ID}/dismiss$`) },
  { method: "POST", pattern: new RegExp(`^/suggestions/${ID}/revise$`) },
  { method: "POST", pattern: /^\/resources$/, maxBody: AGENT_API_MAX_BODY },
];

function findRoute(method: string, pathname: string) {
  if (!pathname.startsWith(`${AGENT_API_PREFIX}/`)) return null;
  const path = pathname.slice(AGENT_API_PREFIX.length);
  const route = ROUTES.find((entry) => entry.method === method && entry.pattern.test(path));
  return route ? { route, path } : null;
}

/** Largest body in bytes for an allowed route, or null when the route is not allowed. */
export function agentApiBodyLimit(method: string, pathname: string): number | null {
  const found = findRoute(method, pathname);
  return found ? (found.route.maxBody ?? DEFAULT_ROUTE_BODY) : null;
}

/** True when an allowed route receives a passed-through query value that is too long. */
export function agentApiQueryTooLong(method: string, pathname: string, search: string): boolean {
  const found = findRoute(method, pathname);
  if (!found) return false;
  const incoming = new URLSearchParams(search);
  return (found.route.query ?? []).some(
    (name) => (incoming.get(name)?.length ?? 0) > MAX_QUERY_VALUE_LENGTH,
  );
}

/** Backend path and query for an allowed agent request, or null when the route is not allowed. */
export function agentApiTarget(method: string, pathname: string, search: string): string | null {
  const found = findRoute(method, pathname);
  if (!found) return null;
  const { route, path } = found;
  const incoming = new URLSearchParams(search);
  const outgoing = new URLSearchParams();
  for (const name of route.query ?? []) {
    const value = incoming.get(name);
    if (value !== null) outgoing.set(name, value);
  }
  const query = outgoing.toString();
  return `/api/workspace-agent${path}${query ? `?${query}` : ""}`;
}

export interface AgentApiProxyOptions {
  /** Main backend origin. Unset means the agent is not available here. */
  baseUrl?: string;
  fetch?: (input: URL, init: RequestInit) => Promise<Response>;
}

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

/** Reads a response body as UTF-8 text, failing when it exceeds maxBytes. */
async function readCappedText(response: Response, maxBytes: number): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new RangeError("Upstream response exceeds the size limit");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

/**
 * Relays an upstream response: its status, and a JSON body only. Cookies and other upstream
 * headers stay on the server. Unreadable or oversized bodies become a 502.
 */
async function relayUpstream(upstream: Response): Promise<Response> {
  const { status } = upstream;
  if (NULL_BODY_STATUSES.has(status)) return new Response(null, { status });
  // Statuses outside 200-599 cannot be constructed as a Response; fetch never delivers them.
  if (status < 200 || status > 599)
    return json({ error: "Ana și Radu returned an unexpected response." }, 502);

  let text: string;
  try {
    text = await readCappedText(upstream, MAX_UPSTREAM_BODY);
  } catch {
    return json({ error: "Ana și Radu returned an unreadable response. Try again." }, 502);
  }
  const isJson = (upstream.headers.get("Content-Type") ?? "").includes("application/json");
  if (!isJson)
    return json({ error: `Agent request failed (${status})` }, upstream.ok ? 502 : status);
  return new Response(text, {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

/** Forwards one browser request to the backend agent API with the session bearer. */
export async function proxyAgentApi(
  request: Request,
  bearer: string,
  options: AgentApiProxyOptions,
): Promise<Response> {
  const url = new URL(request.url);
  const target = agentApiTarget(request.method, url.pathname, url.search);
  if (!target) return json({ error: "Not found" }, 404);
  if (agentApiQueryTooLong(request.method, url.pathname, url.search))
    return json({ error: "Query value too long" }, 400);
  if (!options.baseUrl) return json({ error: "Ana și Radu are not available here." }, 503);
  if (!/^Bearer [^\s]+$/i.test(bearer)) return json({ error: "Authentication required" }, 401);

  // A retried run is idempotent through its body's request_id; no idempotency header is used.
  const headers = new Headers({ Authorization: bearer, Accept: "application/json" });
  let body: string | undefined;
  if (request.method === "POST") {
    try {
      body = await request.text();
    } catch {
      return json({ error: "Request body could not be read" }, 400);
    }
    // The app-level bodyLimit already caps the raw bytes; this enforces the per-route limit.
    const limit = agentApiBodyLimit(request.method, url.pathname) ?? DEFAULT_ROUTE_BODY;
    if (new TextEncoder().encode(body).length > limit)
      return json({ error: "Request too large" }, 413);
    headers.set("Content-Type", "application/json");
  }

  try {
    const upstream = await (options.fetch ?? fetch)(new URL(target, options.baseUrl), {
      method: request.method,
      headers,
      body,
      redirect: "error",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return await relayUpstream(upstream);
  } catch {
    return json({ error: "Ana și Radu could not be reached. Try again." }, 502);
  }
}
