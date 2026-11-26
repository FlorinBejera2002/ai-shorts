export interface StudioSessionInfo {
  userId: string;
  appOrigin: string;
}

export function readStudioSessionInfo(value: unknown): StudioSessionInfo | null {
  if (
    !value ||
    typeof value !== "object" ||
    !("userId" in value) ||
    !("appOrigin" in value) ||
    typeof value.userId !== "string" ||
    !/^[a-f0-9-]{36}$/i.test(value.userId) ||
    typeof value.appOrigin !== "string"
  )
    return null;
  try {
    const url = new URL(value.appOrigin);
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if (
      (url.protocol !== "https:" && !(local && url.protocol === "http:")) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== "/"
    )
      return null;
    return { userId: value.userId, appOrigin: url.origin };
  } catch {
    return null;
  }
}

const SESSION_INFO_TIMEOUT_MS = 15000;
let sessionInfoRequest: Promise<StudioSessionInfo | null> | null = null;

async function fetchStudioSessionInfo(): Promise<StudioSessionInfo | null> {
  if (!document.querySelector('meta[name="sneepcut-session"][content="enabled"]')) return null;
  const response = await fetch("/sneepcut/session-info", {
    signal: AbortSignal.timeout(SESSION_INFO_TIMEOUT_MS),
    credentials: "include",
    cache: "no-store",
  });
  if (!response.ok) throw new Error("Session unavailable");
  const session = readStudioSessionInfo(await response.json());
  if (!session) throw new Error("Invalid session configuration");
  return session;
}

/**
 * Session info for this page, null when Studio is not hosted by SneepCut. The request is made once
 * and shared by every caller; a failed request is cleared so the next call retries it.
 */
export function loadStudioSessionInfo(): Promise<StudioSessionInfo | null> {
  sessionInfoRequest ??= fetchStudioSessionInfo().catch((error: unknown) => {
    sessionInfoRequest = null;
    throw error;
  });
  return sessionInfoRequest;
}

/** Forgets the shared session info request so tests can start from a clean page. */
export function resetStudioSessionInfoRequest() {
  sessionInfoRequest = null;
}

/** Reconnects only the cookie session. It never replaces the editor or its pending saves. */
export function startStudioSessionRenewal(
  info: StudioSessionInfo,
  frame: () => Window | null,
  report: (failed: boolean) => void,
  host: Window = window,
) {
  let pending: string | null = null;
  let ready = false;
  let stopped = false;
  let deadline: ReturnType<typeof setTimeout> | undefined;
  const finish = (failed: boolean) => {
    clearTimeout(deadline);
    pending = null;
    if (!stopped) report(failed);
  };
  const renew = () => {
    if (stopped || pending) return;
    pending = crypto.randomUUID();
    deadline = setTimeout(() => finish(true), 45000);
    if (ready)
      frame()?.postMessage(
        { type: "sneepcut:renew-session", requestId: pending, userId: info.userId },
        info.appOrigin,
      );
  };
  const receive = (event: MessageEvent) => {
    const source = frame();
    if (
      !source ||
      event.source !== source ||
      event.origin !== info.appOrigin ||
      !event.data ||
      typeof event.data !== "object"
    )
      return;
    if (event.data.type === "sneepcut:session-bridge-ready") {
      ready = true;
      if (pending)
        frame()?.postMessage(
          { type: "sneepcut:renew-session", requestId: pending, userId: info.userId },
          info.appOrigin,
        );
      else renew();
    } else if (
      pending &&
      event.data.type === "sneepcut:session-result" &&
      event.data.requestId === pending &&
      typeof event.data.ok === "boolean"
    ) {
      finish(!event.data.ok);
    }
  };
  const resume = () => {
    if (host.document.visibilityState === "visible") renew();
  };
  host.addEventListener("message", receive);
  host.document.addEventListener("visibilitychange", resume);
  const timer = setInterval(renew, 5 * 60 * 1000);
  renew();
  return {
    renew,
    stop() {
      stopped = true;
      clearInterval(timer);
      clearTimeout(deadline);
      host.removeEventListener("message", receive);
      host.document.removeEventListener("visibilitychange", resume);
    },
  };
}
