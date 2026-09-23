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
    if (response.status === 503) throw new Error("The AI service is unavailable. Try again later.");
    if (response.status === 504) throw new Error("The AI request timed out. Try a smaller edit.");
    throw new Error(
      `Could not generate the edit (${response.status}). Your composition is unchanged.`,
    );
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
    throw new Error("The AI service returned an invalid proposal.");
  }
  return { html: result.html, summary: result.summary, source, path, projectId };
}
