import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseEnv } from 'node:util'

const root = fileURLToPath(new URL('../', import.meta.url))
let settings = {}
try {
  settings = parseEnv(await readFile(path.join(root, '.env'), 'utf8'))
} catch (error) {
  if (error.code !== 'ENOENT') throw error
}
const configured = { ...settings, ...process.env }
const port = configured.SEAWEEDFS_PORT || '8333'
if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535)
  throw new Error('SEAWEEDFS_PORT must be a valid TCP port')

// This runner intentionally targets loopback, never configured production S3.
const endpoint = `http://127.0.0.1:${port}`
console.log(`Checking the media S3 contract at ${endpoint}. Run make seaweed-up first.`)
const temporaryRoot = path.join(root, '.cache/tmp')
await mkdir(temporaryRoot, { recursive: true })
const scratch = await mkdtemp(path.join(temporaryRoot, 's3-verification-'))
try {
  process.exitCode = await new Promise((resolve, reject) => {
    const child = spawn('go', [
      'test', './internal/media', '-run', '^TestS3Compatibility$', '-count=1', '-v', '-timeout=2m'
    ], {
      cwd: path.join(root, 'backend'),
      stdio: 'inherit',
      env: {
        ...process.env,
        TMPDIR: scratch,
        GOCACHE: path.resolve(root, configured.GO_CACHE || '.cache/go-build'),
        SNEEPCUT_TEST_S3_ENDPOINT: endpoint,
        SNEEPCUT_TEST_S3_ACCESS_KEY: configured.SEAWEEDFS_ACCESS_KEY_ID || 'sneepcut-dev',
        SNEEPCUT_TEST_S3_SECRET_KEY: configured.SEAWEEDFS_SECRET_ACCESS_KEY || 'sneepcut-local-development-only',
        SNEEPCUT_TEST_S3_BUCKET: configured.SEAWEEDFS_BUCKET || 'sneepcut-dev'
      }
    })
    child.on('error', reject)
    child.on('exit', (code, signal) => {
      if (signal) console.error(`S3 verification stopped by ${signal}`)
      resolve(code ?? 1)
    })
  })
} finally {
  await rm(scratch, { recursive: true, force: true })
}
