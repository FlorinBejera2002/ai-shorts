import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readLocalRegistryFile } from "./local.js";

describe("SneepCut bundled registry", () => {
  let fixture: string;
  let originalRoot: string | undefined;

  beforeEach(() => {
    originalRoot = process.env.SNEEPCUT_REGISTRY_DIR;
    fixture = mkdtempSync(join(tmpdir(), "sneepcut-registry-"));
    mkdirSync(join(fixture, "catalog"));
    process.env.SNEEPCUT_REGISTRY_DIR = join(fixture, "catalog");
    writeFileSync(join(fixture, "catalog", "asset.txt"), "local asset");
    writeFileSync(join(fixture, "outside.txt"), "private");
  });

  afterEach(() => {
    if (originalRoot === undefined) delete process.env.SNEEPCUT_REGISTRY_DIR;
    else process.env.SNEEPCUT_REGISTRY_DIR = originalRoot;
    rmSync(fixture, { recursive: true, force: true });
  });

  test("reads shipped bytes within the size limit", () => {
    expect(readLocalRegistryFile(["asset.txt"], 20).toString()).toBe("local asset");
    expect(() => readLocalRegistryFile(["asset.txt"], 2)).toThrow("read limit");
  });

  test("rejects traversal and absolute paths", () => {
    expect(() => readLocalRegistryFile(["..", "outside.txt"], 20)).toThrow("escapes");
    expect(() => readLocalRegistryFile([join(fixture, "outside.txt")], 20)).toThrow("Invalid");
    expect(() => readLocalRegistryFile(["https://example.com/a"], 20)).toThrow("Invalid");
  });

  test("reports incomplete LFS assets instead of returning pointer text", () => {
    writeFileSync(
      join(fixture, "catalog", "pointer.txt"),
      "version https://git-lfs.github.com/spec/v1\noid sha256:test\nsize 1\n",
    );
    expect(() => readLocalRegistryFile(["pointer.txt"], 100)).toThrow("Git LFS");
  });

  test("missing assets fail without a remote fallback", () => {
    expect(() => readLocalRegistryFile(["missing.txt"], 20)).toThrow();
  });
});
