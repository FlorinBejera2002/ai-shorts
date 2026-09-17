#!/usr/bin/env node
// Real HTTP regression: fresh Go API + repository Nginx + disposable data only.
// Run from any directory with Docker, Node 22+, and these local images:
// sneepcut-go-dev (fresh build --target dev backend-go), sneepcut-api (Pillow +
// Alembic), sneepcut-ml-dev (FFmpeg), postgres:16-alpine, redis:7-alpine,
// nginx:alpine. Uses --pull=never; no host Go/Python/FFmpeg is required.
//   node backend-go/scripts/test-publishing-media-integration.mjs
// Optional image overrides: SNEEPCUT_GO_TEST_IMAGE, SNEEPCUT_MIGRATION_IMAGE,
// SNEEPCUT_FFMPEG_TEST_IMAGE. Current schema is generated offline from this repo.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomUUID, createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const name = `sneepcut-publishing-http-test-${randomUUID().replaceAll('-', '').slice(0, 12)}`;
const directory = path.join(root, '.cache', name);
const schemaPath = path.join(directory, 'schema.sql');
const cache = path.join(root, '.cache', 'go-build-carousel');
const image = process.env.SNEEPCUT_GO_TEST_IMAGE || 'sneepcut-go-dev';
const migrationImage = process.env.SNEEPCUT_MIGRATION_IMAGE || 'sneepcut-api';
const ffmpegImage = process.env.SNEEPCUT_FFMPEG_TEST_IMAGE || 'sneepcut-ml-dev';
const database = 'sneepcut_integration_test';
const checks = [];
const resources = { containers: [], network: false, volume: false };
mkdirSync(directory, { recursive: true });
mkdirSync(cache, { recursive: true });

function docker(args, options = {}) {
  const result = spawnSync('docker', args, { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, timeout: 180_000, ...options });
  if (result.error || result.status !== 0) {
    throw new Error(`docker ${args[0]} failed: ${result.error?.message || result.stderr || result.stdout}`);
  }
  return result.stdout.trim();
}
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const digest = (buffer) => createHash('sha256').update(buffer).digest('hex');
function pass(message) {
  checks.push(message);
  console.log(`PASS: ${message}`);
}
async function freePort() {
  const server = createServer();
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const port = server.address().port;
  await new Promise((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
  return port;
}
function start(suffix, args) {
  const container = `${name}-${suffix}`;
  resources.containers.push(container);
  return docker(['run', '--pull=never', '-d', '--name', container, '--network', name, ...args]);
}
function sql(statement) {
  return docker(['exec', '-i', `${name}-postgres`, 'psql', '-h', '127.0.0.1', '-v', 'ON_ERROR_STOP=1', '-U', 'test', '-d', database], { input: statement });
}
function cleanup() {
  for (const container of [...resources.containers].reverse()) {
    assert(container.startsWith(`${name}-`));
    spawnSync('docker', ['rm', '-f', container], { encoding: 'utf8', timeout: 30_000 });
  }
  if (resources.volume) docker(['volume', 'rm', `${name}-media`]);
  if (resources.network) docker(['network', 'rm', name]);
}

let base;
let token;
let outcome = 'failed';
async function request(route, { method = 'GET', body, expected = 200, authenticated = true, headers = {} } = {}) {
  const response = await fetch(`${base}${route}`, {
    method, headers: { Origin: base, ...(authenticated && token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body && !(body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}), ...headers },
    body: body && !(body instanceof FormData) ? JSON.stringify(body) : body,
    signal: AbortSignal.timeout(30_000),
  });
  const raw = await response.text();
  assert.equal(response.status, expected, `${method} ${route}: ${response.status} ${raw.slice(0, 800)}`);
  return raw ? JSON.parse(raw) : null;
}
async function upload(filename, contentType) {
  const bytes = readFileSync(path.join(directory, filename));
  const form = new FormData();
  form.set('file', new Blob([bytes], { type: contentType }), filename);
  const result = await request('/api/publishing/media', { method: 'POST', body: form, expected: 201 });
  assert.equal(result.name, filename);
  assert.equal(result.size, bytes.length);
  assert.match(result.reference, /^publishing\/[0-9a-f-]+\/[a-zA-Z0-9_.-]+$/);
  return { ...result, bytes };
}
async function verifyPreview(media, contentType) {
  const result = await request(`/api/publishing/media/preview?reference=${encodeURIComponent(media.reference)}`);
  assert.equal(new URL(result.url).origin, base);
  const response = await fetch(result.url, { signal: AbortSignal.timeout(15_000) });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), contentType);
  const downloaded = Buffer.from(await response.arrayBuffer());
  assert.equal(digest(downloaded), digest(media.bytes), `${media.name}: original bytes changed`);
  assert.equal((await fetch(result.url.split('?')[0])).status, 403, 'unsigned preview accepted');
  return { name: media.name, reference: media.reference, size: media.size, sha256: digest(downloaded) };
}

