import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../../', import.meta.url))
const storageKeys = [
  'STORAGE_TYPE', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_SESSION_TOKEN',
  'AWS_REGION', 'AWS_S3_BUCKET', 'AWS_ENDPOINT_URL', 'AWS_S3_FORCE_PATH_STYLE',
  'AWS_PUBLIC_BASE_URL', 'SNEEPCUT_STUDIO_STORAGE', 'SNEEPCUT_STUDIO_S3_ENDPOINT',
  'SNEEPCUT_STUDIO_S3_PREFIX', 'SNEEPCUT_MEDIA_S3_ORIGIN', 'SNEEPCUT_MEDIA_S3_INTERNAL_ORIGIN'
]

async function configuration(values) {
  const parent = path.join(root, '.cache/tmp')
  await mkdir(parent, { recursive: true })
  const scratch = await mkdtemp(path.join(parent, 'production-storage-'))
  const file = path.join(scratch, 'environment')
  const settings = {
    DB_PASSWORD: 'synthetic-password', INTERNAL_API_KEY: 'a'.repeat(64),
    UPLOAD_TOKEN_SECRET: 'b'.repeat(64), JWT_SECRET: 'c'.repeat(64),
    STUDIO_AGENT_SECRET: 'd'.repeat(64),
    ...Object.fromEntries(storageKeys.map(key => [key, ''])), ...values
  }
  try {
    await writeFile(file, Object.entries(settings).map(([key, value]) => `${key}=${value}\n`).join(''))
    return JSON.parse(execFileSync('docker', [
      'compose', '--env-file', file, '-f', path.join(root, 'docker-compose.production.yml'),
      'config', '--format', 'json'
    ], {
      cwd: root, encoding: 'utf8', timeout: 30000,
      env: { ...process.env, ...settings, PRODUCTION_ENV_FILE: file }
    }))
  } finally {
    const relative = path.relative(parent, path.resolve(scratch))
    assert.ok(relative && !relative.startsWith('..') && !path.isAbsolute(relative))
    await rm(scratch, { recursive: true, force: true })
  }
}

test('production storage remains local until explicitly configured', async () => {
  const { services } = await configuration({})
  for (const name of ['backend', 'worker']) assert.equal(services[name].environment.STORAGE_TYPE, 'local')
  assert.equal(services.studio.environment.SNEEPCUT_STUDIO_STORAGE, 'local')
})

test('production S3 configuration reaches storage services without exposing keys to web apps', async () => {
  const settings = {
    STORAGE_TYPE: 's3', AWS_ACCESS_KEY_ID: 'synthetic-access',
    AWS_SECRET_ACCESS_KEY: 'synthetic-secret', AWS_SESSION_TOKEN: 'synthetic-session', AWS_REGION: 'hel1',
    AWS_S3_BUCKET: 'synthetic-production', AWS_ENDPOINT_URL: 'https://hel1.your-objectstorage.com',
    AWS_PUBLIC_BASE_URL: 'https://synthetic-production.hel1.your-objectstorage.com',
    AWS_S3_FORCE_PATH_STYLE: 'false',
    SNEEPCUT_STUDIO_STORAGE: 's3',
    SNEEPCUT_STUDIO_S3_ENDPOINT: 'https://hel1.your-objectstorage.com',
    SNEEPCUT_STUDIO_S3_PREFIX: 'studio/cutover-synthetic-final',
    SNEEPCUT_MEDIA_S3_ORIGIN: 'https://synthetic-production.hel1.your-objectstorage.com',
    SNEEPCUT_MEDIA_S3_INTERNAL_ORIGIN: 'https://synthetic-production.hel1.your-objectstorage.com'
  }
  const { services } = await configuration(settings)
  for (const name of ['backend', 'worker', 'studio']) {
    for (const key of ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_SESSION_TOKEN', 'AWS_REGION', 'AWS_S3_BUCKET', 'AWS_ENDPOINT_URL']) {
      assert.equal(services[name].environment[key], settings[key], `${name}: ${key}`)
    }
  }
  assert.equal(services.backend.environment.STORAGE_TYPE, 's3')
  assert.equal(services.worker.environment.STORAGE_TYPE, 's3')
  assert.equal(services.studio.environment.SNEEPCUT_STUDIO_STORAGE, 's3')
  for (const key of ['SNEEPCUT_STUDIO_S3_ENDPOINT', 'SNEEPCUT_STUDIO_S3_PREFIX', 'SNEEPCUT_MEDIA_S3_ORIGIN', 'SNEEPCUT_MEDIA_S3_INTERNAL_ORIGIN']) {
    assert.equal(services.studio.environment[key], settings[key], key)
  }
  for (const name of ['backend', 'worker']) {
    for (const key of ['AWS_PUBLIC_BASE_URL', 'AWS_S3_FORCE_PATH_STYLE']) {
      assert.equal(services[name].environment[key], settings[key], `${name}: ${key}`)
    }
  }
  for (const name of ['frontend', 'landing', 'admin']) {
    for (const key of ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_SESSION_TOKEN']) {
      assert.equal(services[name].environment?.[key], undefined, `${name} exposes ${key}`)
      assert.equal(services[name].build?.args?.[key], undefined, `${name} builds with ${key}`)
    }
  }
})
