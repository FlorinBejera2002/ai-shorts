import type { DomEditSelection } from "../components/editor/domEditingTypes";
import type {
  CommitMutationCall,
  CommitMutationOptions,
  GsapScriptCommitsParams,
  MutationResult,
} from "./gsapScriptCommitTypes";
import { readProjectFileContent } from "../utils/studioFileHistory";
import { buildProjectApiPath } from "../utils/projectRouting";
import { createStudioSaveHttpError } from "../utils/studioSaveDiagnostics";
import {
  applySourceCutIsolationToPreview,
  planSourceCutIsolation,
  sourceCutHost,
  sourceCutParentPath,
} from "../utils/sourceCutIsolation";

const selectedHost = (selection: DomEditSelection) =>
  selection.element ? sourceCutHost(selection.element) : null;

export function sourceCutMutationFiles(
  selection: DomEditSelection,
  activePath: string | null,
): string[] {
  const host = selectedHost(selection);
  const file = selection.sourceFile || activePath || "index.html";
  return host && host !== selection.element
    ? [sourceCutParentPath(host, activePath), file]
    : [file];
}

/** Separate different instances of one child file before a group mutation. */
export function groupSourceCutMutationCalls(calls: CommitMutationCall[]): CommitMutationCall[][] {
  const groups = new Map<string, CommitMutationCall[]>();
  for (const call of calls) {
    const host = selectedHost(call.selection);
    const key = host && host !== call.selection.element ? host.id : call.selection.sourceFile || "";
    const group = groups.get(key) ?? [];
    group.push(call);
    groups.set(key, group);
  }
  return [...groups.values()];
}

/** A final no-op, instant patch or failure still owes earlier scopes their rebind. */
export async function runSourceCutMutationGroups(
  calls: CommitMutationCall[],
  options: CommitMutationOptions,
  commit: (
    group: CommitMutationCall[],
    options: CommitMutationOptions,
  ) => Promise<MutationResult | undefined>,
  finalize: () => void,
): Promise<void> {
  const groups = groupSourceCutMutationCalls(calls);
  let deferredScope = false;
  try {
    for (const [index, group] of groups.entries()) {
      const deferPreviewSync = options.deferPreviewSync || index < groups.length - 1;
      // eslint-disable-next-line react-doctor/async-await-in-loop -- Fork allocation and shared parent writes require transaction ordering.
      const result = await commit(group, { ...options, deferPreviewSync });
      const selection = group[0]!.selection;
      const host = selectedHost(selection);
      if (
        deferPreviewSync &&
        result?.scriptText &&
        result.changed !== false &&
        host &&
        host !== selection.element
      )
        deferredScope = true;
    }
  } finally {
    if (deferredScope && !options.deferPreviewSync) finalize();
  }
}

/** Fork first, mutate the copy, then publish its parent reference. Siblings never see the edit. */
export async function mutateIsolatedSourceCut(
  projectId: string,
  activePath: string | null,
  selection: DomEditSelection,
  fallbackPath: string,
  writeFile: GsapScriptCommitsParams["writeProjectFile"],
  request: (path: string) => Promise<MutationResult>,
): Promise<MutationResult> {
  const host = selectedHost(selection);
  if (!host || host === selection.element) return request(fallbackPath);
  const plan = await planSourceCutIsolation(
    selection,
    activePath,
    (path) => readProjectFileContent(projectId, path),
    async (path) => {
      const response = await fetch(
        buildProjectApiPath(projectId, `/files/${encodeURIComponent(path)}`),
      );
      if (response.status === 404) return false;
      if (!response.ok) throw await createStudioSaveHttpError(response, `Failed to read ${path}`);
      return true;
    },
  );
  const currentPath =
    host.getAttribute("data-composition-src") ||
    host.getAttribute("data-composition-file") ||
    selection.sourceFile ||
    fallbackPath;
  if (!plan) return { ...(await request(currentPath)), isolatedSourceFile: currentPath };
  if (!writeFile)
    throw new Error("Select the cut in the main timeline before editing its animation.");
  await writeFile(plan.path, plan.content);
  const result = await request(plan.path);
  if (!result.ok) throw new Error("The selected cut could not be updated.");
  if (result.changed === false) return { ...result, isolatedSourceFile: plan.path };
  await writeFile(plan.parentPath, plan.parentAfter, plan.parentBefore);
  applySourceCutIsolationToPreview(plan, selection);
  return {
    ...result,
    isolatedSourceFile: plan.path,
    isolatedHistoryFiles: {
      [plan.parentPath]: { before: plan.parentBefore, after: plan.parentAfter },
    },
  };
}
