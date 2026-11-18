import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parseEnv } from 'node:util'
import { runtimeDirectory, validateRuntimePath } from './runtime-storage.mjs'

const repository = fileURLToPath(new URL('../', import.meta.url))
const compose = ['compose', '-f', 'docker-compose.yml', '-f', 'docker-compose.dev.yml']

export function localS3Settings(settings) {
  if (!['development', 'test', 'testing'].includes(settings.APP_ENV || 'development'))
    throw new Error('Local S3 cutover requires a development/test environment')
  const port = settings.SEAWEEDFS_PORT || '8333'
  if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535)
    throw new Error('Invalid SEAWEEDFS_PORT')
  const endpoint = `http://s3.localhost:${port}`
  const values = {
    STORAGE_TYPE: 's3',
    AWS_ACCESS_KEY_ID: settings.SEAWEEDFS_ACCESS_KEY_ID || 'sneepcut-dev',
    AWS_SECRET_ACCESS_KEY: settings.SEAWEEDFS_SECRET_ACCESS_KEY || 'sneepcut-local-development-only',
    AWS_SESSION_TOKEN: '',
    AWS_REGION: 'us-east-1',
    AWS_S3_BUCKET: settings.SEAWEEDFS_BUCKET || 'sneepcut-dev',
    AWS_ENDPOINT_URL: endpoint,
    AWS_S3_FORCE_PATH_STYLE: 'true',
    SNEEPCUT_MEDIA_S3_ORIGIN: endpoint
  }
  values.SNEEPCUT_MEDIA_S3_INTERNAL_ORIGIN = `http://seaweedfs:${port}`
  if (!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(values.AWS_S3_BUCKET))
    throw new Error('Use a DNS-compatible development bucket name')
  values.AWS_PUBLIC_BASE_URL = `${endpoint}/${values.AWS_S3_BUCKET}`
  // Preserve pre-existing credentials for another provider rather than silently
  // replacing valuable settings in the developer's ignored environment file.
  for (const key of Object.keys(values)) {
    if (key.startsWith('AWS_') && settings[key] && String(settings[key]) !== values[key])
      throw new Error(`Existing ${key} differs from local SeaweedFS; preserve that configuration before cutover`)
  }
  return { values, nativeEndpoint: `http://127.0.0.1:${port}` }
}

export function updateEnvironment(contents, values) {
  let result = contents
  const newline = contents.includes('\r\n') ? '\r\n' : '\n'
  for (const [key, value] of Object.entries(values)) {
    if (/[\r\n'\\]/.test(value)) throw new Error(`Unsupported multiline or escaped value for ${key}`)
    const assignment = new RegExp(`^${key}\\s*=.*$`, 'gm')
    // Single quotes keep Docker Compose from expanding $ in local credentials.
    const line = `${key}='${value}'`
    if (assignment.test(result)) result = result.replace(assignment, () => line)
    else result += `${result.endsWith('\n') ? '' : newline}${line}${newline}`
  }
  return result
}

export async function enableLocalS3(root = repository) {
  const filename = path.join(root, '.env')
  const previous = await readFile(filename, 'utf8')
  const settings = { ...parseEnv(previous), ...process.env }
  const { values, nativeEndpoint } = localS3Settings(settings)
  const source = path.join(runtimeDirectory(root, settings.SNEEPCUT_RUNTIME_ROOT), 'media')
  await validateRuntimePath(source)
  const origins = new Set(['http://localhost:3000', 'http://127.0.0.1:3000', 'http://localhost:3001', 'http://127.0.0.1:3001', 'http://localhost:3002', 'http://localhost:5191'])
  for (const candidate of [settings.APP_URL, settings.VITE_STUDIO_URL, ...(settings.CORS_ORIGINS || '').split(',')].filter(Boolean)) {
    const origin = new URL(candidate)
    if (!['http:', 'https:'].includes(origin.protocol) || !['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname))
      throw new Error('Local S3 cutover requires loopback application origins')
    origins.add(origin.origin)
  }
  const next = updateEnvironment(previous, values)
  const temporaryRoot = path.join(root, '.cache/tmp')
  await mkdir(temporaryRoot, { recursive: true })
  const scratch = await mkdtemp(path.join(temporaryRoot, 'local-s3-'))
  const docker = args => execFileSync('docker', [...compose, ...args], { cwd: root, stdio: 'inherit' })
  let stopped = false
  try {
    docker(['stop', 'backend', 'worker'])
    stopped = true
    execFileSync('go', ['run', './cmd/local-s3'], {
      cwd: path.join(root, 'backend'), stdio: 'inherit',
      env: {
        ...process.env, ...values, AWS_ENDPOINT_URL: nativeEndpoint,
        SNEEPCUT_LOCAL_MEDIA_SOURCE: source,
        SNEEPCUT_LOCAL_S3_ORIGINS: [...origins].join(','),
        GOCACHE: path.join(root, '.cache/go-build'), TMPDIR: scratch
      }
    })
    if (await readFile(filename, 'utf8') !== previous)
      throw new Error('.env changed during migration; refusing to overwrite the newer file')
    const temporaryEnv = path.join(scratch, 'configured.env')
    await writeFile(temporaryEnv, next, { mode: 0o600 })
    await rename(temporaryEnv, filename)
    console.log('Development media now uses local S3. Studio project state is still filesystem-backed.')
  } finally {
    try {
      // On failure, the original .env remains authoritative. Resume its stack.
      if (stopped) docker(['up', '-d', '--no-build'])
    } finally { await rm(scratch, { recursive: true, force: true }) }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href)
  enableLocalS3().catch(error => { console.error(error.message); process.exitCode = 1 })
