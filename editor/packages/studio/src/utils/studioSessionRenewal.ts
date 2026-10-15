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
