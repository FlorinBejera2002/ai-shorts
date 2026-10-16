import { wrapScopedCompositionScript } from "@hyperframes/core/compiler/composition-scoping";
import { applySoftReload, findGsapScriptElements, type SoftReloadResult } from "./gsapSoftReload";

/** Rebuild only the mounted cut, using the same selector/timeline scope as the compiler. */
export function syncSourceCutGsapPreview(
  iframe: HTMLIFrameElement | null,
  host: HTMLElement,
  scriptText: string,
  authoredHtml: string | undefined,
  currentTime: number,
  onAsyncFailure: () => void,
  deferFinalization = false,
): SoftReloadResult {
  const doc = iframe?.contentDocument;
  const runtimeId = host.getAttribute("data-composition-id");
  if (!doc || !runtimeId || !authoredHtml) return "cannot-soft-reload";
  const authored = new DOMParser().parseFromString(authoredHtml, "text/html");
  const root = authored.querySelector<HTMLElement>("[data-composition-id]");
  const authoredId = root?.getAttribute("data-composition-id");
  if (!authoredId) return "cannot-soft-reload";
  const marker = `var __hfTimelineCompId = ${JSON.stringify(runtimeId)};`;
  const scripts = findGsapScriptElements(doc).filter((script) =>
    script.textContent?.includes(marker),
  );
  // The preview can bundle its original scripts into an external resource.
  // The runtime key still identifies the compiled instance unambiguously.
  const timelines = (
    iframe?.contentWindow as (Window & { __timelines?: Record<string, unknown> }) | null
  )?.__timelines;
  if (scripts.length > 1 || !timelines?.[runtimeId]) return "cannot-soft-reload";
  const scopedScript = wrapScopedCompositionScript(
    scriptText,
    authoredId,
    "[Studio] cut animation:",
    `[data-composition-id=${JSON.stringify(runtimeId)}]`,
    runtimeId,
    root?.id,
  );
  return applySoftReload(iframe, scopedScript, {
    currentTimeOverride: currentTime,
    authoredHtml,
    onAsyncFailure,
    deferFinalization,
    compositionScope: { root: host, timelineKey: runtimeId, script: scripts[0] },
  });
}
