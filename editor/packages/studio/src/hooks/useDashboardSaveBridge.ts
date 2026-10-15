import { useEffect, useRef } from "react";

/** Dashboard actions must wait for debounced edits before snapshotting the project. */
export function useDashboardSaveBridge(
  projectId: string | null | undefined,
  flush: () => Promise<void>,
  reportError: (message: string, tone: "error") => void,
) {
  const latest = useRef({ flush, reportError });
  useEffect(() => {
    latest.current = { flush, reportError };
  }, [flush, reportError]);
  useEffect(() => {
    if (!projectId) return;
    let pending: Promise<void> | undefined;
    const save = () => {
      pending ??= latest.current.flush().finally(() => {
        pending = undefined;
      });
      return pending;
    };
    let parentOrigin: string | undefined;
    try {
      parentOrigin = new URL(document.referrer).origin;
    } catch {
      /* Standalone editor. */
    }
    const receive = (event: MessageEvent) => {
      if (
        window.parent === window ||
        !parentOrigin ||
        event.source !== window.parent ||
        event.origin !== parentOrigin ||
        event.data?.type !== "sneepcut:flush-project" ||
        event.data.projectId !== projectId ||
        typeof event.data.requestId !== "string"
      )
        return;
      const requestId = event.data.requestId;
      const reply = (error?: string) =>
        window.parent.postMessage(
          {
            type: "sneepcut:project-flushed",
            projectId,
            requestId,
            ...(error ? { error } : {}),
          },
          parentOrigin,
        );
      void save().then(
        () => reply(),
        () => reply("Save your pending Studio edits before regenerating."),
      );
    };
    const leaving = () => {
      void save().catch(() =>
        latest.current.reportError(
          "Studio changes could not be saved. Reopen Studio before regenerating.",
          "error",
        ),
      );
    };
    const visibility = () => {
      if (document.visibilityState === "hidden") leaving();
    };
    window.addEventListener("message", receive);
    window.addEventListener("blur", leaving);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      window.removeEventListener("message", receive);
      window.removeEventListener("blur", leaving);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [projectId]);
}
