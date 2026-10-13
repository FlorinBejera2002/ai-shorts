import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { posix } from "node:path";
import type { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { parseHTML } from "linkedom";
import { resolveWithinProject } from "../../studio-server/src/helpers/safePath";
import type { StoredProject } from "./store";
import { fields, record, text, version, type RecordValue } from "./agent-validation";

export type AgentApiJSON = (api: Hono, path: string, init?: RequestInit) => Promise<RecordValue>;
const mediaExtension = /\.(png|jpe?g|webp|gif|mp3|wav|m4a|ogg|mp4|webm|mov|woff2?|ttf|otf)$/i;

async function assets(api: Hono, project: StoredProject, call: AgentApiJSON) {
  const tree = await call(api, `/projects/${project.id}`);
  const paths = Array.isArray(tree.files) ? tree.files : [];
  const result: Array<{
    asset_id: string;
    name: string;
    size: number;
    path: string;
    absolute: string;
  }> = [];
  for (const path of paths) {
    if (
      typeof path !== "string" ||
      path.length > 500 ||
      !mediaExtension.test(path) ||
      path
        .split(/[\\/]/)
        .some((part) => part.startsWith(".") || part === "renders" || part === "node_modules")
    )
      continue;
    const absolute = resolveWithinProject(project.dir, path);
    if (!absolute) continue;
    const metadata = await stat(absolute).catch(() => null);
    if (!metadata?.isFile()) continue;
    result.push({
      asset_id: createHash("sha256").update(path).digest("hex"),
      name: path.split(/[\\/]/).pop() ?? path,
      size: metadata.size,
      path,
      absolute,
    });
  }
  return result;
}

async function assetVersion(absolute: string) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(absolute)) hash.update(chunk);
  return `"sha256:${hash.digest("hex")}"`;
}

