// Real Whisper -> highlights -> crop/captions -> persisted playable clip.
// Supply a synthetic speech WAV; all database/media state is isolated.
// Build sneepcut-ml-dev first. An optional Gemini/OpenRouter key enables real AI selection.
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

const root = process.cwd()
const speech = path.resolve(process.argv[2] || '.cache/processing-e2e/speech.wav')
const name = `sneepcut-processing-test-${randomUUID().slice(0, 8)}`
const directory = path.join(root, '.cache', name)
mkdirSync(directory, { recursive: true })
const image = process.env.SNEEPCUT_ML_IMAGE || 'sneepcut-ml-dev'
const containers = []
// Keep Node alive while fetch is waiting on a container that is still starting.
const keepAlive = setInterval(() => {}, 1000)
const docker = (...args) => execFileSync('docker', args, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true, timeout: 180000, maxBuffer: 8 * 1024 * 1024 })
const dockerLogs = (id) => {
  const result = spawnSync('docker', ['logs', id], { encoding: 'utf8', windowsHide: true, timeout: 10000, maxBuffer: 8 * 1024 * 1024 })
  return (result.stdout || '') + (result.stderr || '')
}
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const envArgs = (values) => Object.entries(values).flatMap(([key, value]) => ['-e', `${key}=${value}`])
const database = `postgresql://test:local-test-only@${name}-pg:5432/sneepcut_integration_test`
const shared = { APP_ENV: 'test', DATABASE_URL: database, REDIS_URL: `redis://${name}-redis:6379/0`, LOCAL_MEDIA_ROOT: '/media', STORAGE_TYPE: 'local' }
function start(suffix, imageName, args = [], options = []) {
  const id = `${name}-${suffix}`
  docker('run', '-d', '--name', id, '--network', name, ...options, imageName, ...args)
  containers.push(id)
  return id
}
let network = false
try {
  docker('network', 'create', name)
  network = true
  const pg = start('pg', 'postgres:16-alpine', [], ['--tmpfs', '/var/lib/postgresql/data', ...envArgs({ POSTGRES_USER: 'test', POSTGRES_PASSWORD: 'local-test-only', POSTGRES_DB: 'sneepcut_integration_test' })])
  start('redis', 'redis:7-alpine', ['redis-server', '--save', '', '--appendonly', 'no'])
  for (let attempt = 0; ; attempt++) {
    try { docker('exec', pg, 'pg_isready', '-U', 'test', '-d', 'sneepcut_integration_test'); break } catch (error) { if (attempt > 60) throw error; await delay(500) }
  }
  docker('run', '--rm', '--network', name, ...envArgs(shared), image, 'alembic', 'upgrade', 'head')
  docker('run', '--rm', '--network', 'none', '-v', `${directory}:/media`, '-v', `${speech}:/speech.wav:ro`, image,
    'ffmpeg', '-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=size=320x180:rate=2', '-i', '/speech.wav', '-t', '18', '-shortest', '-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'aac', '/media/synthetic.mp4')
  const worker = start('worker', image, ['celery', '-A', 'app.workers.celery_app:celery_app', 'worker', '--pool=solo', '--concurrency=1', '--loglevel=info'], [
    '--cap-drop=ALL', '--security-opt=no-new-privileges', '-v', `${root}/backend/app:/app/app:ro`, '-v', `${directory}:/media`, ...envArgs(shared), '-e', 'AI_PROVIDER', '-e', 'GEMINI_API_KEY', '-e', 'GEMINI_MODEL_NAME', '-e', 'OPENROUTER_API_KEY', '-e', 'OPENROUTER_MODEL_NAME'])
  const api = start('api', 'sneepcut-go-dev', ['go', 'run', './cmd/api'], [
    '--user', '10001:10001', '--cap-drop=ALL', '--security-opt=no-new-privileges',
    '-p', '127.0.0.1::8080', '-v', `${root}/backend-go:/src:ro`, '-v', `${directory}:/media`, ...envArgs({ ...shared, DATABASE_URL: `${database}?sslmode=disable`, GO_AUTH_ENABLED: 'true', LISTEN_ADDR: ':8080', APP_URL: 'http://localhost:3000', CORS_ORIGINS: 'http://localhost:3000', JWT_SECRET: 'processing-fixture-jwt-secret-not-for-production', INTERNAL_API_KEY: 'processing-fixture-media-secret-not-for-production', UPLOAD_TOKEN_SECRET: 'processing-fixture-upload-secret-not-for-production', UPLOAD_SCANNER_ENABLED: 'false', GOCACHE: '/tmp/go-build' })])
  const base = `http://${docker('port', api, '8080/tcp').trim()}`
  let token
  async function request(route, body, method) {
    const response = await fetch(base + route, { signal: AbortSignal.timeout(10000), method: method || (body ? 'POST' : 'GET'), headers: { Origin: 'http://localhost:3000', 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined })
    const result = await response.json()
    assert(response.ok, `${route}: ${response.status} ${JSON.stringify(result)}`)
    return result
  }
  for (let attempt = 0; ; attempt++) {
    try { assert((await request('/api/ready')).ready); break } catch (error) { if (attempt > 180) throw error; await delay(1000) }
  }
  const credentials = { email: `${name}@example.invalid`, password: 'SyntheticVideoTest42!', name: 'Processing fixture' }
  await request('/v1/auth/register', credentials)
  token = (await request('/v1/auth/login', { email: credentials.email, password: credentials.password })).access_token
  const source = readFileSync(path.join(directory, 'synthetic.mp4'))
  const authorization = await request('/api/upload/authorize', { fileName: 'synthetic.mp4', fileSize: source.length, contentType: 'video/mp4' })
  const uploadResponse = await fetch(base + authorization.uploadUrl, { method: 'PUT', headers: { Origin: 'http://localhost:3000', Authorization: `Bearer ${authorization.token}`, 'Content-Type': 'video/mp4' }, body: source })
  assert.equal(uploadResponse.status, 201)
  const upload = await uploadResponse.json()
  const created = await request('/api/jobs', { source_type: 'upload', source_file_path: upload.file_path, num_clips_requested: 1, aspect_ratio: '9:16', language: 'en', subtitle_style: 'clean', burn_subtitles: true, smart_crop: true })
  console.log(`Uploaded synthetic speech and queued ${created.id}`)
  docker('exec', worker, 'python', '-c', 'from app.services.job_delivery import recover_and_dispatch; print(recover_and_dispatch())')
  let job
  let previous
  for (let attempt = 0; ; attempt++) {
    job = (await request(`/api/jobs/${created.id}`)).job
    if (job.status !== previous) { console.log(`Processing: ${job.status} (${job.progress}%)`); previous = job.status }
    if (['completed', 'failed', 'cancelled'].includes(job.status) && !job.processing_active) break
    assert(attempt < 900, 'Processing exceeded 30 minutes')
    await delay(2000)
  }
  assert.equal(job.status, 'completed', JSON.stringify(job))
  const clips = (await request('/api/clips')).clips.filter((clip) => clip.job_id === created.id)
  assert.equal(clips.length, 1)
  const clip = clips[0]
  assert(clip.has_subtitles && clip.transcript_text && clip.thumbnail_storage_key, JSON.stringify(clip))
  const mediaPath = `/media/${clip.file_storage_key}`
  const probe = JSON.parse(docker('exec', worker, 'ffprobe', '-v', 'error', '-show_streams', '-show_format', '-of', 'json', mediaPath))
  const video = probe.streams.find((stream) => stream.codec_type === 'video')
  assert.equal(video.codec_name, 'h264')
  assert(Math.abs(video.width / video.height - 9 / 16) < 0.02)
  assert(probe.streams.some((stream) => stream.codec_type === 'audio'))
  docker('exec', worker, 'ffmpeg', '-v', 'error', '-i', mediaPath, '-f', 'null', '-')
  const signed = new URL(clip.file_url, base)
  signed.searchParams.set('path', signed.pathname)
  await request(`/api/media/verify?${signed.searchParams}`)
  const logs = dockerLogs(worker)
  writeFileSync(path.join(directory, 'worker.log'), logs)
  assert(logs.includes('Vertical reframing complete:') && !logs.includes('Error processing video:') && !logs.includes('smart crop failed'), 'Smart crop fell back; inspect worker.log')
  const provider = (process.env.AI_PROVIDER || 'auto').trim().toLowerCase()
  const aiProviderConfigured = provider === 'openrouter'
    ? Boolean(process.env.OPENROUTER_API_KEY)
    : provider === 'gemini'
      ? Boolean(process.env.GEMINI_API_KEY)
      : Boolean(process.env.GEMINI_API_KEY || process.env.OPENROUTER_API_KEY)
  if (aiProviderConfigured) {
    assert(!logs.includes('using fallback highlights') && !logs.includes('Highlight detection failed:'), 'Cloud AI fell back; inspect worker.log')
  }
  const report = { job, clip, probe, aiProviderConfigured, persistentDataUsed: false }
  writeFileSync(path.join(directory, 'report.json'), JSON.stringify(report, null, 2))
  console.log(`PASS: real transcription, persisted completion, captions, portrait H.264/audio, complete decode and signed media authorization. Report: ${directory}`)
} finally {
  clearInterval(keepAlive)
  for (const id of containers) {
    try { writeFileSync(path.join(directory, `${id}.log`), dockerLogs(id)) } catch {}
  }
  for (const id of containers.reverse()) docker('rm', '-f', '-v', id)
  if (network) docker('network', 'rm', name)
}
