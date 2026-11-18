import { join, resolve } from "node:path";
import { ProjectStore } from "./store";
import { CompositionStore } from "./composition-store";
import { ObjectProjectStore } from "./object-project-store";
import { studioStateObjects, type StateObjects } from "./state-objects";

export const OWNER_ASSETS_ID = "00000000-0000-5000-a000-000000000001";
export function createStateStores(data: string, objects?: StateObjects, prefix = "studio/v1") {
  const dataRoot = resolve(data);
  const imports: Array<{ source: string; store: ObjectProjectStore }> = [];
  function create(cache: string, source: string, namespace: string): ProjectStore {
    if (!objects) return new ProjectStore(source);
    const store = new ObjectProjectStore(cache, objects, namespace, prefix);
    imports.push({ source, store });
    return store;
  }
  const store = create(`${dataRoot}-cache`, dataRoot, "editable");
  const compositions = new CompositionStore(`${dataRoot}-compositions-cache`, (path, namespace) =>
    create(path, join(`${dataRoot}-compositions`, namespace), namespace),
  );
  const agentReceipts = objects
    ? create(`${dataRoot}-agent-receipts-cache`, `${dataRoot}-agent-receipts`, "agent-receipts")
    : undefined;
  const ownerAssets = objects
    ? create(`${dataRoot}-owner-assets-cache`, `${dataRoot}-owner-assets`, "owner-assets")
    : undefined;
  return { store, compositions, agentReceipts, ownerAssets, imports, objects, prefix };
}
export function configuredStateStores(data: string) {
  return createStateStores(
    data,
    studioStateObjects(),
    process.env.SNEEPCUT_STUDIO_S3_PREFIX || "studio/v1",
  );
}
