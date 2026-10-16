import { describe, expect, it, vi } from "vitest";
import { createEmptyEditHistory } from "../utils/editHistory";
import type { EditHistoryStorageAdapter } from "../utils/editHistoryStorage";
import { createMemoryEditHistoryStorage } from "../utils/editHistoryStorage";
import { saveProjectFilesWithHistory } from "../utils/studioFileHistory";
import {
  serializeStudioFileMutation,
  serializeStudioFileMutations,
} from "../utils/studioFileMutationCoordinator";
import {
  createPersistentEditHistoryController,
  createPersistentEditHistoryStore,
} from "./usePersistentEditHistory";

describe("createPersistentEditHistoryController", () => {
  it("undo waits for an in-flight save and then restores its latest recorded edit", async () => {
    const store = createPersistentEditHistoryStore({
      projectId: "project-1",
      storage: createMemoryEditHistoryStorage(),
      initialState: createEmptyEditHistory(),
      onChange: () => {},
    });
    await store.recordEdit({
      label: "Earlier resize",
      kind: "timeline",
      files: { "index.html": { before: "original", after: "resized" } },
    });
    let disk = "resized";
    let releaseWrite!: () => void;
    let writeStarted!: () => void;
    let undoWaiting!: () => void;
    const writeGate = new Promise<void>((resolve) => {
      releaseWrite = resolve;
    });
    const writing = new Promise<void>((resolve) => {
      writeStarted = resolve;
    });
    const waiting = new Promise<void>((resolve) => {
      undoWaiting = resolve;
    });
    const writeFile = async (_path: string, content: string) => {
      if (content === "trimmed") {
        writeStarted();
        await writeGate;
      }
      disk = content;
    };
    const callbacks = {
      readFile: async () => disk,
      writeFile,
      serialize: <T>(paths: readonly string[], task: () => Promise<T>) => {
        undoWaiting();
        return serializeStudioFileMutations(writeFile, paths, task);
      },
    };
    const save = saveProjectFilesWithHistory({
      projectId: "project-1",
      label: "Left trim",
      kind: "timeline",
      files: { "index.html": "trimmed" },
      readFile: callbacks.readFile,
      writeFile,
      recordEdit: store.recordEdit,
    });
    await writing;
    const undo = store.undo(callbacks);
    await waiting;
    // The save owns the file lock; undo has requested that same lock before
    // the save records its history. A reversed lock order deadlocks here.
    releaseWrite();
    const [, result] = await Promise.all([save, undo]);
    expect(result).toMatchObject({ ok: true, label: "Left trim" });
    expect(disk).toBe("resized");
    expect(store.snapshot().undoLabel).toBe("Earlier resize");
    expect(store.snapshot().redoLabel).toBe("Left trim");
    await expect(store.redo(callbacks)).resolves.toMatchObject({ ok: true, label: "Left trim" });
    expect(disk).toBe("trimmed");
  }, 1000);

  it("reacquires the latest entry's files when a different file is saved while undo waits", async () => {
    const store = createPersistentEditHistoryStore({
      projectId: "project-1",
      storage: createMemoryEditHistoryStorage(),
      initialState: createEmptyEditHistory(),
      onChange: () => {},
    });
    await store.recordEdit({
      label: "Earlier edit",
      kind: "timeline",
      files: { "first.html": { before: "original", after: "edited" } },
    });
    const disk: Record<string, string> = { "first.html": "edited", "second.html": "original" };
    const readFile = vi.fn(async (path: string) => disk[path]);
    const writeFile = async (path: string, content: string) => {
      disk[path] = content;
    };
    let releaseFile!: () => void;
    let undoWaiting!: () => void;
    const fileGate = new Promise<void>((resolve) => {
      releaseFile = resolve;
    });
    const waiting = new Promise<void>((resolve) => {
      undoWaiting = resolve;
    });
    const prior = serializeStudioFileMutation(writeFile, "first.html", () => fileGate);
    const lockedPaths: string[][] = [];
    const undo = store.undo({
      readFile,
      writeFile,
      serialize: (paths, task) => {
        lockedPaths.push([...paths]);
        undoWaiting();
        return serializeStudioFileMutations(writeFile, paths, task);
      },
    });
    await waiting;
    await saveProjectFilesWithHistory({
      projectId: "project-1",
      label: "New second-file edit",
      kind: "timeline",
      files: { "second.html": "newer" },
      readFile,
      writeFile,
      recordEdit: store.recordEdit,
    });
    readFile.mockClear();
    releaseFile();
    await prior;
    await expect(undo).resolves.toMatchObject({ ok: true, label: "New second-file edit" });
    expect(lockedPaths).toEqual([["first.html"], ["second.html"]]);
    expect(readFile.mock.calls).toEqual([["second.html"]]);
    expect(disk).toEqual({ "first.html": "edited", "second.html": "original" });
  }, 1000);

  it("does not deadlock or replay stale redo after an in-flight save clears the redo stack", async () => {
    const store = createPersistentEditHistoryStore({
      projectId: "project-1",
      storage: createMemoryEditHistoryStorage(),
      initialState: createEmptyEditHistory(),
      onChange: () => {},
    });
    await store.recordEdit({
      label: "Earlier edit",
      kind: "timeline",
      files: { "index.html": { before: "original", after: "edited" } },
    });
    let disk = "edited";
    let releaseWrite!: () => void;
    let writeStarted!: () => void;
    let redoWaiting!: () => void;
    const writeGate = new Promise<void>((resolve) => {
      releaseWrite = resolve;
    });
    const writing = new Promise<void>((resolve) => {
      writeStarted = resolve;
    });
    const waiting = new Promise<void>((resolve) => {
      redoWaiting = resolve;
    });
    const readFile = async () => disk;
    const writeFile = async (_path: string, content: string) => {
      if (content === "newer") {
        writeStarted();
        await writeGate;
      }
      disk = content;
    };
    await store.undo({ readFile, writeFile });
    const save = saveProjectFilesWithHistory({
      projectId: "project-1",
      label: "New edit",
      kind: "timeline",
      files: { "index.html": "newer" },
      readFile,
      writeFile,
      recordEdit: store.recordEdit,
    });
    await writing;
    const redo = store.redo({
      readFile,
      writeFile,
      serialize: (paths, task) => {
        redoWaiting();
        return serializeStudioFileMutations(writeFile, paths, task);
      },
    });
    await waiting;
    releaseWrite();
    const [, result] = await Promise.all([save, redo]);
    expect(result).toEqual({ ok: false, reason: "empty" });
    expect(disk).toBe("newer");
    expect(store.snapshot().undoLabel).toBe("New edit");
    expect(store.snapshot().canRedo).toBe(false);
  }, 1000);

  it("records history and reloads it for the same project", async () => {
    const storage = createMemoryEditHistoryStorage();
    const first = await createPersistentEditHistoryController({
      projectId: "project-1",
      storage,
      now: () => 100,
      onChange: () => {},
    });

    await first.recordEdit({
      label: "Move layer",
      kind: "manual",
      files: { "index.html": { before: "a", after: "b" } },
    });

    const second = await createPersistentEditHistoryController({
      projectId: "project-1",
      storage,
      now: () => 200,
      onChange: () => {},
    });

    expect(second.snapshot().canUndo).toBe(true);
    expect(second.snapshot().undoLabel).toBe("Move layer");
    expect(second.snapshot().undoPaths).toEqual(["index.html"]);
  });

  it("undo applies files through the provided callback and persists redo state", async () => {
    const storage = createMemoryEditHistoryStorage();
    const controller = await createPersistentEditHistoryController({
      projectId: "project-1",
      storage,
      now: () => 100,
      onChange: () => {},
    });
    await controller.recordEdit({
      label: "Move layer",
      kind: "manual",
      files: { "index.html": { before: "a", after: "b" } },
    });

    const result = await controller.undo({
      readFile: async (path) => {
        expect(path).toBe("index.html");
        return "b";
      },
      writeFile: async (path, content) => {
        expect(path).toBe("index.html");
        expect(content).toBe("a");
      },
    });
    expect(result.ok).toBe(true);
    expect(result.paths).toEqual(["index.html"]);

    expect(controller.snapshot().canUndo).toBe(false);
    expect(controller.snapshot().canRedo).toBe(true);
    expect(controller.snapshot().redoPaths).toEqual(["index.html"]);
  });

  it("keeps in-memory history when storage saves fail", async () => {
    const storage: EditHistoryStorageAdapter = {
      async get() {
        return null;
      },
      async set() {
        throw new Error("IndexedDB unavailable");
      },
      async delete() {},
    };
    const controller = await createPersistentEditHistoryController({
      projectId: "project-1",
      storage,
      now: () => 100,
      onChange: () => {},
    });

    await expect(
      controller.recordEdit({
        label: "Move layer",
        kind: "manual",
        files: { "index.html": { before: "a", after: "b" } },
      }),
    ).resolves.toBeUndefined();

    expect(controller.snapshot().canUndo).toBe(true);
  });

  it("serializes concurrent record edits against the latest state", async () => {
    const storage = createMemoryEditHistoryStorage();
    let timestamp = 100;
    const store = createPersistentEditHistoryStore({
      projectId: "project-1",
      storage,
      initialState: createEmptyEditHistory(),
      now: () => timestamp++,
      onChange: () => {},
    });

    await Promise.all([
      store.recordEdit({
        label: "Move layer",
        kind: "manual",
        files: { "index.html": { before: "a", after: "b" } },
      }),
      store.recordEdit({
        label: "Resize layer",
        kind: "manual",
        files: { "index.html": { before: "b", after: "c" } },
      }),
    ]);

    expect(store.snapshot().state.undo.map((entry) => entry.label)).toEqual([
      "Move layer",
      "Resize layer",
    ]);
  });

  it("still coalesces concurrent source edits that share a coalesce key", async () => {
    const storage = createMemoryEditHistoryStorage();
    let timestamp = 100;
    const store = createPersistentEditHistoryStore({
      projectId: "project-1",
      storage,
      initialState: createEmptyEditHistory(),
      now: () => timestamp++,
      onChange: () => {},
    });

    await Promise.all([
      store.recordEdit({
        label: "Edit source",
        kind: "source",
        coalesceKey: "source:index.html",
        files: { "index.html": { before: "a", after: "b" } },
      }),
      store.recordEdit({
        label: "Edit source",
        kind: "source",
        coalesceKey: "source:index.html",
        files: { "index.html": { before: "b", after: "c" } },
      }),
    ]);

    expect(store.snapshot().state.undo).toHaveLength(1);
    expect(store.snapshot().state.undo[0].files["index.html"].before).toBe("a");
    expect(store.snapshot().state.undo[0].files["index.html"].after).toBe("c");
  });

  it("reads undo hashes from the live top entry during queued undo calls", async () => {
    const storage = createMemoryEditHistoryStorage();
    let timestamp = 100;
    const store = createPersistentEditHistoryStore({
      projectId: "project-1",
      storage,
      initialState: createEmptyEditHistory(),
      now: () => timestamp++,
      onChange: () => {},
    });
    await store.recordEdit({
      label: "Edit first file",
      kind: "manual",
      files: { "first.html": { before: "first-before", after: "first-after" } },
    });
    await store.recordEdit({
      label: "Edit second file",
      kind: "manual",
      files: { "second.html": { before: "second-before", after: "second-after" } },
    });

    const files: Record<string, string> = {
      "first.html": "first-after",
      "second.html": "second-after",
    };
    const readPaths: string[] = [];

    await Promise.all([
      store.undo({
        readFile: async (path) => {
          readPaths.push(path);
          return files[path];
        },
        writeFile: async (path, content) => {
          files[path] = content;
        },
      }),
      store.undo({
        readFile: async (path) => {
          readPaths.push(path);
          return files[path];
        },
        writeFile: async (path, content) => {
          files[path] = content;
        },
      }),
    ]);

    expect(readPaths).toEqual(["second.html", "first.html"]);
    expect(files).toEqual({
      "first.html": "first-before",
      "second.html": "second-before",
    });
    expect(store.snapshot().canUndo).toBe(false);
    expect(store.snapshot().canRedo).toBe(true);
  });

  it("waits for same-file mutations before checking an undo hash", async () => {
    const storage = createMemoryEditHistoryStorage();
    const store = createPersistentEditHistoryStore({
      projectId: "project-1",
      storage,
      initialState: createEmptyEditHistory(),
      now: () => 100,
      onChange: () => {},
    });
    await store.recordEdit({
      label: "Edit source",
      kind: "source",
      files: { "index.html": { before: "before", after: "after" } },
    });

    let disk = "after";
    let release!: () => void;
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    const writeFile = vi.fn(async (_path: string, content: string) => {
      disk = content;
    });
    const priorMutation = serializeStudioFileMutation(writeFile, "index.html", async () => {
      await blocked;
      disk = "newer-edit";
    });
    const readFile = vi.fn(async () => disk);
    const undo = store.undo({
      readFile,
      writeFile,
      serialize: (paths, task) => serializeStudioFileMutations(writeFile, paths, task),
    });

    await Promise.resolve();
    expect(readFile).not.toHaveBeenCalled();
    release();
    await priorMutation;
    await expect(undo).resolves.toMatchObject({ ok: false, reason: "content-mismatch" });
    expect(disk).toBe("newer-edit");
    expect(writeFile).not.toHaveBeenCalled();
    expect(store.snapshot().canUndo).toBe(true);
  });

  it("returns per-file restored/previous content so the preview can soft-apply", async () => {
    const storage = createMemoryEditHistoryStorage();
    const store = createPersistentEditHistoryStore({
      projectId: "project-1",
      storage,
      initialState: createEmptyEditHistory(),
      now: () => 100,
      onChange: () => {},
    });
    await store.recordEdit({
      label: "Move layer",
      kind: "manual",
      files: { "index.html": { before: "OLD", after: "NEW" } },
    });
    const disk: Record<string, string> = { "index.html": "NEW" };
    const undo = await store.undo({
      readFile: async (p) => disk[p],
      writeFile: async (p, c) => {
        disk[p] = c;
      },
    });
    // `restored` = bytes written (the undo target), `previous` = the current live bytes.
    expect(undo.files).toEqual({ "index.html": { previous: "NEW", restored: "OLD" } });

    const redo = await store.redo({
      readFile: async (p) => disk[p],
      writeFile: async (p, c) => {
        disk[p] = c;
      },
    });
    expect(redo.files).toEqual({ "index.html": { previous: "OLD", restored: "NEW" } });
  });

  it("rolls back files when an undo write fails partway through", async () => {
    const storage = createMemoryEditHistoryStorage();
    const store = createPersistentEditHistoryStore({
      projectId: "project-1",
      storage,
      initialState: createEmptyEditHistory(),
      now: () => 100,
      onChange: () => {},
    });
    await store.recordEdit({
      label: "Edit files",
      kind: "manual",
      files: {
        "first.html": { before: "first-before", after: "first-after" },
        "second.html": { before: "second-before", after: "second-after" },
      },
    });

    const files: Record<string, string> = {
      "first.html": "first-after",
      "second.html": "second-after",
    };
    const result = store.undo({
      readFile: async (path) => files[path],
      writeFile: async (path, content) => {
        if (path === "second.html" && content === "second-before") {
          throw new Error("write failed");
        }
        files[path] = content;
      },
    });

    await expect(result).rejects.toThrow("write failed");
    expect(files).toEqual({
      "first.html": "first-after",
      "second.html": "second-after",
    });
    expect(store.snapshot().undoLabel).toBe("Edit files");
    expect(store.snapshot().canRedo).toBe(false);
  });
});
