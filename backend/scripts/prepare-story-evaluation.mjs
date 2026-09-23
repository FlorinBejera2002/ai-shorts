#!/usr/bin/env node
// Publicly licensed source acquisition and reproducible derived evaluation clips.
// Run from any directory; all outputs remain under the repository's .cache.
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const outputRoot = join(repository, '.cache', 'story-evaluation');
const maximumDownloadBytes = 100 * 1024 * 1024;
const creatorSource = process.argv.includes('--creator-source');
const sources = [
  {
    id: 'ro-raluca', language: 'ro', title: 'WIKITONGUES: Raluca speaking Romanian',
    author: 'Wikitongues; recording by Nick Panzarella',
    page: 'https://commons.wikimedia.org/wiki/File:WIKITONGUES-_Raluca_speaking_Romanian.webm',
    originalPublication: 'https://www.youtube.com/watch?v=6TiSKGRjYLs',
    download: 'https://upload.wikimedia.org/wikipedia/commons/a/a8/WIKITONGUES-_Raluca_speaking_Romanian.webm',
    license: 'CC BY-SA 4.0', licenseURL: 'https://creativecommons.org/licenses/by-sa/4.0/',
    originalName: 'ro-raluca.webm', totalWindow: 92,
  },
  {
    id: 'en-jane-goodall', language: 'en', title: 'Jane Goodall, The Green Interview',
    author: 'The Green Interview',
    page: 'https://commons.wikimedia.org/wiki/File:Jane_Goodall,_The_Green_Interview.webm',
    originalPublication: 'https://www.youtube.com/watch?v=AOHoAi6qN14',
    download: 'https://upload.wikimedia.org/wikipedia/commons/6/6c/Jane_Goodall%2C_The_Green_Interview.webm',
    license: 'CC BY 3.0', licenseURL: 'https://creativecommons.org/licenses/by/3.0/',
    originalName: 'en-jane-goodall.webm', totalWindow: 160,
  },
];

function localPath(...parts) {
  const path = resolve(outputRoot, ...parts);
  if (!path.startsWith(outputRoot + sep)) throw new Error('Evaluation output escaped its cache directory');
  return path;
}

async function exists(path) {
  try { return (await stat(path)).isFile(); } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

async function run(binary, args, timeout = 180_000, options = {}) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(binary, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], shell: false, ...options });
    let stdout = '', stderr = '';
    const timer = setTimeout(() => { child.kill(); reject(new Error(`Command timed out: ${binary}`)); }, timeout);
    child.stdout.on('data', chunk => { if (stdout.length < 2_000_000) stdout += chunk; });
    child.stderr.on('data', chunk => { if (stderr.length < 16_000) stderr += chunk; });
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('close', code => {
      clearTimeout(timer);
      if (code !== 0) reject(new Error(`${binary} failed (${code}): ${stderr}`));
      else resolveRun(stdout);
    });
  });
}

async function locate(name, override) {
  const extension = process.platform === 'win32' ? '.exe' : '';
  const candidates = [override, join(repository, '.cache/toolchains/ffmpeg/ffmpeg-9.0.2-essentials_build/bin', name + extension), name];
  for (const candidate of candidates.filter(Boolean)) {
    try { await run(candidate, ['-version'], 10_000); return candidate; } catch { /* Try the next configured tool. */ }
  }
  throw new Error(`${name} is required. Put it on PATH or set ${name.toUpperCase()}_PATH.`);
}

async function checksum(path) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}

async function download(source, destination) {
  if (await exists(destination)) return { reused: true };
  const response = await fetch(source.download, {
    signal: AbortSignal.timeout(180_000),
    headers: { 'User-Agent': 'SneepCutStoryEvaluation/1.0 (licensed local software evaluation)' },
  });
  if (response.status === 429) {
    await response.body?.cancel();
    throw new Error(`Wikimedia rate limit; no retry attempted. Retry later or place the licensed original at ${destination}.`);
  }
  if (!response.ok) { await response.body?.cancel(); throw new Error(`Source download returned HTTP ${response.status}`); }
  const declared = Number(response.headers.get('content-length') ?? 0);
  if (declared > maximumDownloadBytes) { await response.body?.cancel(); throw new Error('Source exceeds the 100 MiB acquisition limit'); }
  if (!response.body) throw new Error('Source download has no body');
  let received = 0;
  const limited = new Transform({ transform(chunk, _encoding, done) {
    received += chunk.length;
    done(received > maximumDownloadBytes ? new Error('Source exceeded 100 MiB while streaming') : null, chunk);
  } });
  const partial = destination + `.partial-${randomUUID()}`;
  await pipeline(Readable.fromWeb(response.body), limited, createWriteStream(partial, { flags: 'wx' }));
  await rename(partial, destination);
  return { reused: false };
}

async function acquireCreator(source, destination) {
  if (await exists(destination)) return { reused: true, source_url: source.originalPublication };
  const portable = join(repository, '.cache/toolchains/go/bin', process.platform === 'win32' ? 'go.exe' : 'go');
  const go = process.env.GO_PATH || (await exists(portable) ? portable : 'go');
  const raw = await run(go, ['run', './scripts/download-story-evaluation.go', source.id, destination], 240_000, {
    cwd: join(repository, 'backend'),
    env: { ...process.env, GOCACHE: process.env.GOCACHE || join(repository, '.cache/go-build'), GOMODCACHE: process.env.GOMODCACHE || join(repository, '.cache/go-mod') },
  });
  return JSON.parse(raw);
}

