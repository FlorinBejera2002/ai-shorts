import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname } from "node:path";
import { findFfBinary } from "@hyperframes/parsers/ff-binaries";
import type { RenderJobState, StudioApiAdapter } from "../types.js";
import { probeMediaMetadata } from "./mediaMetadata.js";
import { resolveWithinProject } from "./safePath.js";

type Verification = { verified: boolean; bytes: number };
const verifiedFiles = new Map<string, { fingerprint: string; result: Promise<Verification> }>();

/** Fully decode a completed export once per immutable file identity. */
export async function verifyRenderOutput(file: string): Promise<Verification> {
  let fingerprint: string;
  let bytes: number;
  try {
    const stat = statSync(file);
    if (!stat.isFile() || stat.size <= 0) return { verified: false, bytes: 0 };
    bytes = stat.size;
    fingerprint = `${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}`;
  } catch { return { verified: false, bytes: 0 }; }
  const cached = verifiedFiles.get(file);
  if (cached?.fingerprint === fingerprint) return cached.result;
  const result = (async (): Promise<Verification> => {
    const metadata = await probeMediaMetadata(file);
    const ffmpeg = findFfBinary("ffmpeg", { configuredMustExist: true });
    if (!ffmpeg || metadata.probeError || metadata.kind !== "video" || !metadata.color.codecName)
      return { verified: false, bytes };
    const decoded = await new Promise<boolean>((resolve) => {
      execFile(ffmpeg, ["-nostdin", "-v", "error", "-xerror", "-threads", "1", "-i", file,
        "-map", "0:v:0", "-map", "0:a?", "-f", "null", "-"],
      { timeout: 60_000, maxBuffer: 1024 * 1024, windowsHide: true }, (error) => resolve(!error));
    });
    try {
      const after = statSync(file);
      const stable = `${after.dev}:${after.ino}:${after.size}:${after.mtimeMs}:${after.ctimeMs}` === fingerprint;
      return { verified: decoded && stable, bytes };
    } catch { return { verified: false, bytes: 0 }; }
  })();
  if (verifiedFiles.size >= 128) verifiedFiles.delete(verifiedFiles.keys().next().value!);
  verifiedFiles.set(file, { fingerprint, result });
  return result;
}

export function persistRenderState(job: RenderJobState): void {
  const filename = `${job.id}.state.json`;
  const file = resolveWithinProject(dirname(job.outputPath), filename);
  if (!file) throw new Error("Invalid render receipt location");
  const temporary = `${file}.${randomUUID()}.tmp`;
  writeFileSync(temporary, JSON.stringify({ id: job.id, filename: basename(job.outputPath),
    status: job.status, progress: job.progress, error: job.status === "failed" ? "Render did not finish successfully" : undefined }), { mode: 0o600, flag: "wx" });
  renameSync(temporary, file);
}

/** Resolve the owner-scoped project before reading any persisted render state. */
export async function recoverRenderState(adapter: StudioApiAdapter, id: string): Promise<RenderJobState | null> {
  if (id.length > 200 || !/^[a-zA-Z0-9_.-]+$/.test(id)) return null;
  const match = /^(.*)_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}(?:_[a-f0-9-]{36})?$/.exec(id);
  if (!match) return null;
  const project = await adapter.resolveProject(match[1]);
  if (!project) return null;
  const dir = adapter.rendersDir(project);
  const receipt = resolveWithinProject(dir, `${id}.state.json`);
  if (!receipt || !existsSync(receipt) || statSync(receipt).size > 4096) return null;
  try {
    const saved = JSON.parse(readFileSync(receipt, "utf8"));
    if (saved.id !== id || typeof saved.filename !== "string" ||
      ![`${id}.mp4`, `${id}.webm`, `${id}.mov`].includes(saved.filename) ||
      !["rendering", "complete", "failed", "cancelled"].includes(saved.status)) return null;
    const outputPath = resolveWithinProject(dir, saved.filename);
    if (!outputPath) return null;
    let completed = saved.status === "complete";
    if (saved.status === "rendering") {
      const meta = resolveWithinProject(dir, `${id}.meta.json`);
      if (meta && existsSync(meta) && statSync(meta).size <= 4096) {
        try { completed = JSON.parse(readFileSync(meta, "utf8")).status === "complete"; } catch { /* incomplete receipt */ }
      }
    }
    const verified = completed && (await verifyRenderOutput(outputPath)).verified;
    const job: RenderJobState = { id, outputPath, status: verified ? "complete" : saved.status === "cancelled" ? "cancelled" : "failed",
      progress: verified ? 100 : 0, error: verified ? undefined : "Render was interrupted or its output could not be verified" };
    persistRenderState(job);
    return job;
  } catch { return null; }
}
