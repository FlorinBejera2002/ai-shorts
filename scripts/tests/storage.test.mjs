import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { clean, generatedRoot, inventory, limits, summarize, violations } from '../storage.mjs'

async function fixture(t) {
  const root = await mkdtemp(path.join(tmpdir(), 'sneepcut-storage-test-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  return root
}

async function put(root, relative, text = 'fixture') {
  const absolute = path.join(root, relative)
  await mkdir(path.dirname(absolute), { recursive: true })
  await writeFile(absolute, text)
}

test('reports dependencies and protected data separately from disposable outputs', async t => {
  const root = await fixture(t)
  await put(root, '.cache/go-build/item', 'build')
  await put(root, '.cache/toolchains/go/bin/go.exe', 'tool')
  await put(root, '.cache/whatsapp-story-evaluation/input/customer.mp4', 'original')
  await put(root, '.cache/transitions-db/data/database', 'database')
  await put(root, '.cache/unknown-backup.tar', 'backup')
  await put(root, 'frontend/node_modules/pkg/index.js', 'dependency')
  const report = summarize(await inventory(root))
  assert.equal(report.generatedBytes, 5)
  assert.deepEqual(report.targets.map(item => item.path), ['.cache/go-build'])
  assert.equal(report.categories.find(item => item.name === 'Installed dependencies').bytes, 10)
  assert.equal(report.totalBytes, 41)
  assert.deepEqual(report.errors, [])
})

test('preview never deletes; apply removes only allowlisted paths', async t => {
  const root = await fixture(t)
  await put(root, '.cache/tmp/run/output', 'result')
  await put(root, '.cache/go-mod/module/source', 'dependency')
  await put(root, '.env', 'private')
  const targets = summarize(await inventory(root)).targets
  await clean(root, targets, { tracked: [] })
  assert.equal(await readFile(path.join(root, '.cache/tmp/run/output'), 'utf8'), 'result')
  await clean(root, targets, { apply: true, tracked: [] })
  assert.equal((await inventory(root)).files.some(item => item.path.startsWith('.cache/tmp/')), false)
  assert.equal(await readFile(path.join(root, '.env'), 'utf8'), 'private')
  assert.equal(await readFile(path.join(root, '.cache/go-mod/module/source'), 'utf8'), 'dependency')
})

test('protects tracked files and validates all targets before any deletion', async t => {
  const root = await fixture(t)
  await put(root, '.cache/tmp/output', 'first')
  await put(root, 'frontend/dist/important.js', 'tracked')
  await assert.rejects(clean(root, [{ path: '.cache/tmp' }, { path: 'frontend/dist' }], {
    apply: true, tracked: ['frontend/dist/important.js'],
  }), /Tracked files/)
  assert.equal(await readFile(path.join(root, '.cache/tmp/output'), 'utf8'), 'first')
})

test('loads the real Git index before permitting cleanup', async t => {
  const root = await fixture(t)
  execFileSync('git', ['init', '--quiet'], { cwd: root, windowsHide: true })
  await put(root, 'frontend/dist/important.js', 'tracked')
  execFileSync('git', ['add', 'frontend/dist/important.js'], { cwd: root, windowsHide: true })
  await assert.rejects(clean(root, [{ path: 'frontend/dist' }], { apply: true }), /Tracked files/)
  assert.equal(await readFile(path.join(root, 'frontend/dist/important.js'), 'utf8'), 'tracked')
})

test('rejects history, originals, toolchains, databases, unknown archives and path escapes', async t => {
  const root = await fixture(t)
  for (const relative of ['.git', '.editor-upstream-history', '.cache/toolchains', '.cache/transitions-db',
    '.cache/whatsapp-story-evaluation', '.cache/story-evaluation', '.cache/backup.tar', '../.cache/tmp']) {
    await assert.rejects(clean(root, [{ path: relative }], { apply: true, tracked: [] }), /Protected cleanup target/)
  }
  assert.equal(generatedRoot('.cache/sneepcut-release-deadbeef.tar.gz'), '.cache/sneepcut-release-deadbeef.tar.gz')
  assert.equal(generatedRoot('.cache/go-build-backup/database'), undefined)
})

test('does not follow directory links and rejects linked cleanup ancestors', async t => {
  const root = await fixture(t)
  const outside = await fixture(t)
  await put(outside, 'original', 'keep')
  await mkdir(path.join(root, '.cache'))
  await symlink(outside, path.join(root, '.cache/tmp'), process.platform === 'win32' ? 'junction' : 'dir')
  const scan = await inventory(root)
  assert.equal(scan.skippedLinks, 1)
  assert.equal(scan.files.length, 0)
  await assert.rejects(clean(root, [{ path: '.cache/tmp' }], { apply: true, tracked: [] }), /Linked cleanup path/)
  assert.equal(await readFile(path.join(outside, 'original'), 'utf8'), 'keep')
})

test('rejects nested links inside an otherwise allowlisted target', async t => {
  const root = await fixture(t)
  const outside = await fixture(t)
  await mkdir(path.join(root, '.cache/tmp'), { recursive: true })
  await put(outside, 'original', 'keep')
  await symlink(outside, path.join(root, '.cache/tmp/linked'), process.platform === 'win32' ? 'junction' : 'dir')
  await assert.rejects(clean(root, [{ path: '.cache/tmp' }], { apply: true, tracked: [] }), /Unsafe or unreadable/)
  assert.equal(await readFile(path.join(outside, 'original'), 'utf8'), 'keep')
})

test('storage check flags generated growth, unknown cache growth and incomplete scans', () => {
  const report = { generatedBytes: limits.generated + 1, cacheBytes: limits.cache + 1,
    totalBytes: limits.total + 1, errors: [{ path: '.cache/inaccessible', code: 'EACCES' }] }
  assert.equal(violations(report).length, 4)
  assert.equal(violations({ ...report, generatedBytes: 0, cacheBytes: 0, totalBytes: 0, errors: [] }).length, 0)
})
