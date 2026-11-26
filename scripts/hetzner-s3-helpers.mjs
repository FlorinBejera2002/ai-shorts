import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { copyFile, readFile, stat } from 'node:fs/promises'
import path from 'node:path'

export function validateConfig(config) {
  for (const field of ['endpoint', 'region', 'bucket', 'confirm_bucket', 'access_key', 'secret_key'])
    assert.ok(typeof config?.[field] === 'string' && config[field], `Missing smoke field: ${field}`)
  assert.ok(['hel1', 'fsn1', 'nbg1'].includes(config.region), 'Unknown Hetzner region')
  assert.ok(config.endpoint === `https://${config.region}.your-objectstorage.com`, 'Regional HTTPS endpoint required')
  assert.ok(config.bucket === config.confirm_bucket, 'Explicit matching bucket confirmation required')
  assert.ok(/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(config.bucket), 'A bucket name is required')
  return config
}

export async function readConfig(inputStream = process.stdin) {
  let input = ''
  for await (const chunk of inputStream) {
    input += chunk
    assert.ok(input.length < 16384, 'Smoke configuration is too large')
  }
  let config
  try { config = JSON.parse(input) }
  catch { throw new Error('Smoke configuration must be valid JSON') }
  return validateConfig(config)
}

export const sanitizer = config => value => String(value)
  .replaceAll(config.access_key, '[redacted key]').replaceAll(config.secret_key, '[redacted secret]')
  .replace(/https?:\/\/[^\s"'<>]+/g, '[redacted URL]')

export function command(executable, args, options = {}) {
  const { onLine, ...spawnOptions } = options
  const child = spawn(executable, args, { stdio: ['pipe', 'pipe', 'pipe'], ...spawnOptions })
  let output = '', stdout = '', pending = ''
  child.stdout.setEncoding('utf8')
  child.stderr.setEncoding('utf8')
  child.stdout.on('data', chunk => {
    output += chunk; stdout += chunk; pending += chunk
    const lines = pending.split('\n'); pending = lines.pop()
    if (onLine) for (const line of lines) onLine(line)
  })
  child.stderr.on('data', chunk => { output += chunk })
  const completed = new Promise((resolve, reject) => {
    child.once('error', reject)
    child.once('close', code => { if (onLine && pending) onLine(pending); resolve({ code, output, stdout }) })
  })
  completed.catch(() => {})
  return { child, completed }
}

export async function videoFixture(scratch, cwd) {
  const filename = path.join(scratch, 'reference.mp4')
  if (process.env.SNEEPCUT_HETZNER_VIDEO_FIXTURE) {
    const source = process.env.SNEEPCUT_HETZNER_VIDEO_FIXTURE
    const info = await stat(source)
    assert.ok(info.isFile() && info.size >= 8 * 1024 ** 2 && info.size <= 32 * 1024 ** 2, 'Video fixture must be a regular 8–32 MiB file')
    await copyFile(source, filename)
    return { filename, size: info.size }
  }
  const encode = command('ffmpeg', ['-v', 'error', '-nostdin', '-f', 'lavfi', '-i',
    'testsrc2=size=640x360:rate=24:duration=12', '-an', '-c:v', 'libx264', '-threads', '1',
    '-preset', 'ultrafast', '-b:v', '12M', '-minrate', '12M', '-maxrate', '12M', '-bufsize', '12M',
    '-x264-params', 'nal-hrd=cbr:force-cfr=1', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', filename], { cwd, timeout: 30000 })
  encode.child.stdin.end()
  const result = await encode.completed
  assert.equal(result.code, 0, 'Synthetic video generation failed')
  const size = (await stat(filename)).size
  assert.ok(size >= 8 * 1024 ** 2 && size <= 32 * 1024 ** 2, 'Unexpected synthetic video size')
  return { filename, size }
}

export async function traceSummary(filename) {
  let text
  try { text = await readFile(filename, 'utf8') } catch (error) { if (error.code === 'ENOENT') return { attempts: 0 }; throw error }
  const events = text.trim().split('\n').filter(Boolean).map(line => JSON.parse(line))
  const headers = events.filter(event => event.phase === 'headers')
  const statuses = {}
  for (const event of headers) statuses[event.status] = (statuses[event.status] || 0) + 1
  const errors = events.filter(event => event.error)
  return { attempts: headers.length, retriedAttempts: headers.filter(event => /attempt=[2-9]/.test(event.attempt || '')).length,
    statuses, errors: errors.map(event => ({ phase: event.phase, path: event.path, status: event.status, error: event.error, elapsed_ms: event.elapsed_ms })),
    slowAttempts: events.filter(event => event.elapsed_ms >= 5000).map(event => ({ phase: event.phase, path: event.path, status: event.status, elapsed_ms: event.elapsed_ms, request_id: event.request_id })) }
}
