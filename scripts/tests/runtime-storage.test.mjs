import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, readFile, readlink, readdir, rm, symlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { configureRuntime, copyAndVerifyVolume, runtimeDirectory, validateRuntimePath } from '../runtime-storage.mjs'

const repository = fileURLToPath(new URL('../../', import.meta.url))
const image = 'alpine:3.22@sha256:2e0b81d60597f449baa56dc25d355367869d2dca4cd57e866f1e2b52af3eb55f'
const docker = args => execFileSync('docker', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })

async function scratch(t) {
  const parent = path.join(repository, '.cache/tmp')
  await mkdir(parent, { recursive: true })
  const directory = await mkdtemp(path.join(parent, 'runtime-test-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  return directory
}

test('runtime roots cannot overlap the checkout or inject mount options', () => {
  assert.equal(runtimeDirectory('/work/app'), '/work/ai-shorts-runtime')
  for (const value of ['.', 'media', '..', '/', '../runtime,readonly'])
    assert.throws(() => runtimeDirectory('/work/app', value), /outside the checkout/)
  assert.equal(runtimeDirectory('/work/app', '/srv/runtime'), '/srv/runtime')
})

test('rejects symlinks in existing and new runtime roots', async t => {
  const directory = await scratch(t)
  await mkdir(path.join(directory, 'actual'))
  await symlink('actual', path.join(directory, 'linked'))
  await validateRuntimePath(path.join(directory, 'actual/new'))
  await assert.rejects(validateRuntimePath(path.join(directory, 'linked')), /canonical path/)
  await assert.rejects(validateRuntimePath(path.join(directory, 'linked/new')), /canonical path/)
  await writeFile(path.join(directory, 'file'), 'original')
  await assert.rejects(validateRuntimePath(path.join(directory, 'file')), /directory/)
})

test('copies real volume bytes, empty directories and symlinks without changing the source', async t => {
  const directory = await scratch(t)
  const seed = path.join(directory, 'seed')
  const destination = path.join(directory, 'destination')
  const volume = `sneepcut-runtime-test-${randomUUID()}`
  await mkdir(path.join(seed, 'empty directory'), { recursive: true })
  const filename = 'video ü\nclip.bin'
  const bytes = Buffer.from([0, 255, 10, 13, 42])
  await writeFile(path.join(seed, filename), bytes)
  await symlink(filename, path.join(seed, 'relative link'))
  docker(['volume', 'create', volume])
  t.after(() => docker(['volume', 'rm', volume]))
  docker(['run', '--rm', '--network', 'none',
    '--mount', `type=bind,source=${seed},target=/seed,readonly`,
    '--mount', `type=volume,source=${volume},target=/fixture`, image,
    'sh', '-ec', 'cp -a /seed/. /fixture/'])
  assert.match(await copyAndVerifyVolume(volume, destination), /Verified files: 1/)
  assert.deepEqual(await readFile(path.join(destination, filename)), bytes)
  assert.equal(await readlink(path.join(destination, 'relative link')), filename)
  assert.deepEqual(await readdir(path.join(destination, 'empty directory')), [])
  await assert.rejects(copyAndVerifyVolume(volume, destination), /empty regular directory/)
  const second = path.join(directory, 'second')
  await copyAndVerifyVolume(volume, second)
  assert.deepEqual(await readFile(path.join(second, filename)), bytes)
  await assert.rejects(copyAndVerifyVolume(`${volume}-missing`, path.join(directory, 'missing')), /Source volume is missing/)
  await assert.rejects(copyAndVerifyVolume('../invalid', destination), /Invalid source volume/)
})

test('initialization refuses existing data and preserves ready project storage on repeat runs', async t => {
  const directory = await scratch(t)
  const checkout = path.join(directory, 'checkout')
  const runtime = path.join(directory, 'runtime')
  await mkdir(checkout)
  await mkdir(runtime)
  const project = `sneepcut-runtime-init-test-${randomUUID()}`
  // Never let a developer's environment redirect this fixture to their real data.
  const previous = { root: process.env.SNEEPCUT_RUNTIME_ROOT, project: process.env.COMPOSE_PROJECT_NAME }
  process.env.SNEEPCUT_RUNTIME_ROOT = runtime
  process.env.COMPOSE_PROJECT_NAME = project
  t.after(() => {
    for (const [key, value] of [['SNEEPCUT_RUNTIME_ROOT', previous.root], ['COMPOSE_PROJECT_NAME', previous.project]]) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  })
  await writeFile(path.join(checkout, 'docker-compose.yml'),
    `name: ${project}\nservices:\n  placeholder:\n    image: ${image}\n`)
  await writeFile(path.join(checkout, 'docker-compose.dev.yml'), 'services: {}\n')
  await writeFile(path.join(checkout, '.env'), 'SNEEPCUT_RUNTIME_ROOT=../runtime\n')
  const existing = path.join(runtime, 'original')
  await writeFile(existing, 'precious fixture')
  await assert.rejects(configureRuntime('init', checkout), /refusing to merge or overwrite/)
  assert.equal(await readFile(existing, 'utf8'), 'precious fixture')
  await rm(existing)
  await configureRuntime('init', checkout)
  const saved = path.join(runtime, 'media/saved.bin')
  await writeFile(saved, 'saved fixture')
  await configureRuntime('init', checkout)
  assert.equal(await readFile(saved, 'utf8'), 'saved fixture')
  const markerPath = path.join(runtime, '.sneepcut-runtime.json')
  const marker = JSON.parse(await readFile(markerPath, 'utf8'))
  await writeFile(markerPath, JSON.stringify({ ...marker, project: 'another-project' }))
  await assert.rejects(configureRuntime('init', checkout), /another Compose project/)
})
