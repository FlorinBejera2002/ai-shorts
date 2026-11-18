import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseEnv } from "node:util";
import { localS3Settings, updateEnvironment } from "./enable-local-s3.mjs";

const repository = fileURLToPath(new URL("../", import.meta.url));
export async function enableLocalStudioS3(root = repository) {
  const filename = path.join(root, ".env");
  const previous = await readFile(filename, "utf8");
  const settings = { ...parseEnv(previous), ...process.env };
  const { values } = localS3Settings(settings);
  if (settings.STORAGE_TYPE !== "s3") throw new Error("Run make media-s3-up first");
  const endpoint = values.SNEEPCUT_MEDIA_S3_INTERNAL_ORIGIN;
  if (settings.SNEEPCUT_STUDIO_S3_ENDPOINT && settings.SNEEPCUT_STUDIO_S3_ENDPOINT !== endpoint)
    throw new Error("Existing Studio endpoint differs from local SeaweedFS");
  const configured = {
    SNEEPCUT_STUDIO_STORAGE: "s3",
    SNEEPCUT_STUDIO_S3_ENDPOINT: endpoint,
    SNEEPCUT_STUDIO_S3_PREFIX: settings.SNEEPCUT_STUDIO_S3_PREFIX || "studio/v1",
  };
  const compose = ["compose", "-f", "docker-compose.yml", "-f", "docker-compose.dev.yml"];
  const docker = (args) =>
    execFileSync("docker", [...compose, ...args], { cwd: root, stdio: "inherit" });
  await mkdir(path.join(root, ".cache/tmp"), { recursive: true });
  const scratch = await mkdtemp(path.join(root, ".cache/tmp/studio-s3-enable-"));
  let stopped = false;
  try {
    docker(["stop", "studio"]);
    stopped = true;
    if (settings.SNEEPCUT_STUDIO_STORAGE !== "s3") {
      docker([
        "run",
        "--rm",
        "--no-deps",
        "-e",
        "SNEEPCUT_STUDIO_STORAGE=s3",
        "-e",
        `SNEEPCUT_STUDIO_S3_ENDPOINT=${endpoint}`,
        "studio",
        "bun",
        "packages/sneepcut-server/src/migrate-state.ts",
      ]);
    }
    if ((await readFile(filename, "utf8")) !== previous)
      throw new Error(".env changed during Studio migration; review before retrying");
    const temporary = path.join(scratch, "environment");
    await writeFile(temporary, updateEnvironment(previous, configured), { mode: 0o600 });
    await rename(temporary, filename);
  } finally {
    try {
      if (stopped) docker(["up", "-d", "--wait", "--no-build", "studio"]);
    } finally {
      await rm(scratch, { recursive: true, force: true });
    }
  }
  console.log(
    "Local Studio state uses private S3; legacy originals are retained and working copies are disposable.",
  );
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  await enableLocalStudioS3();
