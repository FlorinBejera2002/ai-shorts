import { cp, lstat, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createStateStores, OWNER_ASSETS_ID } from "./state-stores";
import { ProjectStore, isUUID } from "./store";
import {
  studioStateObjects,
  verifyStateObjectConditions,
  type StateObjects,
} from "./state-objects";

async function entries(directory: string) {
  try {
    return await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return [];
    throw error;
  }
}

/** Run while Studio is stopped. Originals remain available for a reviewed rollback. */
export async function migrateStudioState(
  data: string,
  objects: StateObjects | undefined = studioStateObjects(),
  prefix = process.env.SNEEPCUT_STUDIO_S3_PREFIX || "studio/v1",
) {
  const stores = createStateStores(data, objects, prefix);
  if (!stores.objects || !stores.agentReceipts || !stores.ownerAssets)
    throw new Error("Studio migration requires SNEEPCUT_STUDIO_STORAGE=s3");
  await verifyStateObjectConditions(stores.objects, stores.prefix);
  const deleted = new Set<string>();
  for (const { source } of stores.imports) {
    for (const entry of await entries(join(source, ".deleted-owners"))) {
      if (!isUUID(entry.name) || !entry.isFile()) throw new Error("Invalid legacy owner fence");
      deleted.add(entry.name);
    }
  }
  for (const owner of deleted) await stores.store.disableOwner(owner);
  let projects = 0,
    receipts = 0,
    assets = 0;
  const scratch = await mkdtemp(join(tmpdir(), "studio-state-migration-"));
  try {
    for (const { source, store } of stores.imports) {
      for (const owner of await entries(source)) {
        if (owner.name === ".deleted-owners") continue;
        if (!owner.isDirectory() || !isUUID(owner.name))
          throw new Error("Unsupported legacy Studio root entry");
        if (deleted.has(owner.name)) continue;
        for (const project of await entries(join(source, owner.name))) {
          if (project.name.startsWith(".prepare-"))
            throw new Error(
              "Unfinished legacy Studio preparation requires review before migration",
            );
          if (store.namespace === "editable" && project.name === ".agent-receipts") {
            if (!project.isDirectory()) throw new Error("Invalid legacy agent receipts");
            const temporary = new ProjectStore(join(scratch, "receipts"));
            for (const receipt of await entries(join(source, owner.name, project.name))) {
              const id = receipt.name.replace(/\.json$/, "");
              if (!receipt.isFile() || !isUUID(id) || receipt.name !== `${id}.json`)
                throw new Error("Invalid legacy agent receipt");
              const value = await readFile(join(source, owner.name, project.name, receipt.name));
              const prepared = await temporary.ensure(owner.name, id, "Studio agent receipt", (p) =>
                writeFile(join(p.dir, "receipt.json"), value),
              );
              const target = stores.imports.find(
                (item) => item.store.namespace === "agent-receipts",
              )!.store;
              await target.importLocal(owner.name, id, prepared.dir);
              receipts++;
            }
          } else if (store.namespace === "editable" && project.name === ".media") {
            if (!project.isDirectory()) throw new Error("Invalid legacy global assets");
            const temporary = new ProjectStore(join(scratch, "assets"));
            const prepared = await temporary.ensure(
              owner.name,
              OWNER_ASSETS_ID,
              "Studio reusable assets",
              async (p) => {
                await cp(join(source, owner.name, project.name), join(p.dir, ".media"), {
                  recursive: true,
                  force: false,
                  errorOnExist: true,
                });
              },
            );
            const target = stores.imports.find(
              (item) => item.store.namespace === "owner-assets",
            )!.store;
            await target.importLocal(owner.name, OWNER_ASSETS_ID, prepared.dir);
            assets++;
          } else {
            if (!project.isDirectory() || !isUUID(project.name))
              throw new Error("Unsupported legacy Studio owner entry");
            const original = join(source, owner.name, project.name);
            if ((await lstat(original)).isSymbolicLink())
              throw new Error("Unsafe legacy Studio project");
            await store.importLocal(owner.name, project.name, original);
            projects++;
          }
        }
      }
    }
    return { projects, receipts, assets, deletedOwners: deleted.size };
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}
if (import.meta.main) {
  const data = process.env.SNEEPCUT_STUDIO_DATA;
  if (!data) throw new Error("Set SNEEPCUT_STUDIO_DATA to the legacy Studio project root");
  console.log("Verified Studio state import (originals retained):", await migrateStudioState(data));
}
