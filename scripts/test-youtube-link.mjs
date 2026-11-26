import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseEnv } from 'node:util'
import { buildSchema } from './stripe-integration-schema.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))
const settings = { ...parseEnv(await readFile(path.join(root, '.env'), 'utf8')), ...process.env }
assert.ok(
  ['development', 'test'].includes(settings.APP_ENV || 'development'),
  'Use development/test configuration only'
)
const docker = (args) =>
  execFileSync('docker', args, {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 8 << 20,
    stdio: ['ignore', 'pipe', 'pipe']
  })
const compose = (args) => docker(['compose', ...args])
const exists = compose([
  'exec',
  '-T',
  'postgres',
  'sh',
  '-ec',
  'psql -U "$POSTGRES_USER" -d postgres -Atc "SELECT 1 FROM pg_database WHERE datname=\'sneepcut_integration_test\'"'
]).trim()
if (exists !== '1')
  compose(['exec', '-T', 'postgres', 'sh', '-ec', 'createdb -U "$POSTGRES_USER" sneepcut_integration_test'])
await mkdir(path.join(root, '.cache/tmp'), { recursive: true })
const scratch = await mkdtemp(path.join(root, '.cache/tmp/youtube-link-'))
const output = path.join(root, 'artifacts/youtube-link-20261126')
await mkdir(output, { recursive: true })
try {
  await buildSchema(root, path.join(scratch, 'schema.sql'))
  const database = new URL('postgresql://127.0.0.1:5432/sneepcut_integration_test?sslmode=disable')
  database.username = settings.POSTGRES_USER || 'sneepcut'
  database.password = settings.DB_PASSWORD || 'changeme'
  await writeFile(
    path.join(scratch, 'database.env'),
    `SNEEPCUT_TEST_DATABASE_URL=${database.href}\nSNEEPCUT_TEST_SCHEMA_SQL=/fixtures/schema.sql\n`
  )
  const base = [
    'run',
    '--rm',
    '--read-only',
    '--user',
    '10001:10001',
    '--tmpfs',
    '/tmp:rw,exec,size=1g,mode=1777',
    '--mount',
    `type=bind,source=${path.join(root, 'backend')},target=/src,readonly`,
    '--mount',
    `type=bind,source=${path.resolve(root, settings.SNEEPCUT_RUNTIME_ROOT || '../ai-shorts-runtime', 'cache/go-build')},target=/cache`,
    '-e',
    'GOCACHE=/cache',
    '-e',
    'GOTELEMETRY=off',
    '-e',
    'GOMAXPROCS=2',
    '-w',
    '/src'
  ]
  const postgres = compose(['ps', '-q', 'postgres']).trim()
  const dbOutput = docker([
    ...base,
    '--network',
    `container:${postgres}`,
    '--mount',
    `type=bind,source=${scratch},target=/fixtures,readonly`,
    '--env-file',
    path.join(scratch, 'database.env'),
    'sneepcut-go-dev',
    'go',
    'test',
    './internal/jobs',
    './internal/worker',
    '-run',
    'Postgres.*(YouTube|Credit|Ownership|JobHTTP|AudioRetry)',
    '-count=1',
    '-v',
    '-timeout=2m'
  ])
  await writeFile(path.join(output, 'database-tests.log'), dbOutput)
  console.log(dbOutput)
  const seaweed = compose(['ps', '-q', 'seaweedfs']).trim()
  const s3Output = docker([
    ...base,
    '--network',
    `container:${seaweed}`,
    '-e',
    `SNEEPCUT_TEST_S3_ENDPOINT=http://127.0.0.1:${settings.SEAWEEDFS_PORT || '8333'}`,
    '-e',
    `SNEEPCUT_TEST_S3_ACCESS_KEY=${settings.SEAWEEDFS_ACCESS_KEY_ID || 'sneepcut-dev'}`,
    '-e',
    `SNEEPCUT_TEST_S3_SECRET_KEY=${settings.SEAWEEDFS_SECRET_ACCESS_KEY || 'sneepcut-local-development-only'}`,
    '-e',
    `SNEEPCUT_TEST_S3_BUCKET=${settings.SEAWEEDFS_BUCKET || 'sneepcut-dev'}`,
    'sneepcut-go-dev',
    'go',
    'test',
    './internal/media',
    '-run',
    '^TestS3MultipartCompatibility$',
    '-count=1',
    '-v',
    '-timeout=2m'
  ])
  await writeFile(path.join(output, 's3-multipart-tests.log'), s3Output)
  console.log(s3Output)
} catch (error) {
  // Diagnostics are kept locally; do not print process arguments containing a
  // database password or storage credentials through execFile's error.message.
  const diagnostic = `${error.stdout || ''}\n${error.stderr || ''}`
  await writeFile(path.join(output, 'integration-failure.log'), diagnostic)
  console.error(diagnostic)
  process.exitCode = 1
} finally {
  const scratchRoot = path.resolve(root, '.cache/tmp') + path.sep
  assert.ok(path.resolve(scratch).startsWith(scratchRoot), 'Refusing cleanup outside task scratch storage')
  await rm(scratch, { recursive: true, force: true })
}
