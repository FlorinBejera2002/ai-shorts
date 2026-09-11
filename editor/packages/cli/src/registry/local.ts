import { realpathSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { readBoundedRegistryFile } from "./boundedFile.js";

export const BUNDLED_REGISTRY_URL = "sneepcut:bundled";

/** The shipped catalog is authoritative; missing assets never trigger remote fallback. */
export function readLocalRegistryFile(parts: string[], maxBytes: number): Buffer {
  const configuredRoot = process.env.SNEEPCUT_REGISTRY_DIR;
  const root = realpathSync(
    configuredRoot || fileURLToPath(new URL("../../../../registry/", import.meta.url)),
  );
  if (parts.some((part) => !part || isAbsolute(part) || part.includes(":"))) {
    throw new Error("Invalid local registry path");
  }
  const target = realpathSync(resolve(root, ...parts));
  const pathWithinRoot = relative(root, target);
  if (
    !pathWithinRoot ||
    pathWithinRoot === ".." ||
    pathWithinRoot.startsWith(`..${sep}`) ||
    isAbsolute(pathWithinRoot)
  ) {
    throw new Error("Local registry path escapes the bundled catalog");
  }
  const bytes = readBoundedRegistryFile(target, maxBytes);
  if (
    bytes.subarray(0, 80).toString("utf8").startsWith("version https://git-lfs.github.com/spec/v1")
  ) {
    throw new Error(
      "Bundled registry asset is missing: finish the Git LFS import before installing it",
    );
  }
  return bytes;
}
