import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'
import { loadTsModule } from './support/load-ts-module.mjs'

const exports = {}
vm.runInNewContext(
  ts.transpileModule(
    readFileSync(new URL('../src/components/create/youtube-link-model.ts', import.meta.url), 'utf8'),
    {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
    }
  ).outputText,
  { exports, URL }
)

test('pasted video URLs select one canonical video and discard tracking', () => {
  for (const value of [
    'https://youtu.be/aqz-KE-bpKQ?si=tracking',
    'https://m.youtube.com/shorts/aqz-KE-bpKQ',
    'https://youtube.com/watch?v=aqz-KE-bpKQ&list=ignored'
  ]) {
    assert.equal(exports.canonicalYouTubeLink(value), 'https://www.youtube.com/watch?v=aqz-KE-bpKQ')
  }
})

test('pasted URLs reject playlists, credentials, arbitrary hosts and ambiguous videos', () => {
  for (const value of [
    '',
    'not a URL',
    'https://youtube.com.evil.invalid/watch?v=aqz-KE-bpKQ',
    'https://youtube.com/playlist?list=test',
    'https://user@youtube.com/watch?v=aqz-KE-bpKQ',
    'https://127.0.0.1/watch?v=aqz-KE-bpKQ',
    'https://youtube.com/watch?v=aqz-KE-bpKQ&v=xxxxxxxxxxx'
  ]) {
    assert.equal(exports.canonicalYouTubeLink(value), null, value)
  }
})

const requestWith = (apiFetch) =>
  loadTsModule('src/components/create/youtube-link-request.ts', {
    '@/lib/auth': { apiFetch }
  }).requestYouTubeLink

test('link creation sends the canonical source and returns a validated queued job', async () => {
  const id = '00000000-0000-4000-8000-000000000090'
  let sent
  const request = requestWith(async (path, init) => {
    sent = { path, method: init.method, body: JSON.parse(init.body) }
    return Response.json({ id }, { status: 201 })
  })
  const body = { source_type: 'youtube', source_url: 'https://www.youtube.com/watch?v=aqz-KE-bpKQ' }
  const result = await request(body)
  assert.equal(result.kind, 'queued')
  assert.equal(result.id, id)
  assert.deepEqual(sent, { path: '/api/jobs', method: 'POST', body })
})

test('link creation classifies credit and rate limits', async () => {
  for (const [status, kind] of [
    [402, 'limit'],
    [429, 'rateLimited'],
    [422, 'failed'],
    [503, 'failed']
  ]) {
    assert.equal((await requestWith(async () => Response.json({}, { status }))({})).kind, kind)
  }
})

test('link creation rejects malformed success responses', async () => {
  for (const data of [{}, { id: '../other' }, { id: '-'.repeat(36) }]) {
    assert.equal((await requestWith(async () => Response.json(data, { status: 201 }))({})).kind, 'failed')
  }
  assert.equal(
    (await requestWith(async () => new Response('invalid json', { status: 201 }))({})).kind,
    'failed'
  )
})

test('a network failure settles and a later link request can succeed', async () => {
  let attempts = 0
  const request = requestWith(async () => {
    if (++attempts === 1) throw new Error('offline')
    return Response.json({ id: '00000000-0000-4000-8000-000000000090' }, { status: 201 })
  })
  assert.equal((await request({})).kind, 'failed')
  assert.equal((await request({})).kind, 'queued')
})
