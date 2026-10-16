import { readClipTiming } from "@hyperframes/core/composition-contract";
import type { DomEditSelection } from "../components/editor/domEditingTypes";
import type { PatchOperation } from "./sourcePatcher";
import { boundedCutMediaSetting } from "./sourceCutMediaSettings";
import { sourceCutHost } from "./sourceCutIsolation";

export function boundSourceCutOperations(
  selection: DomEditSelection,
  html: string,
  operations: PatchOperation[],
): PatchOperation[] {
  const host = sourceCutHost(selection.element);
  if (!host || host === selection.element) return operations;
  const source = new DOMParser().parseFromString(html, "text/html");
  const authoredId = selection.element.getAttribute("data-hf-authored-id") || selection.id;
  const media = authoredId ? source.getElementById(authoredId) : null;
  if (!media) return operations;
  const target = {
    id: host.id,
    path: selection.sourceFile,
    start: readClipTiming(host).start ?? 0,
    duration: readClipTiming(host).duration ?? 0,
    sourceStart: Number(host.getAttribute("data-playback-start")) || 0,
    playbackRate: Number(host.getAttribute("data-playback-rate")) || 1,
  };
  return operations.map((operation) => {
    if (operation.type !== "attribute" || operation.value === null) return operation;
    const name = operation.property.startsWith("data-")
      ? operation.property
      : `data-${operation.property}`;
    if (!["data-media-start", "data-playback-rate"].includes(name)) return operation;
    const bounded = boundedCutMediaSetting(
      media,
      { type: "attribute", name, value: operation.value },
      target,
    );
    return { ...operation, value: bounded.value };
  });
}

export function syncBoundedSourceCutOperations(
  element: HTMLElement,
  original: PatchOperation[],
  bounded: PatchOperation[],
): void {
  for (let index = 0; index < bounded.length; index++) {
    const operation = bounded[index];
    if (operation.value === original[index].value || operation.value === null) continue;
    const name = operation.property.startsWith("data-")
      ? operation.property
      : `data-${operation.property}`;
    element.setAttribute(name, operation.value);
  }
}
