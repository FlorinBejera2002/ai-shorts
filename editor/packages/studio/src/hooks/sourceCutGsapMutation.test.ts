// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { makeSelection } from "./domSelectionTestHarness";
import type {
  CommitMutationCall,
  CommitMutationOptions,
  MutationResult,
} from "./gsapScriptCommitTypes";
import { runSourceCutMutationGroups } from "./sourceCutGsapMutation";

function call(id: string, scoped = true): CommitMutationCall {
  const host = document.createElement("div");
  if (scoped) {
    host.id = `cut-${id}`;
    host.setAttribute("data-source-window", "");
    host.setAttribute("data-composition-src", "source-scene-1.html");
  }
  const element = document.createElement("div");
  element.id = id;
  host.append(element);
  return {
    selection: makeSelection(id, element),
    mutation: { type: "update-property", property: "x", value: 20 },
    options: { label: "Move group" },
  };
}

const changed: MutationResult = { ok: true, changed: true, scriptText: "SCRIPT" };

describe("source-cut batch preview finalization", () => {
  it.each(["unchanged", "instant patch"])(
    "rebinds earlier rebuilt scopes when the last group is an %s",
    async (last) => {
      const finalize = vi.fn();
      const commit = vi.fn(
        async (_group: CommitMutationCall[], _options: CommitMutationOptions) => changed,
      );
      commit
        .mockResolvedValueOnce(changed)
        .mockResolvedValueOnce(last === "unchanged" ? { ...changed, changed: false } : changed);
      await runSourceCutMutationGroups(
        [call("a"), call("b", last !== "instant patch")],
        { label: "Move group" },
        commit,
        finalize,
      );
      expect(commit.mock.calls.map(([, options]) => options.deferPreviewSync)).toEqual([
        true,
        false,
      ]);
      expect(finalize).toHaveBeenCalledOnce();
      expect(finalize.mock.invocationCallOrder[0]).toBeGreaterThan(
        commit.mock.invocationCallOrder[1]!,
      );
    },
  );

  it("rebinds successful earlier writes even when the last group rejects", async () => {
    const failure = new Error("last write failed");
    const finalize = vi.fn();
    const commit = vi.fn().mockResolvedValueOnce(changed).mockRejectedValueOnce(failure);
    await expect(
      runSourceCutMutationGroups([call("a"), call("b")], { label: "Move group" }, commit, finalize),
    ).rejects.toBe(failure);
    expect(finalize).toHaveBeenCalledOnce();
  });

  it("leaves finalization to an enclosing deferred transaction", async () => {
    const finalize = vi.fn();
    await runSourceCutMutationGroups(
      [call("a"), call("b")],
      { label: "Move group", deferPreviewSync: true },
      async () => changed,
      finalize,
    );
    expect(finalize).not.toHaveBeenCalled();
  });

  it("does not rebind when no earlier scoped group changed", async () => {
    const finalize = vi.fn();
    await runSourceCutMutationGroups(
      [call("a"), call("b")],
      { label: "Move group" },
      async () => ({ ...changed, changed: false }),
      finalize,
    );
    expect(finalize).not.toHaveBeenCalled();
  });
});
