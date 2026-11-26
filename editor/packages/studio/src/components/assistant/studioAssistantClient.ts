import { t } from "../../i18n/translate";
import { buildProjectApiPath } from "../../utils/projectRouting";

export interface AssistantProposal {
  projectId: string;
  html: string;
  summary: string;
  source: string;
  path: string;
}

export async function requestAssistantProposal(
  projectId: string,
  path: string,
  source: string,
  message: string,
  signal: AbortSignal,
): Promise<AssistantProposal> {
  signal.throwIfAborted();
  const response = await fetch(buildProjectApiPath(projectId, "/assistant"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, html: source }),
    signal,
  });
  if (!response.ok) {
    if (response.status === 503) throw new Error(t("agent.errorUnavailable"));
    if (response.status === 504) throw new Error(t("agent.errorTimeout"));
    throw new Error(t("agent.errorRejected", { status: response.status }));
  }
  const result: unknown = await response.json();
  if (
    !result ||
    typeof result !== "object" ||
    !("html" in result) ||
    !("summary" in result) ||
    typeof result.html !== "string" ||
    typeof result.summary !== "string" ||
    !result.html.trim() ||
    !result.summary.trim()
  ) {
    throw new Error(t("agent.errorInvalid"));
  }
  return { html: result.html, summary: result.summary, source, path, projectId };
}
