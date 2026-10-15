import { useEffect, useRef, useState } from "react";
import {
  readStudioSessionInfo,
  startStudioSessionRenewal,
  type StudioSessionInfo,
} from "../utils/studioSessionRenewal";

/** Present only on the authenticated SneepCut host, not the upstream local editor. */
export function StudioSession() {
  const [info, setInfo] = useState<StudioSessionInfo | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [frameAttempt, setFrameAttempt] = useState(0);
  const frame = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (!document.querySelector('meta[name="sneepcut-session"][content="enabled"]')) return;
    const controller = new AbortController();
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]);
    void fetch("/sneepcut/session-info", { signal, credentials: "include", cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Session unavailable");
        const session = readStudioSessionInfo(await response.json());
        if (!session) throw new Error("Invalid session configuration");
        if (!controller.signal.aborted) setInfo(session);
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      });
    return () => controller.abort();
  }, [attempt]);

  useEffect(() => {
    if (!info) return;
    const active = startStudioSessionRenewal(
      info,
      () => frame.current?.contentWindow ?? null,
      setFailed,
    );
    return () => active.stop();
  }, [info, frameAttempt]);

  return (
    <>
      {info && (
        <iframe
          key={frameAttempt}
          ref={frame}
          src={`${info.appOrigin}/studio-session`}
          title="Studio sign-in connection"
          hidden
        />
      )}
      {failed && (
        <div
          role="alert"
          className="absolute left-1/2 top-16 z-[93] flex max-w-[calc(100vw-32px)] -translate-x-1/2 flex-wrap items-center gap-3 rounded-md border border-neutral-600 bg-neutral-900 px-4 py-3 text-xs text-neutral-100 shadow-lg"
        >
          <span>Studio could not reconnect. Keep this tab open to retain your edits.</span>
          <button
            type="button"
            className="rounded-md border border-neutral-500 px-3 py-1 hover:bg-neutral-800"
            onClick={() => {
              if (info) setFrameAttempt((value) => value + 1);
              else setAttempt((value) => value + 1);
            }}
          >
            Retry connection
          </button>
          {info && (
            <a
              className="underline"
              href={`${info.appOrigin}/login`}
              target="_blank"
              rel="noopener noreferrer"
            >
              Sign in to the same account
            </a>
          )}
        </div>
      )}
    </>
  );
}
