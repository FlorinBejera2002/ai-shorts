// Connection, conversation and controls for the workspace agent (Ana și Radu) in Studio.
// Connects on demand, polls only while a run works, and reports finished Studio edits so the
// host can refresh the preview and offer undo.
import type { StudioLocale } from "../../i18n/dictionary";
import { useCallback, useRef, useState } from "react";
import { useMountEffect } from "../../hooks/useMountEffect";
import { t } from "../../i18n/translate";
import { AgentApiError, AgentOfflineError, createAgentApi, type AgentApi } from "./agentApi";
import {
  mergeRuns,
  pollingDelay,
  touchesStudio,
  type AgentCommand,
  type AgentContextScope,
  type AgentRun,
  type AgentRunRequest,
  type AgentSuggestion,
} from "./agentModel";
import { useLatestRef } from "./useLatestRef";

export type AgentConnection = "idle" | "connecting" | "online" | "offline";

/** How a finished Studio run changed the composition. */
export type AgentStudioChange = "applied" | "undone";

export interface WorkspaceAgentOptions {
  api?: AgentApi;
  /**
   * A run finished a Studio edit (the preview must reload). "applied" may offer undo;
   * "undone" is the compensation run an undo started.
   */
  onStudioChange?: (run: AgentRun, change: AgentStudioChange) => void;
}

type AgentRequestFields = Omit<AgentRunRequest, "request_id">;

/** True when a stored retry body is the same request (message, context and suggestion). */
export function sameRequest(stored: AgentRunRequest, next: AgentRequestFields): boolean {
  return (
    stored.message === next.message &&
    stored.suggestion_id === next.suggestion_id &&
    JSON.stringify(stored.context) === JSON.stringify(next.context)
  );
}

function message(cause: unknown): string {
  if (cause instanceof AgentApiError) return cause.message;
  return t("agent.errorGeneric");
}

function newRequestId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(16)}-0000-4000-8000-${Math.random().toString(16).slice(2, 14)}`;
}

export function useWorkspaceAgent({ api: given, onStudioChange }: WorkspaceAgentOptions = {}) {
  const api = useRef(given ?? createAgentApi()).current;
  const [connection, setConnection] = useState<AgentConnection>("idle");
  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [suggestions, setSuggestions] = useState<AgentSuggestion[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState<AgentRunRequest | null>(null);
  const runsRef = useRef<AgentRun[]>([]);
  // Compensation runs started by undo: their completion reports "undone", never a new undo.
  const undoRuns = useRef(new Set<string>());
  const lock = useRef(false);
  const poll = useRef<number | null>(null);
  const alive = useRef(true);
  const changeHandler = useLatestRef(onStudioChange);

  const stopPolling = () => {
    if (poll.current !== null) window.clearTimeout(poll.current);
    poll.current = null;
  };

  // StrictMode mounts twice in development: mark alive again on every mount.
  useMountEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      stopPolling();
    };
  });

  const goOffline = (cause: unknown) => {
    if (!(cause instanceof AgentOfflineError)) return false;
    stopPolling();
    setConnection("offline");
    return true;
  };

  // Stores incoming runs; a run that just completed a Studio edit is reported once. `live` runs
  // come from send, control or polling, so one first seen already completed is new work. History
  // (connect) reports nothing it had not already seen working.
  const store = useCallback((incoming: AgentRun[], live = true) => {
    const previous = new Map(runsRef.current.map((run) => [run.id, run]));
    const next = mergeRuns(runsRef.current, incoming);
    runsRef.current = next;
    setRuns(next);
    for (const run of incoming) {
      const before = previous.get(run.id);
      const finished =
        run.status === "completed" && (before ? before.status !== "completed" : live);
      if (finished && touchesStudio(run))
        changeHandler.current?.(run, undoRuns.current.has(run.id) ? "undone" : "applied");
    }
    schedulePoll();
    // schedulePoll reads refs only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function schedulePoll() {
    stopPolling();
    const delay = pollingDelay(runsRef.current);
    if (delay === null || !alive.current) return;
    poll.current = window.setTimeout(() => {
      poll.current = null;
      const active = runsRef.current.filter((run) => pollingDelay([run]) !== null);
      void Promise.all(active.map((run) => api.run(run.id)))
        .then((fresh) => store(fresh))
        .catch((cause: unknown) => {
          if (!goOffline(cause)) schedulePoll();
        });
    }, delay);
  }

  /** Opens the conversation: history and suggestions. Offline when the service is absent. */
  const connect = useCallback(
    async (locale: StudioLocale, projectId?: string) => {
      setConnection("connecting");
      setError(null);
      try {
        const page = await api.list();
        if (!alive.current) return;
        setConnection("online");
        store(page.runs, false);
        setSuggestions(await api.suggestions(locale, projectId).catch(() => []));
      } catch (cause) {
        if (!goOffline(cause)) {
          setConnection("offline");
        }
      }
    },
    [api, store],
  );

  /**
   * Sends a message. A pending retry is reused only for the same request; anything else is a new
   * request with a new id, and the failed one is dropped.
   */
  async function send(text: string, context: AgentContextScope, suggestion?: AgentSuggestion) {
    if (lock.current) return null;
    const fields: AgentRequestFields = {
      message: suggestion?.title ?? text.trim().slice(0, 4000),
      context,
      ...(suggestion ? { suggestion_id: suggestion.id } : {}),
    };
    if (!fields.message) return null;
    const body =
      retry && sameRequest(retry, fields) ? retry : { request_id: newRequestId(), ...fields };
    return submit(body, suggestion);
  }

  /** "Reîncearcă": resends the failed request with its original id. */
  async function retryFailed() {
    if (lock.current || !retry) return null;
    return submit(retry);
  }

  async function submit(body: AgentRunRequest, suggestion?: AgentSuggestion) {
    lock.current = true;
    setBusy(true);
    setError(null);
    try {
      const run = await api.send(body);
      setRetry(null);
      store([run]);
      if (suggestion) setSuggestions((list) => list.filter((item) => item.id !== suggestion.id));
      return run;
    } catch (cause) {
      if (goOffline(cause)) return null;
      // An ambiguous failure may have committed: keep the same request id for the retry.
      setRetry(cause instanceof AgentApiError && cause.status < 500 ? null : body);
      setError(message(cause));
      return null;
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  async function control(run: AgentRun, command: AgentCommand, resourceIds?: string[]) {
    if (lock.current) return null;
    lock.current = true;
    setBusy(true);
    setError(null);
    try {
      const next = await api.control(run, command, resourceIds);
      if (command === "undo") undoRuns.current.add(next.id);
      store([next]);
      return next;
    } catch (cause) {
      if (goOffline(cause)) return null;
      setError(message(cause));
      // A stale revision: refresh the run, never replay an approval.
      await api
        .run(run.id)
        .then((fresh) => store([fresh]))
        .catch(() => {});
      return null;
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  async function dismiss(id: string) {
    setSuggestions((list) => list.filter((item) => item.id !== id));
    await api.dismiss(id).catch(() => {});
  }

  return {
    connection,
    runs,
    suggestions,
    busy,
    error,
    retryPending: retry !== null,
    connect,
    send,
    retryFailed,
    control,
    dismiss,
    clearError: () => setError(null),
  };
}

export type WorkspaceAgent = ReturnType<typeof useWorkspaceAgent>;