export async function executeAssetAction(
  api: Hono,
  project: StoredProject,
  name: string,
  input: RecordValue,
  current: { html: string; version: string },
  call: AgentApiJSON,
): Promise<RecordValue | null> {
  if (!name.startsWith("studio.assets.")) return null;
  const inventory = await assets(api, project, call);
  if (name === "studio.assets.list") {
    fields(input, ["id", "page"]);
    const page = input.page ?? 1;
    if (typeof page !== "number" || !Number.isSafeInteger(page) || page < 1 || page > 10000)
      throw new HTTPException(422, { message: "Invalid Studio asset page" });
    const offset = (page - 1) * 200;
    return {
      id: project.id,
      version: current.version,
      page,
      has_more: inventory.length > offset + 200,
      assets: inventory
        .slice(offset, offset + 200)
        .map(({ asset_id, name, size }) => ({ asset_id, name, size })),
    };
  }
  const assetID = text(input.asset_id, 64);
  const asset = inventory.find((entry) => entry.asset_id === assetID);
  if (!asset) throw new HTTPException(404, { message: "Studio asset was not found" });
  const expected = await assetVersion(asset.absolute);
  const { document } = parseHTML(current.html);
  const usedBy = [...document.querySelectorAll("[src], [href]")]
    .filter((element) =>
      [element.getAttribute("src"), element.getAttribute("href")].some(
        (value) => value === asset.path || value === `./${asset.path}`,
      ),
    )
    .map((element) => ({
      id: element.id || undefined,
      hf_id: element.getAttribute("data-hf-id") || undefined,
      tag: element.tagName.toLowerCase(),
    }));
  const publicAsset = {
    asset_id: asset.asset_id,
    name: asset.name,
    size: asset.size,
    expected_asset_version: expected,
  };
  if (name === "studio.assets.get") {
    fields(input, ["id", "asset_id"]);
    return {
      id: project.id,
      version: current.version,
      asset: publicAsset,
      used_by: usedBy,
      references_complete: false,
      reference_warning:
        "Only direct media references are listed. Stylesheets, fonts and dynamic references may also use this asset.",
    };
  }
  fields(input, [
    "id",
    "asset_id",
    "expected_version",
    "expected_asset_version",
    ...(name === "studio.assets.rename" ? ["new_name"] : []),
  ]);
  if (
    version(input.expected_version) !== current.version ||
    version(input.expected_asset_version) !== expected
  )
    throw new HTTPException(409, {
      message: "Studio asset or composition changed; inspect it again",
    });
  if (name === "studio.assets.rename") {
    const newName = text(input.new_name, 200).trim();
    if (
      !newName ||
      newName.startsWith(".") ||
      /[<>:"/\\|?*]/.test(newName) ||
      [...newName].some((character) => character.charCodeAt(0) < 32) ||
      /[. ]$/.test(newName) ||
      /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(newName) ||
      posix.extname(newName).toLowerCase() !== posix.extname(asset.name).toLowerCase()
    )
      throw new HTTPException(422, {
        message: "Choose a valid Studio asset filename with the same extension",
      });
    const path = posix.join(posix.dirname(asset.path.replaceAll("\\", "/")), newName);
    if (path === asset.path)
      throw new HTTPException(422, { message: "Studio asset already has this name" });
    const result = await call(
      api,
      `/projects/${project.id}/files/${asset.path.split("/").map(encodeURIComponent).join("/")}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "If-Match": expected,
          "X-Studio-Document-Version": current.version,
        },
        body: JSON.stringify({ newPath: path }),
      },
    );
    const renamed = (await assets(api, project, call)).find((entry) => entry.path === path);
    if (
      result.path !== path ||
      !renamed ||
      (await assetVersion(renamed.absolute)) !== expected ||
      (await stat(asset.absolute).catch(() => null))
    )
      throw new HTTPException(409, { message: "Studio asset rename could not be verified" });
    const saved = await call(api, `/projects/${project.id}/files/index.html`);
    return {
      id: project.id,
      version: version(saved.version),
      asset: {
        asset_id: renamed.asset_id,
        name: renamed.name,
        size: renamed.size,
        expected_asset_version: expected,
      },
    };
  }
  if (name === "studio.assets.duplicate") {
    const result = await call(api, `/projects/${project.id}/duplicate-file`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "If-Match": expected },
      body: JSON.stringify({ path: asset.path }),
    });
    const path = typeof result.path === "string" ? result.path : "";
    const absolute = path ? resolveWithinProject(project.dir, path) : null;
    const metadata = absolute ? await stat(absolute).catch(() => null) : null;
    if (!absolute || !metadata?.isFile() || (await assetVersion(absolute)) !== expected)
      throw new HTTPException(409, { message: "Studio asset copy could not be verified" });
    return {
      id: project.id,
      version: current.version,
      asset: {
        asset_id: createHash("sha256").update(path).digest("hex"),
        name: path.split(/[\\/]/).pop() ?? path,
        size: metadata.size,
        expected_asset_version: expected,
      },
    };
  }
  if (name === "studio.assets.delete") {
    await call(
      api,
      `/projects/${project.id}/files/${asset.path.split("/").map(encodeURIComponent).join("/")}`,
      {
        method: "DELETE",
        headers: { "If-Match": expected, "X-Studio-Document-Version": current.version },
      },
    );
    if ((await assets(api, project, call)).some((entry) => entry.asset_id === assetID))
      throw new HTTPException(409, { message: "Studio asset deletion could not be verified" });
    return {
      id: project.id,
      deleted: true,
      asset: publicAsset,
      affected_layers: usedBy,
      references_complete: false,
    };
  }
  throw new HTTPException(422, { message: "Unsupported Studio asset action" });
}

export async function executeRenderAction(
  api: Hono,
  project: StoredProject,
  name: string,
  input: RecordValue,
  call: AgentApiJSON,
): Promise<RecordValue | null> {
  if (!["studio.renders.list", "studio.renders.delete", "studio.export"].includes(name))
    return null;
  const listed = await call(api, `/projects/${project.id}/renders`);
  const renders = (Array.isArray(listed.renders) ? listed.renders : [])
    .filter(record)
    .filter(
      (entry) =>
        typeof entry.id === "string" &&
        entry.id.startsWith(`${project.id}_`) &&
        /^[a-zA-Z0-9_.-]+$/.test(entry.id),
    );
  if (name === "studio.renders.list") {
    fields(input, ["id"]);
    return {
      id: project.id,
      renders: renders.map(({ id, filename, size, createdAt, status, durationMs }) => ({
        id,
        filename,
        size,
        createdAt,
        status,
        durationMs,
      })),
    };
  }
  fields(input, ["id", "job_id"]);
  const jobID = text(input.job_id, 160);
  const render = renders.find((entry) => entry.id === jobID);
  if (!render) throw new HTTPException(404, { message: "Studio render was not found" });
  const status = await call(api, `/render/${jobID}/status`);
  if (
    status.status !== "complete" ||
    status.verified !== true ||
    typeof status.bytes !== "number" ||
    status.bytes < 1
  )
    throw new HTTPException(409, {
      message:
        "Only a completed, verified Studio render can be exported or deleted. Manage active or interrupted outputs in Studio.",
    });
  if (name === "studio.export") {
    return {
      id: project.id,
      job_id: jobID,
      status: "complete",
      verified: true,
      bytes: status.bytes,
      download_path: `/api/render/${jobID}/download`,
    };
  }
  await call(api, `/render/${jobID}`, { method: "DELETE" });
  const after = await call(api, `/projects/${project.id}/renders`);
  if (
    Array.isArray(after.renders) &&
    after.renders.some((entry) => record(entry) && entry.id === jobID)
  )
    throw new HTTPException(409, { message: "Studio render deletion could not be verified" });
  return { id: project.id, job_id: jobID, deleted: true };
}
