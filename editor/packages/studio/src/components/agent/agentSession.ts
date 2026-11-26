// Open state and hand-off context for Ana și Radu. Any part of Studio opens the agent through
// openAgent({ context }): "Cere ajutor" buttons, the timeline range, lint results, storyboard frames.
import { useSyncExternalStore } from "react";

/** Kind of context a caller hands over; it picks the chip icon. */
export type AgentContextKind = "studio" | "selection" | "range" | "block" | "lint" | "frame";

/** Context a caller passes when it opens the agent (prefills the composer and the context chip). */
export interface AgentOpenContext {
  /** Prompt text placed in the composer. */
  prompt?: string;
  /** Selected element label, shown as the context chip. */
  selection?: string;
  /** Composition path or range, shown as the context chip when no label is given. */
  path?: string;
  /** Chip label, for example "Erori din previzualizare · 3". Takes precedence over the others. */
  label?: string;
  kind?: AgentContextKind;
  /**
   * Layer ids (hf id or element id) for the workspace agent's Studio selection. The agent API
   * accepts only these ids as Studio context; the label and path stay on screen (chip) and in
   * the offline engine.
   */
  ids?: string[];
}

export interface OpenAgentOptions {
  context?: AgentOpenContext;
}

let open = false;
let context: AgentOpenContext | null = null;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notify() {
  for (const listener of listeners) listener();
}

export function openAgent(options: OpenAgentOptions = {}) {
  // Reopening an open panel without a context keeps the current hand-off (and its chip).
  if (open && !options.context) return;
  context = options.context ?? null;
  open = true;
  notify();
}

export function closeAgent() {
  if (!open && context === null) return;
  open = false;
  context = null;
  notify();
}

/** Removes the handed-over context but keeps the panel open. */
export function clearAgentContext() {
  if (context === null) return;
  context = null;
  notify();
}

/** True while the agent panel is open. */
export function useAgentOpen(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => open,
    () => false,
  );
}

/** Context the agent was opened with, or null. Cleared on close. */
export function useAgentContext(): AgentOpenContext | null {
  return useSyncExternalStore(
    subscribe,
    () => context,
    () => null,
  );
}

/** Chip text for a handed-over context. */
export function agentContextLabel(value: AgentOpenContext): string | null {
  return value.label ?? value.selection ?? value.path ?? null;
}

// Development builds expose the hand-off for browser checks (the same call "Cere ajutor" makes).
if (import.meta.env?.DEV && typeof window !== "undefined") {
  (window as unknown as { __studioAgent?: unknown }).__studioAgent = { openAgent, closeAgent };
}
