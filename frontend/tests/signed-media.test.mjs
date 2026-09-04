import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import ts from 'typescript'

process.env.INTERNAL_API_KEY = 'M'.repeat(32)

const source = readFileSync(
  new URL('../src/lib/signed-url.ts', import.meta.url),
  'utf8'
)
const output = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022
  }
}).outputText
const module = await import(
  `data:text/javascript;base64,${Buffer.from(output).toString('base64')}`
)

test('signs a canonical media path and detects path tampering', () => {
  const signed = module.signMediaUrl('/app/media/clips/user/video.mp4', 60)
  const url = new URL(signed, 'https://app.sneepcut.example')
  assert.equal(url.pathname, '/media/clips/user/video.mp4')
  assert.equal(
    module.verifyMediaSignature(
      url.pathname,
      url.searchParams.get('expires'),
      url.searchParams.get('sig')
    ),
    true
  )
  assert.equal(
    module.verifyMediaSignature(
      '/media/clips/other/video.mp4',
      url.searchParams.get('expires'),
      url.searchParams.get('sig')
    ),
    false
  )
})

test('rejects traversal and query injection in stored paths', () => {
  assert.throws(() => module.signMediaUrl('../../etc/passwd'))
  assert.throws(() => module.signMediaUrl('/app/media/video.mp4?sig=forged'))
  assert.equal(module.resolveMediaUrl('../private.mp4', null), null)
})

test('refreshes persisted local signatures while preserving remote storage URLs', () => {
  const expired =
    'https://app.sneepcut.example/media/clips/user/video.mp4?expires=1&sig=expired'
  const refreshed = new URL(
    module.resolveMediaUrl(null, expired),
    'https://app.sneepcut.example'
  )

  assert.equal(refreshed.pathname, '/media/clips/user/video.mp4')
  assert.ok(Number(refreshed.searchParams.get('expires')) > Date.now() / 1000)
  assert.notEqual(refreshed.searchParams.get('sig'), 'expired')

  const remote = 'https://cdn.sneepcut.example/clips/user/video.mp4'
  assert.equal(module.resolveMediaUrl('clips/user/video.mp4', remote), remote)
})
