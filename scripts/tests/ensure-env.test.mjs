import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { ensureEnvironment, ensureStudioSecret } from '../ensure-env.mjs'

test('generates a unique secret once without changing other environment values', () => {
  const source = '# local\r\nTOKEN="keep $literal"\r\nSTUDIO_AGENT_SECRET=\r\n'
  const first = ensureStudioSecret(source)
  assert.match(first, /^STUDIO_AGENT_SECRET=[a-f0-9]{64}\r?$/m)
  assert.ok(first.startsWith('# local\r\nTOKEN="keep $literal"\r\n'))
  assert.equal(ensureStudioSecret(first), first)
  assert.notEqual(ensureStudioSecret(source), first)
})

test('retains an existing quoted secret and rejects weak values without replacing them', () => {
  const contents = `STUDIO_AGENT_SECRET="${'a'.repeat(40)}"\n`
  assert.equal(ensureStudioSecret(contents), contents)
  assert.throws(() => ensureStudioSecret('STUDIO_AGENT_SECRET=short\n'), /existing value was not changed/)
  assert.match(ensureStudioSecret('EXISTING=value'), /^EXISTING=value\nSTUDIO_AGENT_SECRET=/)
})

test('setup creates a missing env file but never replaces an existing configuration', async () => {
  const tempRoot = fileURLToPath(new URL('../../.cache/tmp/', import.meta.url))
  await mkdir(tempRoot, { recursive: true })
  const root = await mkdtemp(path.join(tempRoot, 'ensure-env-'))
  try {
    await writeFile(path.join(root, '.env.example'), 'SETTING=default\nSTUDIO_AGENT_SECRET=\n')
    assert.deepEqual(await ensureEnvironment(root), { created: true, generatedStudioSecret: true })
    const first = await readFile(path.join(root, '.env'), 'utf8')
    await writeFile(path.join(root, '.env'), first.replace('SETTING=default', 'SETTING=custom'))
    assert.deepEqual(await ensureEnvironment(root), { created: false, generatedStudioSecret: false })
    assert.equal(await readFile(path.join(root, '.env'), 'utf8'), first.replace('SETTING=default', 'SETTING=custom'))
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
