import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import ts from 'typescript'

async function loadTypeScriptModule(relativePath) {
  const source = readFileSync(new URL(relativePath, import.meta.url), 'utf8')
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022
    }
  })
  return import(
    `data:text/javascript;base64,${Buffer.from(transpiled.outputText).toString('base64')}`
  )
}

const {
  clipsLibraryHref,
  hasActiveClipFilters,
  isUuid,
  parseClipsLibraryQuery,
  validateClipEditPayload
} = await loadTypeScriptModule('../src/lib/clips-library.ts')

test('normalizes valid clip-library query state', () => {
  assert.deepEqual(
    parseClipsLibraryQuery({
      search: '  launch   teaser ',
      score: 'high',
      aspect: '9:16',
      subtitles: 'yes',
      sort: 'score',
      page: '3'
    }),
    {
      search: 'launch teaser',
      score: 'high',
      aspect: '9:16',
      subtitles: 'yes',
      sort: 'score',
      page: 3
    }
  )
})

test('uses safe defaults and caps untrusted values', () => {
  const query = parseClipsLibraryQuery({
    search: 'x'.repeat(120),
    score: 'DROP TABLE clips',
    aspect: ['invalid', '9:16'],
    subtitles: 'maybe',
    sort: 'filePath',
    page: '-4'
  })
  assert.equal(query.search.length, 80)
  assert.equal(query.score, 'all')
  assert.equal(query.aspect, 'all')
  assert.equal(query.subtitles, 'all')
  assert.equal(query.sort, 'newest')
  assert.equal(query.page, 1)
})

test('builds canonical links and detects filters', () => {
  const query = parseClipsLibraryQuery({
    search: 'launch teaser',
    score: 'high',
    page: '2'
  })
  assert.equal(hasActiveClipFilters(query), true)
  assert.equal(
    clipsLibraryHref(query, { page: 4 }),
    '/dashboard/clips?search=launch+teaser&score=high&page=4'
  )
  assert.equal(
    clipsLibraryHref(parseClipsLibraryQuery({})),
    '/dashboard/clips'
  )
})

test('validates clip identifiers and strict edit payloads', () => {
  assert.equal(isUuid('16fd2706-8baf-433b-82eb-8c7fada847da'), true)
  assert.equal(isUuid('not-an-id'), false)
  assert.deepEqual(
    validateClipEditPayload({
      title: '  Launch clip  ',
      hookText: ' A sharp hook ',
      transcriptText: ''
    }),
    {
      success: true,
      data: {
        title: 'Launch clip',
        hookText: 'A sharp hook',
        transcriptText: null
      }
    }
  )
  assert.equal(
    validateClipEditPayload({ title: 'Clip', userId: 'another-user' }).success,
    false
  )
  assert.equal(validateClipEditPayload({ title: '' }).success, false)
})
