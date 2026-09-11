import puppeteer from "puppeteer-core";
import { fileURLToPath } from "node:url";
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { findSystemChrome } from "../src/browser";

const productionFixtureOrigin = process.env.STUDIO_VERIFICATION_ORIGIN;
if (productionFixtureOrigin) {
  const url = new URL(productionFixtureOrigin);
  if (url.protocol !== "http:" || !["localhost", "127.0.0.1"].includes(url.hostname))
    throw new Error("Production-image verification requires a disposable loopback HTTP instance");
}
const outputDirectory = resolve(
  process.env.STUDIO_VERIFICATION_OUTPUT ??
    (productionFixtureOrigin ? "/tmp/studio-verification" : fileURLToPath(new URL("./", import.meta.url))),
);
await mkdir(outputDirectory, { recursive: true });
const executablePath = findSystemChrome();
if (!executablePath) throw new Error("No system Chromium browser available");
const browser = await puppeteer.launch({
  executablePath,
  headless: true,
  // Only the trusted disposable browser fixture can opt out. Production render
  // isolation and Chromium launch settings are unchanged.
  args: ["--disable-dev-shm-usage", ...(productionFixtureOrigin ? ["--no-sandbox"] : [])],
});
const page = await browser.newPage();
let activeJob: string | null = null;
try {
  await page.setViewport({ width: 1440, height: 1000 });
  const errors: string[] = [];
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => {
    pageErrors.push(String(error));
    errors.push(String(error));
  });
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("response", (response) => {
    if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`);
  });
  page.on("requestfailed", (request) => {
    // Closing or replacing a view intentionally aborts its long-lived SSE stream.
    if (request.failure()?.errorText === "net::ERR_ABORTED") return;
    errors.push(`${request.failure()?.errorText} ${request.url()}`);
  });
  await page.goto(productionFixtureOrigin ? `${productionFixtureOrigin}/health` : "http://localhost:5193/bootstrap", {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  if (productionFixtureOrigin) {
    const projectId = await page.evaluate(async () => {
      const session = await fetch("/sneepcut/session", {
        method: "POST",
        headers: { Authorization: "Bearer synthetic-fixture" },
      });
      if (!session.ok) throw new Error(`Synthetic session failed: ${session.status}`);
      const created = await fetch("/sneepcut/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Disposable production-image verification" }),
      });
      if (created.status !== 201) throw new Error(`Synthetic project failed: ${created.status}`);
      return (await created.json()).project.id as string;
    });
    // Leave the public health document after establishing the authenticated session.
    await page.goto(`${productionFixtureOrigin}/?verification=1#project/${projectId}`, {
      waitUntil: "domcontentloaded",
    });
  }
  // Studio keeps SSE channels open; readiness is asserted below even when these prevent idle.
  await page.waitForNetworkIdle({ concurrency: 2, idleTime: 500, timeout: 20000 }).catch(() => {
    console.log(JSON.stringify({ phase: "network-remains-active", errors }));
  });
  await page.waitForSelector("button", { timeout: 30000 });
  console.log(
    JSON.stringify({
      phase: "inspect",
      url: page.url(),
      title: await page.title(),
      errors,
      ui: await page.evaluate(() => ({
        text: document.body.innerText.slice(0, 6000),
        buttons: Array.from(document.querySelectorAll("button")).map((b) => ({
          text: b.innerText,
          title: b.title,
          aria: b.getAttribute("aria-label"),
        })),
        frames: Array.from(document.querySelectorAll("iframe")).map((f) => ({
          src: f.src,
          title: f.title,
        })),
      })),
    }),
  );
  const preview = await page.waitForFrame((frame) => frame.url().includes("/preview?"), {
    timeout: 60000,
  });
  await preview.waitForSelector("#headline");
  await page.waitForFunction(() => document.body.innerText.includes("00:06"), { timeout: 60000 });
  console.log(
    JSON.stringify({
      phase: "loaded",
      errors,
      text: await page.evaluate(() => document.body.innerText.slice(0, 3000)),
      frames: page.frames().map((frame) => frame.url()),
    }),
  );
  await page.click('button[aria-label="Play"]');
  await page.waitForSelector('button[aria-label="Pause"]');
  await page.waitForFunction(() => /00:01\s*\/\s*00:06/.test(document.body.innerText), {
    timeout: 15000,
  });
  await page.click('button[aria-label="Pause"]');
  const screenshot = join(outputDirectory, "studio-verification.png");
  await page.screenshot({ path: screenshot, fullPage: true });
  console.log(JSON.stringify({ phase: "screenshot", path: screenshot }));
  console.log(
    JSON.stringify({
      phase: "play-pause",
      url: page.url(),
      headline: await preview.$eval("#headline", (element) => element.textContent),
      errors,
    }),
  );
  const projectId = new URL(page.url()).hash.match(/project\/([^?]+)/)?.[1];
  if (!projectId) throw new Error("No fixture project selected");
  const thumbnail = process.argv.includes("--skip-thumbnail")
    ? null
    : await page
        .evaluate(async (id) => {
          const response = await fetch(`/api/projects/${id}/thumbnail/index.html?t=1.00&v=verify`, {
            signal: AbortSignal.timeout(30000),
          });
          const bytes = await response.arrayBuffer();
          return {
            status: response.status,
            type: response.headers.get("content-type"),
            bytes: bytes.byteLength,
          };
        }, projectId)
        .catch((error: unknown) => ({ status: 0, type: null, bytes: 0, error: String(error) }));
  console.log(JSON.stringify({ phase: "thumbnail", thumbnail }));
  if (thumbnail && (thumbnail.status !== 200 || !thumbnail.type?.startsWith("image/") || thumbnail.bytes < 100))
    throw new Error(`Thumbnail failed: ${JSON.stringify(thumbnail)}`);
  const result = await page.evaluate(async (id) => {
    const path = `/api/projects/${id}/files/index.html`;
    const before = await fetch(path).then((response) => response.json());
    const changed = before.content.replace(
      "Your story. Your edit.",
      "Saved by browser verification.",
    );
    const write = await fetch(path, {
      method: "PUT",
      headers: { "Content-Type": "text/html", "If-Match": before.version },
      body: changed,
    });
    const saved = await fetch(path).then((response) => response.json());
    const render = await fetch(`/api/projects/${id}/render`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fps: 10, quality: "draft", format: "mp4", telemetryOptOut: true }),
    });
    return {
      writeStatus: write.status,
      persisted: saved.content.includes("Saved by browser verification."),
      renderStatus: render.status,
      render: await render.json(),
    };
  }, projectId);
  console.log(JSON.stringify({ phase: "saved-and-render", ...result }));
  if (result.writeStatus !== 200 || !result.persisted || result.renderStatus !== 200)
    throw new Error("Persistence or render request failed");
  activeJob = result.render.jobId;
  const progress = await page.evaluate(
    async (jobId) =>
      new Promise((resolve, reject) => {
        const stream = new EventSource(`/api/render/${jobId}/progress`);
        const timeout = setTimeout(() => {
          stream.close();
          reject(new Error("Render timed out after 150s"));
        }, 150000);
        stream.addEventListener("progress", (event) => {
          const state = JSON.parse(event.data);
          if (state.status !== "rendering") {
            clearTimeout(timeout);
            stream.close();
            resolve(state);
          }
        });
        stream.onerror = () => {
          clearTimeout(timeout);
          stream.close();
          reject(new Error("Render SSE failed"));
        };
      }),
    result.render.jobId,
  );
  console.log(JSON.stringify({ phase: "render-progress", progress, errors }));
  activeJob = null;
  if (
    !progress ||
    typeof progress !== "object" ||
    !("status" in progress) ||
    progress.status !== "complete"
  )
    throw new Error(`Render failed: ${JSON.stringify(progress)}`);
  const download = await page.evaluate(async (jobId) => {
    const response = await fetch(`/api/render/${jobId}/download`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    return {
      status: response.status,
      type: response.headers.get("Content-Type"),
      bytes: bytes.length,
      signature: new TextDecoder().decode(bytes.slice(4, 8)),
      data: Array.from(bytes),
    };
  }, result.render.jobId);
  const { data, ...downloadInfo } = download;
  console.log(JSON.stringify({ phase: "download", download: downloadInfo }));
  if (
    download.status !== 200 ||
    download.type !== "video/mp4" ||
    download.signature !== "ftyp" ||
    download.bytes < 1000
  )
    throw new Error("Export is not a valid MP4 download");
  const videoPath = join(outputDirectory, "studio-verification.mp4");
  await writeFile(videoPath, Uint8Array.from(data));
  console.log(JSON.stringify({ phase: "artifact", path: videoPath }));
  if (pageErrors.length) throw new Error(`Browser runtime errors: ${pageErrors.join("; ")}`);
} finally {
  if (activeJob)
    await page
      .evaluate(async (jobId) => {
        await fetch(`/api/render/${jobId}/cancel`, { method: "POST" });
      }, activeJob)
      .catch(() => {});
  const ownedProcess = browser.process();
  const deadline = setTimeout(() => ownedProcess?.kill(), 10000);
  try {
    await browser.close();
  } finally {
    clearTimeout(deadline);
  }
}
