import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { parseEnv } from 'node:util'
import { localS3Settings } from './enable-local-s3.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))
const settings = { ...parseEnv(await readFile(new URL('../.env', import.meta.url), 'utf8')), ...process.env }
const { values } = localS3Settings(settings)
assert.equal(settings.SNEEPCUT_STUDIO_STORAGE, 's3', 'Run make studio-s3-up first')
const compose = ['compose', '-f', 'docker-compose.yml', '-f', 'docker-compose.dev.yml']
const effective = execFileSync('docker', [...compose, 'exec', '-T', 'studio', 'sh', '-ec',
  'printf "%s\\n" "$SNEEPCUT_STUDIO_STORAGE" "$SNEEPCUT_STUDIO_S3_ENDPOINT" "$AWS_S3_BUCKET"'], { cwd: root, encoding: 'utf8' }).trim().split(/\r?\n/)
assert.deepEqual(effective, ['s3', values.SNEEPCUT_MEDIA_S3_INTERNAL_ORIGIN, values.AWS_S3_BUCKET], 'Recreate Studio with make studio-s3-up')
execFileSync('docker', [...compose, 'exec', '-T', '-e', 'SNEEPCUT_TEST_STUDIO_S3=1', 'studio', 'bun', 'test',
  'packages/sneepcut-server/src/state-s3.integration.test.ts'], { cwd: root, stdio: 'inherit' })
