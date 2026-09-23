import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile, lstat } from "node:fs/promises";
import { join } from "node:path";
import type { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { parseHTML } from "linkedom";
import {
  patchElementInHtml,
  type PatchOperation,
} from "../../studio-server/src/helpers/sourceMutation";
import { isUUID, type ProjectStore, type StoredProject } from "./store";
import { verifyAgentGrant } from "./agent-auth";

type RecordValue = Record<string, unknown>;
function record(value: unknown): value is RecordValue {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
function fields(value: RecordValue, allowed: string[]) {
  if (Object.keys(value).some((key) => !allowed.includes(key)))
    throw new HTTPException(422, { message: "Unsupported Studio action field" });
}
function text(value: unknown, maximum: number): string {
  if (typeof value !== "string" || !value.trim() || value.length > maximum)
    throw new HTTPException(422, { message: "Invalid Studio action text" });
  return value;
}
function id(value: unknown): string {
  const valueID = text(value, 36);
  if (!isUUID(valueID))
    throw new HTTPException(422, { message: "Invalid Studio project identity" });
  return valueID;
}
function version(value: unknown): string {
  const v = text(value, 80);
  if (!/^"sha256:[a-f0-9]{64}"$/.test(v))
    throw new HTTPException(422, { message: "Inspect the current Studio document before editing" });
  return v;
}
function finite(value: unknown, minimum: number, maximum: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum)
    throw new HTTPException(422, { message: "Studio edit value is outside its allowed range" });
  return value;
}

export interface AgentBridgeOptions {
  secret?: string;
  store: ProjectStore;
  api(user: string): Promise<Hono>;
  initialize(project: StoredProject): Promise<void>;
  now?: () => number;
}

export function createAgentBridge(options: AgentBridgeOptions) {
  const locks = new Map<string, Promise<void>>();
  async function apiJSON(api: Hono, path: string, init?: RequestInit): Promise<RecordValue> {
    const response = await api.request(path, init);
    if (!response.ok) {
      if (response.status === 404)
        throw new HTTPException(404, { message: "Studio project or execution was not found" });
      if (response.status === 409 || response.status === 412 || response.status === 428)
        throw new HTTPException(409, {
          message: "Studio document changed; inspect it again before editing",
        });
      throw new HTTPException(502, { message: "Studio could not verify the requested operation" });
    }
    const body: unknown = await response.json();
    if (!record(body)) throw new HTTPException(502, { message: "Invalid Studio service result" });
    return body;
  }
  async function source(api: Hono, project: string) {
    const body = await apiJSON(api, `/projects/${project}/files/index.html`);
    return { html: text(body.content, 500000), version: version(body.version) };
  }
  function inspect(project: string, title: string, html: string, documentVersion: string) {
    const { document } = parseHTML(html);
    const layers = [...document.querySelectorAll("[id], [data-hf-id]")]
      .filter((element) => !["SCRIPT", "STYLE", "LINK", "META"].includes(element.tagName))
      .slice(0, 100)
      .map((element) => ({
        id: element.id || undefined,
        hf_id: element.getAttribute("data-hf-id") || undefined,
        tag: element.tagName.toLowerCase(),
        text: (element.textContent ?? "").slice(0, 240),
        start: element.getAttribute("data-start"),
        duration: element.getAttribute("data-duration"),
        track: element.getAttribute("data-track-index"),
      }));
    return { id: project, title, version: documentVersion, layers };
  }
  async function write(api: Hono, project: string, expected: string, html: string) {
    const { lintHyperframeHtml } = await import("@hyperframes/lint");
    const lint = await lintHyperframeHtml(html);
    if (lint.findings.some((finding) => finding.severity === "error"))
      throw new HTTPException(422, {
        message: "Studio proposal failed composition validation; the document was preserved",
      });
    const saved = await apiJSON(api, `/projects/${project}/files/index.html`, {
      method: "PUT",
      headers: { "Content-Type": "text/html", "If-Match": expected },
      body: html,
    });
    const actual = await source(api, project);
    if (actual.version !== saved.version || actual.html !== html)
      throw new HTTPException(409, { message: "Studio document changed during verification" });
    return actual;
  }
  async function execute(
    user: string,
    requestID: string,
    name: string,
    input: RecordValue,
  ): Promise<RecordValue> {
    const api = await options.api(user);
    if (name === "studio.list") {
      fields(input, []);
      return {
        projects: (await options.store.list(user))
          .slice(0, 100)
          .map((p) => ({ id: p.id, title: p.title })),
      };
    }
    if (name === "studio.create") {
      fields(input, ["title"]);
      const project = await options.store.ensure(
        user,
        requestID,
        text(input.title, 160),
        options.initialize,
      );
      const content = await source(api, project.id);
      return inspect(project.id, project.title, content.html, content.version);
    }
    const projectID = id(input.id);
    const project = await options.store.resolve(user, projectID);
    if (!project) throw new HTTPException(404, { message: "Studio project was not found" });
    if (name === "studio.render_status" || name === "studio.render_cancel") {
      fields(input, ["id", "job_id", "expected_version"]);
      const jobID = text(input.job_id, 160);
      if (!jobID.startsWith(`${projectID}_`) || !/^[a-zA-Z0-9_.-]+$/.test(jobID))
        throw new HTTPException(422, { message: "Invalid Studio render receipt" });
      const result = await apiJSON(
        api,
        `/render/${jobID}/${name === "studio.render_status" ? "status" : "cancel"}`,
        name === "studio.render_cancel" ? { method: "POST" } : undefined,
      );
      if (result.status === "complete") {
        const current = await source(api, projectID);
        if (current.version !== version(input.expected_version))
          throw new HTTPException(409, {
            message: "Studio changed during rendering; verify the output before using it",
          });
      }
      return { id: projectID, job_id: jobID, expected_version: input.expected_version, ...result };
    }
    const current = await source(api, projectID);
    if (name === "studio.get") {
      fields(input, ["id"]);
      const tree = await apiJSON(api, `/projects/${projectID}`);
      const assets = (Array.isArray(tree.files) ? tree.files : []).filter((path): path is string => typeof path === 'string' && path.length < 500 && !path.startsWith('/') && !path.includes('..') && /\.(png|jpe?g|webp|gif|mp3|wav|m4a|ogg|mp4|webm)$/i.test(path)).slice(0, 200);
      return { ...inspect(projectID, project.title, current.html, current.version), assets };
    }
    if (current.version !== version(input.expected_version))
      throw new HTTPException(409, {
        message: "Studio document changed; inspect it again before editing",
      });
    if (name === "studio.render") {
      fields(input, ["id", "expected_version", "format", "quality", "fps"]);
      const format = input.format ?? "mp4",
        quality = input.quality ?? "standard",
        fps = input.fps ?? 30;
      if (
        !["mp4", "webm", "mov"].includes(String(format)) ||
        !["draft", "standard", "high"].includes(String(quality)) ||
        typeof fps !== "number" ||
        ![24, 25, 30, 50, 60].includes(fps)
      )
        throw new HTTPException(422, { message: "Unsupported Studio render settings" });
      const result = await apiJSON(api, `/projects/${projectID}/render`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "If-Match": current.version },
        body: JSON.stringify({
          format,
          quality,
          fps,
          composition: "index.html",
          telemetryOptOut: true,
        }),
      });
      return {
        id: projectID,
        expected_version: current.version,
        job_id: result.jobId,
        status: result.status,
      };
    }
    let html: string;
    if (name === "studio.restore") {
      fields(input, ["id", "expected_version", "receipt_id"]);
      const receiptID = id(input.receipt_id);
      const prior: unknown = JSON.parse(
        await readFile(
          join(await options.store.userHome(user), ".agent-receipts", `${receiptID}.json`),
          "utf8",
        ),
      );
      if (
        !record(prior) ||
        !record(prior.result) ||
        prior.result.id !== projectID ||
        prior.result.version !== current.version
      )
        throw new HTTPException(409, {
          message: "Studio undo is stale; a later edit must be preserved",
        });
      html = text(prior.previous_html, 500000);
    } else if (name === "studio.revise") {
      fields(input, ["id", "expected_version", "message"]);
      const proposal = await apiJSON(api, `/projects/${projectID}/assistant`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text(input.message, 4000), html: current.html }),
      });
      html = text(proposal.html, 500000);
    } else if (name === "studio.edit") {
      fields(input, ["id", "expected_version", "element_id", "hf_id", "changes"]);
      if (!record(input.changes))
        throw new HTTPException(422, { message: "Studio changes are required" });
      fields(input.changes, [
        "text",
        "start",
        "duration",
        "color",
        "background_color",
        "font_size",
        "opacity",
      ]);
      const changes = input.changes;
      const operations: PatchOperation[] = [];
      if (changes.text !== undefined)
        operations.push({
          type: "text-content",
          property: "textContent",
          value: text(changes.text, 8000),
        });
      for (const property of ["start", "duration"] as const)
        if (changes[property] !== undefined)
          operations.push({
            type: "attribute",
            property: `data-${property}`,
            value: String(finite(changes[property], property === "duration" ? 0.01 : 0, 3600)),
          });
      for (const [field, property] of [
        ["color", "color"],
        ["background_color", "background-color"],
      ])
        if (changes[field] !== undefined) {
          const value = text(changes[field], 9);
          if (!/^#[a-fA-F0-9]{6}([a-fA-F0-9]{2})?$/.test(value))
            throw new HTTPException(422, { message: "Studio colors must be hex values" });
          operations.push({ type: "inline-style", property, value });
        }
      if (changes.font_size !== undefined)
        operations.push({
          type: "inline-style",
          property: "font-size",
          value: `${finite(changes.font_size, 1, 500)}px`,
        });
      if (changes.opacity !== undefined)
        operations.push({
          type: "inline-style",
          property: "opacity",
          value: String(finite(changes.opacity, 0, 1)),
        });
      if (!operations.length || (input.element_id === undefined) === (input.hf_id === undefined))
        throw new HTTPException(422, {
          message: "Choose one stable Studio layer and at least one change",
        });
      const target =
        input.hf_id !== undefined
          ? { hfId: text(input.hf_id, 160) }
          : { id: text(input.element_id, 160) };
      const result = patchElementInHtml(current.html, target, operations);
      if (!result.matched) throw new HTTPException(404, { message: "Studio layer was not found" });
      html = result.html;
    } else throw new HTTPException(422, { message: "Unsupported Studio action" });
    const saved = await write(api, projectID, current.version, html);
    return {
      ...inspect(projectID, project.title, saved.html, saved.version),
      undo: { id: projectID, expected_version: saved.version, receipt_id: requestID },
      __previous_html: current.html,
    };
  }
  return async function handle(request: Request): Promise<Response> {
    if (request.method !== "POST" || request.headers.has("Origin"))
      return Response.json({ error: "Studio agent request rejected" }, { status: 403 });
    const raw = await request.text();
    if (raw.length > 24000)
      return Response.json({ error: "Studio action is too large" }, { status: 413 });
    const user = verifyAgentGrant(
      raw,
      request.headers.get("X-Studio-Agent-Grant") ?? undefined,
      options.secret,
      options.now?.(),
    );
    if (!user) return Response.json({ error: "Invalid Studio agent grant" }, { status: 401 });
    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      return Response.json({ error: "Invalid Studio action" }, { status: 422 });
    }
    if (!record(body) || !record(body.input))
      return Response.json({ error: "Invalid Studio action" }, { status: 422 });
    fields(body, ["request_id", "name", "input"]);
    const requestID = id(body.request_id),
      name = text(body.name, 80),
      input = body.input;
    const previous = locks.get(user) ?? Promise.resolve();
    let release = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    locks.set(user, gate);
    await previous;
    try {
      const readOnly = [
        "studio.list",
        "studio.get",
        "studio.render_status",
        "studio.render_cancel",
      ].includes(name);
      let receiptPath = "";
      const hash = createHash("sha256").update(raw).digest("hex");
      if (!readOnly) {
        const directory = join(await options.store.userHome(user), ".agent-receipts");
        await mkdir(directory, { recursive: true, mode: 0o700 });
        if ((await lstat(directory)).isSymbolicLink())
          throw new HTTPException(409, { message: "Studio receipt storage is unavailable" });
        receiptPath = join(directory, `${requestID}.json`);
        try {
          const prior: unknown = JSON.parse(await readFile(receiptPath, "utf8"));
          if (!record(prior) || prior.hash !== hash || !record(prior.result))
            throw new HTTPException(409, {
              message: "Studio execution already started; inspect the project before retrying",
            });
          return Response.json(prior.result);
        } catch (error) {
          if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT")
            throw error;
        }
        await writeFile(receiptPath, JSON.stringify({ hash }), { flag: "wx", mode: 0o600 });
      }
      const result = await execute(user, requestID, name, input);
      const previousHTML = result.__previous_html;
      delete result.__previous_html;
      if (receiptPath)
        await writeFile(
          receiptPath,
          JSON.stringify({ hash, result, previous_html: previousHTML }),
          { mode: 0o600 },
        );
      return Response.json(result);
    } finally {
      release();
      if (locks.get(user) === gate) locks.delete(user);
    }
  };
}
