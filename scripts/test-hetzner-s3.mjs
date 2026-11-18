import assert from 'node:assert/strict'
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { readConfig, sanitizer, command, videoFixture, traceSummary } from './hetzner-s3-helpers.mjs'

// Explicit opt-in: JSON on stdin, never the application's .env or AWS profile.
// No buckets or bucket settings are created/changed. Only random test prefixes are removed.
const root = fileURLToPath(new URL('../', import.meta.url))
assert.ok(process.argv.slice(2).every(argument => ['--skip-bulk', '--transfers-only'].includes(argument)), 'Unknown smoke argument')
const skipBulk = process.argv.includes('--skip-bulk')
const transfersOnly = process.argv.includes('--transfers-only')
const config = await readConfig()
const sanitize = sanitizer(config)

async function verifyClients(fixture) {
  let browser
  try {
    const cors = await fetch(fixture.source_url, { headers: { Origin: 'http://localhost:3000', Range: 'bytes=4-7' }, signal: AbortSignal.timeout(15_000) })
    assert.equal(cors.status, 206)
    const corsOrigin = cors.headers.get('access-control-allow-origin')
    await cors.body?.cancel()
    console.log(['*', 'http://localhost:3000'].includes(corsOrigin)
      ? 'INFO bucket CORS allows the test browser origin'
      : 'INFO bucket CORS does not allow the test origin; direct browser fetch/canvas access is outside this playback check')
    if (process.env.PLAYWRIGHT_MODULE) {
      const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href)
      browser = await chromium.launch({ channel: 'chrome', headless: true })
      const page = await browser.newPage()
      const dimensions = await page.evaluate(async source => {
        const video = document.createElement('video')
        video.muted = true
        const loaded = new Promise((resolve, reject) => {
          video.onloadeddata = resolve
          video.onerror = () => reject(new Error('Remote private video decode failed'))
          setTimeout(() => reject(new Error('Remote private video decode timed out')), 15000)
        })
        video.src = source
        document.body.append(video)
        await loaded
        await video.play()
        await Promise.race([
          new Promise(resolve => video.requestVideoFrameCallback(resolve)),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Remote video frame timed out')), 15000))
        ])
        video.pause()
        return [video.videoWidth, video.videoHeight]
      }, fixture.source_url)
      assert.deepEqual(dimensions, [160, 90])
      console.log('PASS native Chrome private signed MP4 playback (160×90)')
    } else console.log('SKIP native browser playback: set PLAYWRIGHT_MODULE to enable')
    const worker = command('docker', ['compose', '-f', 'docker-compose.yml', '-f', 'docker-compose.dev.yml',
      'run', '--rm', '--no-deps', '-T', '--entrypoint', 'sh', 'worker', '-ec',
      'IFS= read -r fixture_url; ffprobe -v error -select_streams v:0 -show_entries stream=codec_name,width,height -of json "$fixture_url"'], { cwd: root, timeout: 30_000 })
    worker.child.stdin.end(fixture.source_url + '\n')
    const workerResult = await worker.completed
    if (workerResult.code !== 0) console.error(sanitize(workerResult.output))
    assert.equal(workerResult.code, 0, 'Worker private HTTPS source access failed')
    const probe = JSON.parse(workerResult.stdout)
    assert.equal(probe.streams?.[0]?.codec_name, 'h264')
    assert.equal(probe.streams?.[0]?.width, 160)
    assert.equal(probe.streams?.[0]?.height, 90)
    console.log('PASS worker container private HTTPS source access (H.264, 160×90)')
    const studio = command('docker', ['compose', '-f', 'docker-compose.yml', '-f', 'docker-compose.dev.yml', 'run', '--rm', '--no-deps', '-T', 'studio', 'bun', 'packages/sneepcut-server/src/verify-hetzner-s3.ts'], { cwd: root, timeout: 150_000 })
    studio.child.stdin.end(JSON.stringify({ ...config, ...fixture }))
    const result = await studio.completed
    console.log(sanitize(result.output).trim())
    assert.equal(result.code, 0, 'Studio live S3 contract failed')
  } finally { await browser?.close().catch(() => {}) }
}

