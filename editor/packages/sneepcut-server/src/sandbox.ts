import { spawn } from "node:child_process";
import { constants } from "node:fs";
import { cp, lstat, mkdir, mkdtemp, open, readFile, rm, writeFile } from "node:fs/promises";
import { localizeGsap } from "./assets";
import { tmpdir } from "node:os";
import { basename, dirname, extname, isAbsolute, join, relative } from "node:path";
import type {
  MediaProcessingJobState,
  RenderJobState,
  StudioApiAdapter,
} from "@hyperframes/studio-server";

type RenderOptions = Parameters<StudioApiAdapter["startRender"]>[0];
type ThumbnailOptions = Parameters<NonNullable<StudioApiAdapter["generateThumbnail"]>>[0];
type BackgroundOptions = Parameters<NonNullable<StudioApiAdapter["startBackgroundRemoval"]>>[0];
type ProbeOptions = { project: { id: string; dir: string } };
let activeJobs = 0;

async function readOutput(path: string): Promise<Buffer> {
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const stat = await file.stat();
    if (!stat.isFile() || stat.size > 1024 * 1024 * 1024) throw new Error("Invalid sandbox output");
    return await file.readFile();
  } finally {
    await file.close();
  }
}

/** Each job sees only immutable application files and its own disposable project. */
export function sandboxArguments(directory: string): string[] {
  return [
    "--die-with-parent",
    "--new-session",
    "--unshare-all",
    "--cap-drop",
    "ALL",
    "--clearenv",
    "--ro-bind",
    "/usr",
    "/usr",
    "--ro-bind",
    "/lib",
    "/lib",
    "--ro-bind",
    "/bin",
    "/bin",
    "--ro-bind-try",
    "/lib64",
    "/lib64",
    "--ro-bind",
    "/app",
    "/app",
    "--dir",
    "/etc",
    "--ro-bind",
    "/etc/hosts",
    "/etc/hosts",
    "--ro-bind",
    "/etc/alternatives",
    "/etc/alternatives",
    "--ro-bind",
    "/etc/ld.so.cache",
    "/etc/ld.so.cache",
    "--ro-bind-try",
    "/etc/fonts",
    "/etc/fonts",
    "--proc",
    "/proc",
    "--dev",
    "/dev",
    "--tmpfs",
    "/tmp",
    "--bind",
    directory,
    "/job",
    "--chdir",
    "/job/project",
    "--setenv",
    "PATH",
    "/usr/local/bin:/usr/bin:/bin",
    "--setenv",
    "HOME",
    "/app/sandbox-home",
    "--setenv",
    "XDG_CONFIG_HOME",
    "/tmp/config",
    "--setenv",
    "XDG_CACHE_HOME",
    "/tmp/cache",
    "--setenv",
    "NODE_ENV",
    "production",
    "--setenv",
    "PRODUCER_HEADLESS_SHELL_PATH",
    "/usr/lib/chromium/chromium",
    "--setenv",
    "SNEEPCUT_SANDBOX_CHILD",
    "1",
    "/usr/local/bin/bun",
    "/app/packages/sneepcut-server/src/sandbox-worker.ts",
  ];
}

