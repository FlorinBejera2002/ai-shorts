import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import ts from 'typescript'

const source = readFileSync(new URL('../src/components/studio/studio-client.ts', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } })
const { withStudioPreferences, readStudioPreferences } = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputText).toString('base64')}`)

test('adds theme and lang as query parameters before the project hash', () => {
  assert.equal(
    withStudioPreferences('https://studio.example.com/#project/p_1', { theme: 'dark', lang: 'ro' }),
    'https://studio.example.com/?theme=dark&lang=ro#project/p_1'
  )
  assert.equal(
    withStudioPreferences('https://studio.example.com/#project/p_1', { theme: 'light' }),
    'https://studio.example.com/?theme=light#project/p_1'
  )
})

test('leaves the URL unchanged when no preference is set', () => {
  assert.equal(withStudioPreferences('http://localhost:5191/#project/p_1'), 'http://localhost:5191/#project/p_1')
  assert.equal(withStudioPreferences('https://studio.example.com/', {}), 'https://studio.example.com/')
})

test('reads only valid saved themes and page languages', () => {
  const previousLocalStorage = globalThis.localStorage
  const previousDocument = globalThis.document
  try {
    globalThis.localStorage = { getItem: (key) => (key === 'theme' ? 'dark' : null) }
    globalThis.document = { documentElement: { lang: 'ro-RO' } }
    assert.deepEqual(readStudioPreferences(), { theme: 'dark', lang: 'ro' })

    globalThis.localStorage = { getItem: () => 'system' }
    globalThis.document = { documentElement: { lang: 'fr-FR' } }
    assert.deepEqual(readStudioPreferences(), {})

    globalThis.localStorage = { getItem: () => { throw new Error('blocked') } }
    globalThis.document = { documentElement: { lang: 'en-US' } }
    assert.deepEqual(readStudioPreferences(), { lang: 'en' })
  } finally {
    globalThis.localStorage = previousLocalStorage
    globalThis.document = previousDocument
  }
})

test('the theme saved on the account wins over this browser', () => {
  const previousLocalStorage = globalThis.localStorage
  const previousDocument = globalThis.document
  try {
    globalThis.localStorage = { getItem: () => 'light' }
    globalThis.document = { documentElement: { lang: 'ro' } }
    assert.deepEqual(readStudioPreferences('dark'), { theme: 'dark', lang: 'ro' })
    assert.deepEqual(readStudioPreferences('system'), { lang: 'ro' })
    assert.deepEqual(readStudioPreferences(null), { theme: 'light', lang: 'ro' })
  } finally {
    globalThis.localStorage = previousLocalStorage
    globalThis.document = previousDocument
  }
})