await mkdir(path.join(root, '.cache/tmp'), { recursive: true })
const scratch = await mkdtemp(path.join(root, '.cache/tmp/hetzner-verification-'))
await chmod(scratch, 0o700)
const manifest = path.join(scratch, 'fixture.json')
const report = path.resolve(process.env.SNEEPCUT_HETZNER_REPORT_DIR || path.join(root, 'artifacts/hetzner-retest', `local-${Date.now()}`))
const trace = path.join(report, 'requests.jsonl')
let go, success = false
try {
  await mkdir(report, { recursive: true, mode: 0o700 })
  const video = await videoFixture(scratch, root)
  console.log(`Generated real H.264 fixture: ${video.size} bytes; testing one transfer followed by two concurrent transfers.`)
  console.log('Checking the existing private Hetzner bucket; application configuration is unchanged.')
  if (skipBulk) console.log('SKIP bulk pagination case (explicit troubleshooting option); this is not a full provider pass')
  const selection = transfersOnly ? '^TestHetznerS3VideoTransfers$' : skipBulk
    ? '^TestHetznerS3(Compatibility|VideoTransfers)$/(local_migration|private_signed|conditional_create|real_video_cross_client_fixture|sequential_video|parallel_video)'
    : '^TestHetznerS3(Compatibility|VideoTransfers)$'
  go = command('go', ['test', './internal/media', '-run', selection, '-count=1', '-v', '-timeout=15m'], {
    cwd: path.join(root, 'backend'), env: {
      ...process.env, TMPDIR: scratch, GOCACHE: path.join(root, '.cache/go-build'),
      AWS_ACCESS_KEY_ID: config.access_key, AWS_SECRET_ACCESS_KEY: config.secret_key,
      AWS_SESSION_TOKEN: '', SNEEPCUT_HETZNER_SMOKE: '1',
      SNEEPCUT_HETZNER_REGION: config.region, SNEEPCUT_HETZNER_ENDPOINT: config.endpoint,
      SNEEPCUT_HETZNER_BUCKET: config.bucket, SNEEPCUT_HETZNER_CONFIRM_BUCKET: config.confirm_bucket,
      SNEEPCUT_HETZNER_MANIFEST: transfersOnly ? '' : manifest,
      SNEEPCUT_HETZNER_VIDEO_FIXTURE: video.filename, SNEEPCUT_HETZNER_TRACE: trace,
    },
    onLine: line => { if (/=== RUN|--- PASS|--- FAIL|VIDEO_TRANSFER|synthetic object prefix/.test(line)) console.log(sanitize(line)) },
  })
  go.child.stdin.end()
  if (transfersOnly) {
    assert.equal((await go.completed).code, 0, 'Video-sized transfer verification failed')
    success = true
  } else {
    let ended = false
    go.completed.finally(() => { ended = true }).catch(() => {})
    const deadline = Date.now() + 300_000
    let fixture
    while (!fixture) {
      try { fixture = JSON.parse(await readFile(manifest, 'utf8')) }
      catch (error) { if (error.code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error }
      if (!fixture && (ended || Date.now() > deadline)) throw new Error('Media contract failed before cross-client verification')
      if (!fixture) await new Promise(resolve => setTimeout(resolve, 100))
    }
    console.log('PASS Go media contract: private signed reads, ranges, Unicode keys, conditional creates and migration')
    if (!skipBulk) console.log('PASS 1003-object paginated deletion and neighboring-prefix preservation')
    await verifyClients(fixture)
    success = true
  }
} catch (error) {
  console.error(sanitize(error.message))
  process.exitCode = 1
} finally {
  try {
    if (go) {
      await writeFile(manifest + '.done', success ? 'ok' : 'failed', { mode: 0o600 })
      const result = await go.completed
      await writeFile(path.join(report, 'run.log'), sanitize(result.output))
      if (result.code !== 0) console.log(sanitize(result.output).trim())
      if (result.code !== 0) process.exitCode = 1
    }
    const summary = await traceSummary(trace)
    await writeFile(path.join(report, 'summary.json'), JSON.stringify(summary, null, 2))
    console.log('Wire diagnostics:', JSON.stringify({ attempts: summary.attempts, retriedAttempts: summary.retriedAttempts, statuses: summary.statuses, errors: summary.errors?.length, slowAttempts: summary.slowAttempts?.length }))
    console.log('Saved sanitized report:', report)
  } finally {
    await rm(scratch, { recursive: true, force: true })
  }
}