try {
  const schema = docker(['run', '--rm', '--pull=never', '--network=none', '--read-only', '--entrypoint=python', '-w', '/app',
    '-e', 'APP_ENV=test', '-e', 'PYTHONDONTWRITEBYTECODE=1', '-e', `DATABASE_URL=postgresql://test@127.0.0.1/${database}`,
    '-v', `${path.join(root, 'backend/alembic')}:/app/alembic:ro`, '-v', `${path.join(root, 'backend/alembic.ini')}:/app/alembic.ini:ro`,
    '-v', `${path.join(root, 'backend/app')}:/app/app:ro`, migrationImage, '-m', 'alembic', 'upgrade', 'head', '--sql']);
  writeFileSync(schemaPath, schema);
  assert(schema.includes('scheduled_posts ADD COLUMN media'), 'Use the current migration schema fixture');
  base = `http://127.0.0.1:${await freePort()}`;
  docker(['network', 'create', name]); resources.network = true;
  docker(['volume', 'create', `${name}-media`]); resources.volume = true;
  // Match the application's unprivileged Go UID/GID, on this new volume only.
  docker(['run', '--rm', '--pull=never', '--network=none', '-v', `${name}-media:/app/media`, image,
    'sh', '-c', 'chown 10001:10001 /app/media']);
  start('postgres', ['--network-alias', 'postgres', '--tmpfs', '/var/lib/postgresql/data',
    '-e', 'POSTGRES_USER=test', '-e', 'POSTGRES_PASSWORD=local-test-only', '-e', `POSTGRES_DB=${database}`, 'postgres:16-alpine']);
  start('redis', ['--network-alias', 'redis', 'redis:7-alpine', 'redis-server', '--save', '', '--appendonly', 'no']);
  for (let attempt = 0; ; attempt++) {
    const ready = spawnSync('docker', ['exec', `${name}-postgres`, 'pg_isready', '-h', '127.0.0.1', '-U', 'test', '-d', database], { encoding: 'utf8', timeout: 10_000 });
    if (ready.status === 0) break;
    assert(attempt < 50, 'Disposable PostgreSQL did not start');
    await pause(200);
  }
  sql(schema);

  if (process.env.SNEEPCUT_GO_PACKAGE_TESTS === '1') {
    const tests = docker(['run', '--rm', '--pull=never', '--network', `container:${name}-postgres`,
      '-v', `${path.join(root, 'backend-go')}:/src:ro`, '-v', `${directory}:/fixture:ro`, '-v', `${cache}:/go-cache`,
      '-e', 'GOCACHE=/go-cache', '-e', 'GOFLAGS=-p=2', '-e', 'GOMAXPROCS=2',
      '-e', `SNEEPCUT_TEST_DATABASE_URL=postgresql://test:local-test-only@127.0.0.1:5432/${database}?sslmode=disable`,
      '-e', 'SNEEPCUT_TEST_SCHEMA_SQL=/fixture/schema.sql', '-w', '/src', image,
      'go', 'test', '-race', '-count=1', './internal/media', './internal/publishing', './internal/calendar', './internal/httpapi'], { timeout: 600_000 });
    writeFileSync(path.join(directory, 'go-tests.log'), tests);
    console.log(tests);
    pass('affected Go packages pass race tests with a dedicated integration database');
  }

  const generator = `from PIL import Image
from pathlib import Path
import random
out=Path('/fixture')
for i, size in enumerate(((1200,800),(1600,1200)), 1):
    image=Image.frombytes('RGB',size,random.Random(i).randbytes(size[0]*size[1]*3))
    image.save(out/f'photo-{i}.jpg', quality=96)
Image.new('RGBA',(320,240),(20,140,220,110)).save(out/'transparent.png')
`;
  writeFileSync(path.join(directory, 'generate-fixtures.py'), generator);
  docker(['run', '--rm', '--pull=never', '--network=none', '--entrypoint=python', '-v', `${directory}:/fixture`, migrationImage, '/fixture/generate-fixtures.py']);
  docker(['run', '--rm', '--pull=never', '--network=none', '--entrypoint=ffmpeg', '-v', `${directory}:/fixture`, ffmpegImage,
    '-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=red:s=32x32:r=5', '-t', '1', '-an', '-c:v', 'libx264',
    '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '/fixture/clip.mp4']);

  const environment = {
    GO_AUTH_ENABLED: 'true', APP_ENV: 'test', LISTEN_ADDR: ':8080',
    DATABASE_URL: `postgresql://test:local-test-only@postgres:5432/${database}?sslmode=disable`, REDIS_URL: 'redis://redis:6379/0',
    JWT_SECRET: 'synthetic-publishing-jwt-secret-never-for-production',
    INTERNAL_API_KEY: 'synthetic-publishing-media-secret-never-for-production',
    UPLOAD_TOKEN_SECRET: 'synthetic-publishing-upload-secret-never-for-production',
    APP_URL: base, CORS_ORIGINS: base, ALLOWED_HOSTS: '127.0.0.1,localhost,backend-go,nginx,frontend',
    LOCAL_MEDIA_ROOT: '/app/media', UPLOAD_STAGING_DIR: '/tmp/staging', UPLOAD_SCANNER_ENABLED: 'false',
    AUTH_REQUIRE_EMAIL_VERIFICATION: 'false', MAX_UPLOAD_SIZE_MB: '8', DEFAULT_FREE_CREDITS: '100',
    SOCIAL_PUBLISHING_ENABLED: 'false', GOCACHE: '/tmp/go-cache',
  };
  start('api', ['--network-alias', 'backend-go', '--network-alias', 'frontend', '--user', '10001:10001',
    '--tmpfs', '/tmp:uid=10001,gid=10001,mode=1770,exec',
    '-v', `${name}-media:/app/media`, '-v', `${cache}:/go-cache`, '-v', `${path.join(root, 'backend-go')}:/src:ro`,
    ...Object.entries(environment).flatMap(([key, value]) => ['-e', `${key}=${value}`]),
    image, 'sh', '-c', 'mkdir -p /tmp/staging && go build -o /tmp/api ./cmd/api && exec /tmp/api']);
  start('nginx', ['--network-alias', 'nginx', '--user', '10001:10001', '--tmpfs', '/tmp:uid=10001,gid=10001,mode=1770',
    '-p', `127.0.0.1:${new URL(base).port}:80`,
    '-v', `${path.join(root, 'nginx', 'nginx.conf')}:/etc/nginx/nginx.conf:ro`,
    '-v', `${name}-media:/app/media:ro`, 'nginx:alpine']);
  const deadline = Date.now() + 180_000;
  while (true) {
    try {
      const response = await fetch(`${base}/api/ready`, { signal: AbortSignal.timeout(2000) });
      if (response.status === 200 && (await response.json()).ready) break;
    } catch {}
    const running = docker(['inspect', '--format', '{{.State.Running}}', `${name}-api`]);
    assert.equal(running, 'true', 'Fresh fixture API exited; see api.log in the evidence directory');
    assert(Date.now() < deadline, 'Fresh Go/Nginx API did not become ready');
    await pause(500);
  }
  pass('fresh Go image and repository Nginx configuration are ready');
  await request('/api/publishing/media', { method: 'POST', expected: 401, authenticated: false });
  pass('actual publishing upload route exists behind Nginx (401 unauthenticated, not 404)');
  const credentials = { email: `${name}@example.invalid`, password: 'SyntheticPublishingPass42!' };
  const created = await request('/v1/auth/register', { method: 'POST', body: { ...credentials, name: 'Publishing HTTP Fixture' }, expected: 201 });
  assert.equal(created.verificationRequired, false);
  const login = await request('/v1/auth/login', { method: 'POST', body: credentials, expected: 201 });
  token = login.access_token;
  assert(token);

  const [first, second] = await Promise.all([upload('photo-1.jpg', 'image/jpeg'), upload('photo-2.jpg', 'application/octet-stream')]);
  assert.equal(first.type, 'image'); assert.equal(second.type, 'image');
  assert(first.bytes.length > 1024 * 1024 && second.bytes.length > 1024 * 1024, 'Fixtures should exercise nontrivial request bodies');
  pass('two concurrent JPEG uploads succeed with image/jpeg and phone-style generic MIME');
  const png = await upload('transparent.png', 'application/octet-stream');
  const video = await upload('clip.mp4', 'video/mp4');
  assert.equal(png.type, 'image'); assert.equal(video.type, 'video');
  const evidence = [];
  for (const [media, type] of [[first, 'image/jpeg'], [second, 'image/jpeg'], [png, 'image/png'], [video, 'video/mp4']]) {
    evidence.push(await verifyPreview(media, type));
  }
  pass('signed previews through Nginx retain exact SHA-256 bytes for both JPEGs, PNG and MP4; unsigned access is rejected');
  await request(`/api/publishing/media/preview?reference=${encodeURIComponent(first.reference)}`, { expected: 401, authenticated: false });
  const derivative = png.reference.replace(/\.png$/, '-instagram.jpg');
  const derivativeCheck = `from PIL import Image\nfrom pathlib import Path\np=Path('/app/media')/'${derivative}'\nim=Image.open(p)\nassert im.format=='JPEG' and im.size==(320,240)\nprint('JPEG derivative preserves dimensions; original PNG remains separate')`;
  docker(['run', '--rm', '--pull=never', '--network=none', '--entrypoint=python', '-v', `${name}-media:/app/media:ro`, migrationImage, '-c', derivativeCheck]);
  pass('PNG has a separate full-dimension Instagram JPEG derivative');

  const ordered = [second, video, first, png].map(({ type, reference, name: filename }) => ({ type, reference, name: filename }));
  const now = new Date();
  const saved = await request('/api/calendar', { method: 'POST', expected: 201, body: {
    title: 'Synthetic mixed carousel', caption: 'HTTP verification only', platforms: ['instagram'], accountIds: [],
    status: 'draft', scheduledAt: now.toISOString(), clipId: null, media: ordered,
  } });
  assert.deepEqual(saved.post.media, ordered);
  const reordered = [ordered[3], ordered[0], ordered[1], ordered[2]];
  const updated = await request(`/api/calendar/${saved.post.id}`, { method: 'PATCH', body: { media: reordered } });
  assert.deepEqual(updated.post.media, reordered);
  const startTime = new Date(now.getTime() - 86_400_000).toISOString();
  const endTime = new Date(now.getTime() + 86_400_000).toISOString();
  const calendar = await request(`/api/calendar?start=${encodeURIComponent(startTime)}&end=${encodeURIComponent(endTime)}`);
  assert.deepEqual(calendar.posts.find((post) => post.id === saved.post.id).media, reordered);
  pass('mixed carousel draft save, cover reorder, and reload preserve all four uploaded references in order');
  writeFileSync(path.join(directory, 'media-evidence.json'), JSON.stringify(evidence, null, 2));
  outcome = 'passed';
} catch (error) {
  console.error(error.stack || error.message);
  process.exitCode = 1;
} finally {
  for (const suffix of ['api', 'nginx']) {
    const logs = spawnSync('docker', ['logs', `${name}-${suffix}`], { encoding: 'utf8', timeout: 15_000 });
    writeFileSync(path.join(directory, `${suffix}.log`), `${logs.stdout || ''}${logs.stderr || ''}`);
  }
  let cleanedUp = false;
  try {
    cleanup();
    cleanedUp = true;
  } catch (error) {
    process.exitCode = 1; outcome = 'failed';
    console.error(`Fixture cleanup failed: ${error.message}`);
  }
  writeFileSync(path.join(directory, 'verification.json'), JSON.stringify({ outcome, image, database, checks, cleanedUp, scope: 'Real HTTP, fresh Go image, actual Nginx routes, disposable PostgreSQL/Redis/media; no social publication' }, null, 2));
  console.log(`EVIDENCE_DIRECTORY=${directory}`);
}
