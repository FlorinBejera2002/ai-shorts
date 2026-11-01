import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parseEnv } from 'node:util'
import { buildSchema } from './stripe-integration-schema.mjs'
import { localS3Settings } from './enable-local-s3.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))
const settings = { ...parseEnv(await readFile(path.join(root, '.env'), 'utf8')), ...process.env }
assert.ok(settings.PLAYWRIGHT_MODULE, 'Set PLAYWRIGHT_MODULE to the installed Playwright entry point')
const { chromium } = await import(pathToFileURL(settings.PLAYWRIGHT_MODULE).href)
const { values, nativeEndpoint } = localS3Settings(settings)
assert.equal(settings.STORAGE_TYPE, 's3', 'Run make media-s3-up before application verification')
const docker = args => execFileSync('docker', ['compose', ...args], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
for (const service of ['backend', 'worker']) {
  const effective = docker(['exec', '-T', service, 'sh', '-ec', 'printf "%s\\n" "$STORAGE_TYPE" "$AWS_ENDPOINT_URL" "$AWS_S3_BUCKET"']).trim().split(/\r?\n/)
  assert.deepEqual(effective, ['s3', values.AWS_ENDPOINT_URL, values.AWS_S3_BUCKET], `Recreate ${service} with make media-s3-up`)
}
const exists = docker(['exec', '-T', 'postgres', 'sh', '-ec', 'psql -U "$POSTGRES_USER" -d postgres -Atc "SELECT 1 FROM pg_database WHERE datname=\'sneepcut_integration_test\'"']).trim()
if (exists !== '1') docker(['exec', '-T', 'postgres', 'sh', '-ec', 'createdb -U "$POSTGRES_USER" sneepcut_integration_test'])
const database = new URL('postgresql://127.0.0.1/sneepcut_integration_test?sslmode=disable')
database.username = settings.POSTGRES_USER || 'sneepcut'
database.password = settings.DB_PASSWORD || 'changeme'
database.port = settings.POSTGRES_HOST_PORT || '5433'
await mkdir(path.join(root, '.cache/tmp'), { recursive: true })
const scratch = await mkdtemp(path.join(root, '.cache/tmp/media-s3-'))
const manifest = path.join(scratch, 'browser.json')
let browser, child, completed
try {
  const schema = await buildSchema(root, path.join(scratch, 'schema.sql'))
  child = spawn('go', ['test', './internal/media', '-run', '^TestPostgresS3MediaLifecycle$', '-count=1', '-v', '-timeout=3m'], {
    cwd: path.join(root, 'backend'), stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, GOCACHE: path.join(root, '.cache/go-build'), TMPDIR: scratch,
      SNEEPCUT_TEST_DATABASE_URL: database.href, SNEEPCUT_TEST_SCHEMA_SQL: schema.path,
      SNEEPCUT_TEST_S3_ENDPOINT: nativeEndpoint, SNEEPCUT_TEST_S3_ACCESS_KEY: values.AWS_ACCESS_KEY_ID,
      SNEEPCUT_TEST_S3_SECRET_KEY: values.AWS_SECRET_ACCESS_KEY, SNEEPCUT_TEST_S3_BUCKET: values.AWS_S3_BUCKET,
      SNEEPCUT_MEDIA_BROWSER_MANIFEST: manifest }
  })
  child.stdout.pipe(process.stdout)
  child.stderr.pipe(process.stderr)
  let ended = false
  completed = new Promise((resolve, reject) => {
    child.on('error', error => { ended = true; reject(error) })
    child.on('exit', code => { ended = true; resolve(code ?? 1) })
  })
  // Attach immediately while waiting for the fixture file; an unavailable Go
  // executable must still reach finally and remove scratch data.
  completed.catch(() => {})
  const deadline = Date.now() + 45000
  let fixture
  while (!fixture) {
    try { fixture = JSON.parse(await readFile(manifest, 'utf8')) }
    catch (error) { if (error.code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error }
    if (!fixture && (ended || Date.now() > deadline)) throw new Error('Media fixture failed before browser verification')
    if (!fixture) await new Promise(resolve => setTimeout(resolve, 100))
  }
  const video = await readFile(fixture.fixture)
  browser = await chromium.launch({ channel: 'chrome', headless: true })
  const page = await browser.newPage()
  page.on('console', message => {
    if (message.type() === 'error') console.error(message.text().replace(/(https?:\/\/[^\s?#]+)[?#][^\s]*/g, '$1?[redacted]'))
  })
  page.on('requestfailed', request => {
    const address = new URL(request.url())
    console.error(`Browser request failed: ${address.origin}${address.pathname}: ${request.failure()?.errorText}`)
  })
  // Use a real loopback response before replacing its document. A fulfilled
  // synthetic navigation has no network address-space metadata in Chrome.
  await page.goto('http://127.0.0.1:3000/favicon-32x32.png')
  await page.evaluate(() => { document.body.replaceChildren(); document.title = 'Synthetic media verification' })
  const result = await page.evaluate(async ({ baseURL, token, video, sourceURL }) => {
    const bytes = new Uint8Array(video)
    const api = async (route, init) => {
      const response = await fetch(baseURL + route, { ...init, headers: { Authorization: `Bearer ${token}`, ...init?.headers } })
      if (!response.ok) throw new Error(`Media API ${route} returned ${response.status}: ${await response.text()}`)
      return response.json()
    }
    const authorized = await api('/api/upload/authorize', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileName: 'browser.mp4', fileSize: bytes.length, contentType: 'video/mp4' }) })
    const direct = await fetch(baseURL + authorized.uploadUrl, { method: 'PUT', headers: { Authorization: `Bearer ${authorized.token}`, 'Content-Type': 'video/mp4' }, body: bytes })
    if (direct.status !== 201 || !(await direct.json()).file_path.startsWith('uploads/')) throw new Error('Browser direct upload failed')
    const form = new FormData()
    form.set('file', new File([bytes], 'browser.mp4', { type: 'video/mp4' }))
    const published = await api('/api/publishing/media', { method: 'POST', body: form })
    const preview = await api('/api/publishing/media/preview?reference=' + encodeURIComponent(published.reference))
    for (const address of [preview.url, sourceURL]) {
      const response = await fetch(address, { headers: { Range: 'bytes=4-7' } })
      const range = new Uint8Array(await response.arrayBuffer())
      if (response.status !== 206 || range.length !== 4 || range.some((value, index) => value !== bytes[index + 4]) || !response.headers.get('Content-Range'))
        throw new Error('Browser S3 range/CORS verification failed')
    }
    const element = document.createElement('video')
    element.crossOrigin = 'anonymous'
    element.muted = true
    element.src = sourceURL
    document.body.append(element)
    await Promise.race([new Promise((resolve, reject) => { element.onloadeddata = resolve; element.onerror = () => reject(new Error('Video decode failed')) }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Video decode timed out')), 15000))])
    await element.play()
    await Promise.race([new Promise(resolve => element.requestVideoFrameCallback(resolve)),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Video frame timed out')), 15000))])
    element.pause()
    const canvas = document.createElement('canvas')
    canvas.width = element.videoWidth; canvas.height = element.videoHeight
    const context = canvas.getContext('2d')
    context.drawImage(element, 0, 0)
    const pixel = context.getImageData(10, 10, 1, 1).data
    if (element.videoWidth !== 160 || pixel[2] < 200 || pixel[0] > 30)
      throw new Error(`Unexpected decoded frame: width=${element.videoWidth}, pixel=${Array.from(pixel)}`)
    return { directUpload: true, publishingUpload: true, privatePreview: true, ranges: true, cors: true, canvas: true, width: element.videoWidth }
  }, { ...fixture, video: Array.from(video) })
  console.log('Browser media checks passed:', JSON.stringify(result))
  try {
    const probe = JSON.parse(execFileSync('docker', ['compose', 'exec', '-T', 'worker', 'ffprobe', '-v', 'error',
      '-select_streams', 'v:0', '-show_entries', 'stream=codec_name,width,height', '-of', 'json', fixture.sourceURL],
    { cwd: root, encoding: 'utf8', timeout: 20000, stdio: ['ignore', 'pipe', 'pipe'] }))
    assert.equal(probe.streams?.[0]?.codec_name, 'h264')
    assert.equal(probe.streams?.[0]?.width, 160)
    console.log('Worker container private S3 source access passed')
    const studio = execFileSync('docker', ['compose', 'exec', '-T', 'studio', 'bun', 'packages/sneepcut-server/src/verify-local-s3.ts'], {
      cwd: root, input: JSON.stringify({ sourceURL: fixture.sourceURL, owner: fixture.owner, sha256: createHash('sha256').update(video).digest('hex') }),
      encoding: 'utf8', timeout: 80000, stdio: ['pipe', 'pipe', 'pipe']
    })
    console.log(studio.trim())
  } catch (error) {
    console.error(String(error.stderr || '').replace(/(https?:\/\/[^\s?#"]+)[?#][^\s"]*/g, '$1?[redacted]'))
    throw new Error('Worker/Studio S3 verification failed')
  }
  await writeFile(manifest + '.done', '')
  assert.equal(await completed, 0, 'Authenticated S3/database lifecycle failed')
} finally {
  await browser?.close().catch(() => {})
  if (child && child.exitCode === null) {
    await writeFile(manifest + '.done', '').catch(() => {})
    await Promise.race([completed.catch(() => {}), new Promise(resolve => setTimeout(resolve, 5000))])
    if (child.exitCode === null) { child.kill('SIGINT'); await completed.catch(() => {}) }
  }
  await rm(scratch, { recursive: true, force: true })
}
