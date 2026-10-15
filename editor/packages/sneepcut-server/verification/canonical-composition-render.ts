import { mkdir, mkdtemp, writeFile, readFile, rm, cp, rename } from "node:fs/promises";
import { resolve, join } from "node:path";
import {
  compileCanonicalComposition,
  type CanonicalCompositionPlan,
} from "../src/canonical-composition";
import { bundledGsap } from "../src/assets";
import { findSystemChrome } from "../src/browser";
import { createRenderJob, executeRenderJob } from "@hyperframes/producer";
import { lintHyperframeHtml } from "@hyperframes/lint";
import { derivedCompositionHTML } from "../src/composition-service";

const repository = resolve(import.meta.dir, "../../../..");
const scratchRoot = join(repository, ".cache/tmp");
await mkdir(scratchRoot, { recursive: true });
const scratch = await mkdtemp(join(scratchRoot, "canonical-render-"));
const ffmpeg = process.env.HYPERFRAMES_FFMPEG_PATH ?? "ffmpeg";
const ffprobe = process.env.HYPERFRAMES_FFPROBE_PATH ?? "ffprobe";
async function command(executable: string, args: string[]) {
  const child = Bun.spawn([executable, ...args], { stdout: "pipe", stderr: "pipe" });
  const [out, err] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  if (await child.exited) throw new Error(err);
  return out;
}
async function render(project: string, output: string, hdrMode: "force-sdr" | "force-hdr") {
  await executeRenderJob(
    createRenderJob({ fps: 30, quality: "draft", format: "mp4", hdrMode, workers: 1 }),
    project,
    output,
  );
  return JSON.parse(
    await command(ffprobe, ["-v", "error", "-show_streams", "-show_format", "-of", "json", output]),
  );
}
async function pixel(output: string, time: number, name: string) {
  const path = join(scratch, `${name}.rgb`);
  await command(ffmpeg, [
    "-v",
    "error",
    "-ss",
    String(time),
    "-i",
    output,
    "-vf",
    "crop=2:2:160:60,scale=1:1",
    "-frames:v",
    "1",
    "-pix_fmt",
    "rgb24",
    "-f",
    "rawvideo",
    path,
  ]);
  return [...(await readFile(path))];
}
async function verifyAudio(output: string, name: string) {
  const path = join(scratch, `${name}.pcm`);
  await command(ffmpeg, [
    "-v",
    "error",
    "-i",
    output,
    "-vn",
    "-ac",
    "1",
    "-ar",
    "48000",
    "-f",
    "f32le",
    path,
  ]);
  const buffer = await readFile(path);
  const samples = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  let energy = 0,
    crossings = 0,
    previous = 0;
  for (let at = 0; at < samples.byteLength; at += 4) {
    const value = samples.getFloat32(at, true);
    energy += value * value;
    if (previous <= 0 && value > 0) crossings++;
    previous = value;
  }
  const count = samples.byteLength / 4,
    rms = Math.sqrt(energy / count),
    frequency = (crossings * 48000) / count;
  if (rms < 0.04 || Math.abs(frequency - 440) > 8)
    throw new Error(`Audio changed: RMS ${rms}, frequency ${frequency}`);
}
async function windowRms(output: string, start: number, name: string) {
  const path = join(scratch, `${name}.pcm`);
  await command(ffmpeg, [
    "-v",
    "error",
    "-ss",
    String(start),
    "-i",
    output,
    "-t",
    "0.1",
    "-vn",
    "-ac",
    "1",
    "-ar",
    "48000",
    "-f",
    "f32le",
    path,
  ]);
  const buffer = await readFile(path);
  const samples = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  let power = 0;
  for (let i = 0; i < samples.byteLength; i += 4) power += samples.getFloat32(i, true) ** 2;
  return Math.sqrt(power / (samples.byteLength / 4));
}
try {
  const project = join(scratch, "project");
  await mkdir(join(project, "assets"), { recursive: true });
  await mkdir(join(project, "vendor"));
  await command(ffmpeg, [
    "-v",
    "error",
    "-f",
    "lavfi",
    "-i",
    "color=red:s=640x360:r=30:d=4,drawbox=x=320:y=0:w=320:h=360:color=blue:t=fill",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=440:sample_rate=48000:duration=4",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-shortest",
    join(project, "assets/camera.mp4"),
  ]);
  const plan: CanonicalCompositionPlan = {
    schema_version: 1,
    title: "Canonical render verification",
    width: 320,
    height: 180,
    duration: 2,
    dynamic_range: "sdr",
    assets: [
      {
        id: "camera",
        name: "Synthetic original",
        kind: "video",
        url: "/media/camera.mp4",
        duration: 4,
        width: 640,
        height: 360,
        has_audio: true,
      },
    ],
    scenes: [
      {
        id: "red",
        asset_id: "camera",
        start: 0,
        duration: 1,
        source_in: 0,
        crop: { x: 0, y: 90, width: 320, height: 180 },
        fade_out: 0.08,
      },
      {
        id: "blue",
        asset_id: "camera",
        start: 1,
        duration: 1,
        source_in: 1,
        crop: { x: 320, y: 90, width: 320, height: 180 },
        fade_in: 0.08,
      },
    ],
    audio: [
      {
        id: "voice",
        asset_id: "camera",
        start: 0,
        duration: 2,
        source_in: 0,
        volume: 1,
        envelope: [
          { time: 0, value: 0.4 },
          { time: 2, value: 1 },
        ],
      },
    ],
    captions: {
      groups: [
        [{ text: "First", start: 0.2, end: 0.7 }],
        [{ text: "Second", start: 1.2, end: 1.7 }],
      ],
      style: { preset: "classic", size: 0.1, outline: 2 },
    },
    overlays: [
      {
        id: "brand",
        text: "SC",
        start: 0,
        duration: 2,
        x: 8,
        y: 8,
        width: 50,
        height: 25,
        font_size: 16,
        color: "#ffffff",
      },
    ],
  };
  await command(ffmpeg, [
    "-v",
    "error",
    "-f",
    "lavfi",
    "-i",
    "color=green:s=320x180:r=30:d=0.2",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    join(project, "assets/bridge.mp4"),
  ]);
  plan.assets.push({
    id: "bridge",
    name: "Prepared transition picture",
    kind: "video",
    url: "/media/bridge.mp4",
    duration: 0.2,
    width: 320,
    height: 180,
  });
  plan.scenes.push({
    id: "bridge-part",
    asset_id: "bridge",
    role: "bridge",
    parent_scene_id: "red",
    start: 0.6,
    duration: 0.1,
    source_in: 0,
  });
  const composition = compileCanonicalComposition(
    plan,
    new Map([
      ["camera", "assets/camera.mp4"],
      ["bridge", "assets/bridge.mp4"],
    ]),
  );
  for (const [name, source] of composition.files) await writeFile(join(project, name), source);
  const gsap = bundledGsap("gsap.min.js");
  if (!gsap) throw new Error("GSAP is unavailable");
  await writeFile(join(project, "vendor/gsap.min.js"), gsap);
  const findings = await lintHyperframeHtml(composition.html);
  console.log("Canonical lint:", JSON.stringify(findings));
  if (!findings.ok) throw new Error("Generated composition failed lint");
  process.env.PRODUCER_HEADLESS_SHELL_PATH ??= findSystemChrome();
  const output = join(scratch, "output.mp4");
  const probe = await render(project, output, "force-sdr");
  const video = probe.streams.find(
    (stream: { codec_type: string }) => stream.codec_type === "video",
  );
  if (
    video.width !== 320 ||
    video.height !== 180 ||
    Math.abs(Number(probe.format.duration) - 2) > 0.1 ||
    !probe.streams.some((stream: { codec_type: string }) => stream.codec_type === "audio")
  )
    throw new Error("Output dimensions, duration or audio are incorrect");
  for (const [time, dominant] of [
    [0.4, 0],
    [1.4, 2],
  ] as const) {
    const pixel = join(scratch, `pixel-${time}.rgb`);
    await command(ffmpeg, [
      "-v",
      "error",
      "-ss",
      String(time),
      "-i",
      output,
      "-vf",
      "crop=2:2:160:60,scale=1:1",
      "-frames:v",
      "1",
      "-pix_fmt",
      "rgb24",
      "-f",
      "rawvideo",
      pixel,
    ]);
    const rgb = await readFile(pixel);
    if (rgb[dominant]! < 180 || rgb[dominant === 0 ? 2 : 0]! > 50)
      throw new Error(`Wrong source crop at ${time}: ${[...rgb]}`);
  }
  console.log(
    JSON.stringify({
      verified: true,
      duration: probe.format.duration,
      width: video.width,
      height: video.height,
      audio: true,
      crops: ["red", "blue"],
    }),
  );
  await verifyAudio(output, "original-audio");
  const bridgePixel = await pixel(output, 0.65, "bridge-picture");
  if (bridgePixel[1]! < 90 || bridgePixel[0]! > 50)
    throw new Error(`Prepared transition picture was not composited: ${bridgePixel}`);
  const fade = await pixel(output, 0.966667, "fade");
  if (fade[0]! >= 180) throw new Error(`Story dip-to-black was lost: ${fade}`);

  // Derive from the exact saved HTML, with every layer and nested source clock intact.
  const derived = join(scratch, "derived");
  await cp(project, derived, { recursive: true });
  await rename(join(derived, "index.html"), join(derived, "original-composition.html"));
  await writeFile(
    join(derived, "index.html"),
    derivedCompositionHTML({ width: 320, height: 180, duration: 2 }, 0.75, 1.75),
  );
  const derivedOutput = join(scratch, "derived.mp4");
  const derivedProbe = await render(derived, derivedOutput, "force-sdr");
  if (Math.abs(Number(derivedProbe.format.duration) - 1) > 0.1)
    throw new Error("Derived window has wrong duration");
  const before = await pixel(derivedOutput, 0.1, "derived-red"),
    after = await pixel(derivedOutput, 0.6, "derived-blue");
  if (before[0]! < 180 || after[2]! < 180)
    throw new Error(`Derived source clocks changed: ${before}; ${after}`);
  await verifyAudio(derivedOutput, "derived-audio");
  for (const time of [0.1, 0.6]) {
    const originalGain = await windowRms(output, 0.75 + time, `original-gain-${time}`);
    const derivedGain = await windowRms(derivedOutput, time, `derived-gain-${time}`);
    if (Math.abs(derivedGain / originalGain - 1) > 0.08)
      throw new Error(
        `Trim restarted audio automation at ${time}: ${originalGain} -> ${derivedGain}`,
      );
  }
  console.log(
    JSON.stringify({
      derived: true,
      duration: derivedProbe.format.duration,
      sourceWindow: [0.75, 1.75],
      audio: true,
      crops: ["red", "blue"],
    }),
  );

  // Native PQ source plus editable DOM graphics must remain 10-bit HDR, while
  // the separate browser preview is explicitly SDR from that same source.
  const hdrProject = join(scratch, "hdr");
  await mkdir(join(hdrProject, "assets"), { recursive: true });
  await mkdir(join(hdrProject, "vendor"));
  await writeFile(join(hdrProject, "vendor/gsap.min.js"), gsap);
  await command(ffmpeg, [
    "-v",
    "error",
    "-i",
    join(repository, "editor/packages/producer/tests/hdr-regression/src/hdr-clip.mp4"),
    "-t",
    "0.4",
    "-vf",
    "scale=320:180",
    "-an",
    "-c:v",
    "libx265",
    "-preset",
    "ultrafast",
    "-pix_fmt",
    "yuv420p10le",
    "-color_primaries",
    "bt2020",
    "-color_trc",
    "smpte2084",
    "-colorspace",
    "bt2020nc",
    "-x265-params",
    "pools=1:log-level=error",
    join(hdrProject, "assets/original.mp4"),
  ]);
  await command(ffmpeg, [
    "-v",
    "error",
    "-f",
    "lavfi",
    "-i",
    "color=green:s=320x180:r=30:d=0.4",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    join(hdrProject, "assets/proxy.mp4"),
  ]);
  const hdrPlan: CanonicalCompositionPlan = {
    schema_version: 1,
    title: "HDR original",
    width: 320,
    height: 180,
    duration: 0.4,
    dynamic_range: "hdr",
    assets: [
      {
        id: "hdr",
        name: "PQ original",
        kind: "video",
        url: "/media/original.mp4",
        preview_url: "/media/proxy.mp4",
        duration: 0.4,
        width: 320,
        height: 180,
      },
    ],
    scenes: [{ id: "native", asset_id: "hdr", start: 0, duration: 0.4, source_in: 0 }],
    audio: [],
    overlays: [
      {
        id: "hdr-brand",
        text: "HDR",
        start: 0,
        duration: 0.4,
        x: 10,
        y: 10,
        width: 100,
        height: 30,
        font_size: 22,
      },
    ],
  };
  const hdrComposition = compileCanonicalComposition(
    hdrPlan,
    new Map([["hdr", { path: "assets/original.mp4", previewPath: "assets/proxy.mp4" }]]),
  );
  for (const [name, source] of hdrComposition.files)
    await writeFile(join(hdrProject, name), source);
  const hdrOutput = join(scratch, "hdr.mp4");
  const hdrProbe = await render(hdrProject, hdrOutput, "force-hdr");
  const hdrVideo = hdrProbe.streams.find(
    (stream: { codec_type: string }) => stream.codec_type === "video",
  );
  if (
    hdrVideo.codec_name !== "hevc" ||
    hdrVideo.pix_fmt !== "yuv420p10le" ||
    hdrVideo.color_transfer !== "smpte2084" ||
    hdrVideo.color_primaries !== "bt2020"
  )
    throw new Error(`HDR was downgraded: ${JSON.stringify(hdrVideo)}`);
  const previewOutput = join(scratch, "hdr-preview.mp4");
  const previewProbe = await render(hdrProject, previewOutput, "force-sdr");
  const previewVideo = previewProbe.streams.find(
    (stream: { codec_type: string }) => stream.codec_type === "video",
  );
  if (previewVideo.codec_name !== "h264" || previewVideo.pix_fmt !== "yuv420p")
    throw new Error("HDR preview is not browser-compatible SDR");
  console.log(
    JSON.stringify({
      hdr: true,
      codec: hdrVideo.codec_name,
      format: hdrVideo.pix_fmt,
      transfer: hdrVideo.color_transfer,
      preview: previewVideo.codec_name,
    }),
  );
} finally {
  await rm(scratch, { recursive: true, force: true });
}