async function runJob(
  kind: "render" | "thumbnail" | "background" | "probe",
  options: RenderOptions | ThumbnailOptions | BackgroundOptions | ProbeOptions,
  signal: AbortSignal,
  onProgress?: (progress: number, stage?: string) => void,
): Promise<{ main: Buffer; background?: Buffer }> {
  if (process.platform !== "linux") throw new Error("Studio rendering requires the Linux sandbox");
  if (activeJobs >= 2) throw new Error("Studio renderer is busy. Please retry shortly.");
  activeJobs++;
  let directory: string | undefined;
  try {
    directory = await mkdtemp(join(tmpdir(), "studio-job-"));
    let bytes = 0;
    const htmlFiles: string[] = [];
    await cp(options.project.dir, join(directory, "project"), {
      recursive: true,
      filter: async (source) => {
        if (["renders", "node_modules", ".git"].includes(basename(source))) return false;
        const stat = await lstat(source);
        if (stat.isSymbolicLink() || (!stat.isDirectory() && !stat.isFile()))
          throw new Error("Unsupported project file");
        bytes += stat.size;
        if (stat.isFile() && extname(source).toLowerCase() === ".html")
          htmlFiles.push(relative(options.project.dir, source));
        if (bytes > 512 * 1024 * 1024) throw new Error("Project exceeds sandbox size limit");
        return true;
      },
    });
    for (const htmlFile of htmlFiles) {
      const path = join(directory, "project", htmlFile);
      await writeFile(path, localizeGsap(await readFile(path, "utf8")));
    }
    const output =
      kind === "render" && "format" in options
        ? `result.${options.format}`
        : kind === "background" && "outputPath" in options
          ? `result${extname(options.outputPath)}`
          : kind === "probe"
            ? "result.json"
            : "result.image";
    let backgroundOptions = {};
    if ("inputPath" in options) {
      const input = relative(options.project.dir, options.inputPath);
      if (input.startsWith("..") || isAbsolute(input)) throw new Error("Input outside project");
      backgroundOptions = {
        inputPath: `/job/project/${input}`,
        backgroundOutputPath: options.backgroundOutputPath
          ? `/job/background${extname(options.backgroundOutputPath)}`
          : undefined,
      };
    }
    await writeFile(
      join(directory, "request.json"),
      JSON.stringify({
        kind,
        options: {
          ...options,
          signal: undefined,
          project: { id: options.project.id, dir: "/job/project" },
          outputPath: `/job/${output}`,
          telemetryOptOut: true,
          ...backgroundOptions,
        },
      }),
    );
    await new Promise<void>((resolve, reject) => {
      const child = spawn(
        "/usr/bin/prlimit",
        [
          "--fsize=1073741824",
          "--nofile=4096",
          "--cpu=600",
          "--",
          "/usr/bin/bwrap",
          ...sandboxArguments(directory!),
        ],
        {
          detached: true,
          stdio: ["ignore", "pipe", "pipe"],
          env: { PATH: "/usr/bin:/bin" },
        },
      );
      let error = "";
      let pending = "";
      child.stdout.on("data", (chunk: Buffer) => {
        pending = (pending + chunk.toString()).slice(-8192);
        const lines = pending.split("\n");
        pending = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("STUDIO_PROGRESS ")) continue;
          try {
            const update = JSON.parse(line.slice(16));
            if (typeof update.progress === "number" && Number.isFinite(update.progress)) {
              onProgress?.(
                Math.max(0, Math.min(99, update.progress)),
                typeof update.stage === "string" ? update.stage.slice(0, 200) : undefined,
              );
            }
          } catch {
            /* Ignore unrelated renderer output. */
          }
        }
      });
      child.stderr.on("data", (chunk: Buffer) => {
        error = (error + chunk.toString()).slice(-8000);
      });
      const kill = () => {
        if (child.pid) {
          try {
            process.kill(-child.pid, "SIGKILL");
          } catch {}
        }
      };
      const timer = setTimeout(kill, kind === "thumbnail" || kind === "probe" ? 60000 : 600000);
      signal.addEventListener("abort", kill, { once: true });
      if (signal.aborted) kill();
      child.on("error", reject);
      child.on("close", (code) => {
        clearTimeout(timer);
        signal.removeEventListener("abort", kill);
        if (code === 0 && !signal.aborted) resolve();
        else
          reject(
            new Error(
              signal.aborted ? "Cancelled" : `Isolated Studio job failed: ${error || code}`,
            ),
          );
      });
    });
    return {
      main: await readOutput(join(directory, output)),
      background:
        "backgroundOutputPath" in options && options.backgroundOutputPath
          ? await readOutput(join(directory, `background${extname(options.backgroundOutputPath)}`))
          : undefined,
    };
  } finally {
    try {
      if (directory) await rm(directory, { recursive: true, force: true });
    } finally {
      activeJobs--;
    }
  }
}

export async function sandboxProbeAudio(project: ProbeOptions["project"]): Promise<boolean> {
  const result = await runJob("probe", { project }, new AbortController().signal);
  const metadata: unknown = JSON.parse(result.main.toString());
  if (
    !metadata ||
    typeof metadata !== "object" ||
    !("hasAudio" in metadata) ||
    typeof metadata.hasAudio !== "boolean"
  )
    throw new Error("Invalid media probe result");
  return metadata.hasAudio;
}

export function startSandboxRender(options: RenderOptions): RenderJobState {
  const startedAt = Date.now();
  const controller = new AbortController();
  const state: RenderJobState = {
    id: options.jobId,
    status: "rendering",
    progress: 0,
    outputPath: options.outputPath,
    cancel: () => controller.abort(),
  };
  void (async () => {
    try {
      const result = await runJob("render", options, controller.signal, (progress, stage) => {
        state.progress = progress;
        state.stage = stage;
      });
      if (controller.signal.aborted) {
        state.status = "cancelled";
        return;
      }
      await mkdir(join(options.project.dir, "renders"), { recursive: true });
      await writeFile(options.outputPath, result.main);
      await writeFile(
        options.outputPath.replace(/\.(mp4|webm|mov)$/, ".meta.json"),
        JSON.stringify({ status: "complete", durationMs: Date.now() - startedAt }),
      );
      if (controller.signal.aborted) {
        await rm(options.outputPath, { force: true });
        await rm(options.outputPath.replace(/\.(mp4|webm|mov)$/, ".meta.json"), { force: true });
        state.status = "cancelled";
        return;
      }
      state.status = "complete";
      state.progress = 100;
    } catch (error) {
      state.status = controller.signal.aborted ? "cancelled" : "failed";
      state.error = error instanceof Error ? error.message : String(error);
    }
  })();
  return state;
}

export async function sandboxThumbnail(options: ThumbnailOptions): Promise<Buffer> {
  return (await runJob("thumbnail", options, options.signal)).main;
}

export function startSandboxBackgroundRemoval(options: BackgroundOptions): MediaProcessingJobState {
  const state: MediaProcessingJobState = {
    id: options.jobId,
    status: "processing",
    progress: 0,
    inputAssetPath: options.inputAssetPath,
    outputAssetPath: options.outputAssetPath,
    outputPath: options.outputPath,
    backgroundOutputPath: options.backgroundOutputPath,
    backgroundOutputAssetPath: options.backgroundOutputAssetPath,
  };
  void (async () => {
    try {
      const result = await runJob(
        "background",
        options,
        new AbortController().signal,
        (progress, stage) => {
          state.progress = progress;
          state.stage = stage;
        },
      );
      await mkdir(dirname(options.outputPath), { recursive: true });
      await writeFile(options.outputPath, result.main);
      if (options.backgroundOutputPath && result.background)
        await writeFile(options.backgroundOutputPath, result.background);
      state.status = "complete";
      state.progress = 100;
    } catch (error) {
      state.status = "failed";
      state.error = error instanceof Error ? error.message : String(error);
    }
  })();
  return state;
}