async function probe(ffprobe, path) {
  const info = JSON.parse(await run(ffprobe, ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', path]));
  if (!info.streams.some(stream => stream.codec_type === 'video') || !info.streams.some(stream => stream.codec_type === 'audio')) {
    throw new Error('Evaluation source must contain both real video and audio');
  }
  return info;
}

function clipIntervals(source, count) {
  const span = source.totalWindow / count;
  return Array.from({ length: count }, (_, index) => ({
    start: Math.max(0, Number((index * span - 1.5).toFixed(3))),
    end: Math.min(source.totalWindow, Number(((index + 1) * span + 1.5).toFixed(3))),
  }));
}

async function prepare(source, count, original, originalHash, ffmpeg, ffprobe) {
  const directory = localPath(`${source.language}-${count}`);
  await mkdir(directory, { recursive: true });
  const manifestPath = join(directory, 'manifest.json');
  if (await exists(manifestPath)) {
    const previous = JSON.parse(await readFile(manifestPath, 'utf8'));
    if (previous.original_sha256 && previous.original_sha256 !== originalHash) {
      throw new Error(`Existing ${source.language}-${count} excerpts belong to a different source download; retained without overwrite.`);
    }
  }
  const chronological = [];
  for (const [index, interval] of clipIntervals(source, count).entries()) {
    const filename = `clip-${String(index + 1).padStart(2, '0')}.mp4`;
    const path = join(directory, filename);
    if (!(await exists(path))) {
      await run(ffmpeg, ['-nostdin', '-v', 'error', '-n', '-ss', String(interval.start), '-i', original,
        '-t', String(Number((interval.end - interval.start).toFixed(3))), '-map', '0:v:0', '-map', '0:a:0',
        '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2,setsar=1', '-c:v', 'libx264', '-preset', 'veryfast',
        '-crf', '20', '-pix_fmt', 'yuv420p', '-r', '30', '-c:a', 'aac', '-ar', '48000', '-b:a', '128k',
        '-map_metadata', '-1', '-metadata', `comment=Derived excerpt: ${source.author}; ${source.license}; ${source.page}`,
        '-movflags', '+faststart', path]);
    }
    const info = await probe(ffprobe, path);
    await run(ffmpeg, ['-nostdin', '-v', 'error', '-i', path, '-map', '0:v:0', '-map', '0:a:0', '-f', 'null', '-']);
    chronological.push({ file: filename, original_start: interval.start, original_end: interval.end,
      duration: Number(info.format.duration), sha256: await checksum(path), modification: 'Bounded overlapping excerpt; H.264/AAC 30fps transcode. Original speech preserved; no generated words.' });
  }
  // Deterministic nonchronological selection exercises global source ordering.
  const order = count === 5 ? [3, 0, 4, 1, 2] : [6, 1, 8, 0, 4, 9, 2, 7, 3, 5];
  const manifest = { source_id: source.id, source_page: source.page, source_license: source.license,
    source_author: source.author, source_license_url: source.licenseURL, language: source.language,
    original_sha256: originalHash, acquired_from: creatorSource ? source.originalPublication : source.download,
    source_kind: 'Overlapping excerpts of ONE real public recording; not independent phone takes.',
    human_editorial_approval: false, upload_order: order.map(index => chronological[index].file), clips: chronological };
  await writeFile(join(directory, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  return { directory, clip_count: count, upload_order: manifest.upload_order };
}

await mkdir(localPath('originals'), { recursive: true });
const ffmpeg = await locate('ffmpeg', process.env.FFMPEG_PATH);
const ffprobe = await locate('ffprobe', process.env.FFPROBE_PATH);
const results = [];
for (const source of sources) {
  try {
    const original = localPath('originals', creatorSource ? `${source.id}-youtube.mp4` : source.originalName);
    const acquisition = creatorSource ? await acquireCreator(source, original) : await download(source, original);
    const info = await probe(ffprobe, original);
    if (Number(info.format.duration) < source.totalWindow) throw new Error('Original is shorter than the documented evaluation window');
    await run(ffmpeg, ['-nostdin', '-v', 'error', '-i', original, '-map', '0:v:0', '-map', '0:a:0', '-f', 'null', '-']);
    const originalHash = await checksum(original);
    const datasets = [];
    for (const count of [5, 10]) datasets.push(await prepare(source, count, original, originalHash, ffmpeg, ffprobe));
    results.push({ ...source, acquisition, original_path: original, acquired_from: creatorSource ? source.originalPublication : source.download, original_sha256: originalHash, original_duration: Number(info.format.duration), datasets, status: 'prepared' });
    console.log(`${source.id}: prepared 5-clip and 10-clip datasets.`);
  } catch (error) {
    results.push({ ...source, status: 'blocked', error: error.message });
    console.error(`${source.id}: ${error.message}`);
  }
}
await writeFile(localPath('acquisition.json'), JSON.stringify({ prepared_at: new Date().toISOString(), sources: results }, null, 2) + '\n');
if (results.some(result => result.status !== 'prepared')) process.exitCode = 1;
