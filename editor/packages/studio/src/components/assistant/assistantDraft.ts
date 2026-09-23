export const ASSISTANT_DRAFT_EVENT = "sneepcut:assistant-draft";
export interface AssistantDraft {
  message: string;
  path: string;
}

export function openAssistantDraft(draft: AssistantDraft) {
  window.dispatchEvent(new CustomEvent(ASSISTANT_DRAFT_EVENT, { detail: draft }));
}
