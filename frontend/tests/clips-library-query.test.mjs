import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import ts from 'typescript'

async function loadTypeScriptModule(relativePath) {
  const source = readFileSync(new URL(relativePath, import.meta.url), 'utf8')
  const transpiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 }
  })
  return import(`data:text/javascript;base64,${Buffer.from(transpiled.outputText).toString('base64')}`)
}

const lib = await loadTypeScriptModule('../src/lib/clips-library.ts')
const { formatClipAge, formatClipLength } = await loadTypeScriptModule('../src/lib/clip-time.ts')

const P = '00000000-0000-4000-8000-000000000001'
const Q = '00000000-0000-4000-8000-000000000002'
const clip = (id, extra = {}) => ({
  id,
  folderId: null,
  title: `Clip ${id}`,
  duration: 30,
  aspectRatio: '9:16',
  thumbnailUrl: '',
  fileUrl: null,
  hookText: null,
  hasSubtitles: true,
  createdAt: '2026-11-10T10:00:00Z',
  ...extra
})

test('the library flattens every source and resolves a clip to its root project', () => {
  const library = lib.buildClipsLibrary({
    projects: [
      { id: 'job-a', folders: [{ id: 'sub', parentId: P, name: 'Old subfolder' }], clips: [clip('a', { folderId: P }), clip('b', { folderId: 'sub' })] },
      { id: 'job-b', folders: [], clips: [clip('c', { folderId: Q }), clip('d'), clip('e', { folderId: 'missing' })] }
    ],
    collections: [
      { id: P, name: 'Podcast' },
      { id: Q, name: 'Recipes' }
    ]
  })
  assert.deepEqual(library.clips.map((item) => [item.id, item.collectionId]), [['a', P], ['b', P], ['c', Q], ['d', null], ['e', null]])
  assert.deepEqual(library.collections, [{ id: P, name: 'Podcast', count: 2 }, { id: Q, name: 'Recipes', count: 1 }])
  assert.equal(library.unassigned, 2)
  assert.equal(library.clips[0].thumbnailUrl, null, 'Empty thumbnails become null so the tile shows its fallback')
})

test('the URL query is normalised and defaults stay out of links', () => {
  const query = lib.parseClipsQuery({ search: '  launch   teaser ', project: P, aspect: '1:1', subtitles: 'no', sort: 'duration', page: '3' })
  assert.deepEqual(query, { search: 'launch teaser', project: P, aspect: '1:1', subtitles: 'no', sort: 'duration', page: 3 })
  assert.deepEqual(lib.parseClipsQuery({ project: 'nope', aspect: '4:5', sort: 'score', page: '-1' }), {
    search: '', project: 'all', aspect: 'all', subtitles: 'all', sort: 'newest', page: 1
  })
  assert.equal(lib.parseClipsQuery({ score: 'high' }).score, undefined, 'The viral score filter is gone')
  assert.equal(lib.clipsHref(query, { page: 2 }), `/dashboard/clips?project=${P}&search=launch+teaser&aspect=1%3A1&subtitles=no&sort=duration&page=2`)
  assert.equal(lib.clipsHref(query, { aspect: 'all' }), `/dashboard/clips?project=${P}&search=launch+teaser&subtitles=no&sort=duration`, 'Changing a filter resets paging')
  assert.equal(lib.clipsHref(lib.parseClipsQuery({})), '/dashboard/clips')
  assert.deepEqual(lib.activeClipFilters(query), ['aspect', 'subtitles'])
  assert.equal(lib.hasClipsRefinement(lib.parseClipsQuery({ sort: 'oldest' })), false, 'Sorting alone is not a filter')
})

test('selection filters by scope, search, format and subtitles, then sorts', () => {
  const clips = [
    { ...clip('a', { title: 'Bread', duration: 20, createdAt: '2026-11-01T00:00:00Z' }), collectionId: P },
    { ...clip('b', { title: 'Pasta', duration: 50, aspectRatio: '1:1', hasSubtitles: false, createdAt: '2026-11-03T00:00:00Z' }), collectionId: null },
    { ...clip('c', { title: 'Soup', hookText: 'warm bread', duration: 35, createdAt: '2026-11-02T00:00:00Z' }), collectionId: Q }
  ]
  const ids = (query) => lib.selectClips(clips, lib.parseClipsQuery(query)).map((item) => item.id)
  assert.deepEqual(ids({}), ['b', 'c', 'a'])
  assert.deepEqual(ids({ sort: 'oldest' }), ['a', 'c', 'b'])
  assert.deepEqual(ids({ sort: 'duration' }), ['b', 'c', 'a'])
  assert.deepEqual(ids({ project: 'none' }), ['b'])
  assert.deepEqual(ids({ project: Q }), ['c'])
  assert.deepEqual(ids({ search: 'BREAD' }), ['c', 'a'], 'Search also matches the hook')
  assert.deepEqual(ids({ aspect: '1:1' }), ['b'])
  assert.deepEqual(ids({ subtitles: 'yes' }), ['c', 'a'])
})

test('search ignores diacritics on either side', () => {
  const clips = [clip('a', { title: 'Carețas înscrie!' }), clip('b', { title: 'Caretas again' }), clip('c', { title: 'Other' })]
  const ids = (search) => lib.selectClips(clips, lib.parseClipsQuery({ search }), 'ro').map((item) => item.id).sort()
  assert.deepEqual(ids('caretas'), ['a', 'b'])
  assert.deepEqual(ids('Carețas'), ['a', 'b'])
  assert.deepEqual(ids('inscrie'), ['a'])
})

test('pages are clamped and the page window collapses long ranges', () => {
  const items = Array.from({ length: 24 }, (_, index) => index)
  assert.deepEqual(lib.paginateClips(items, 3), { items: [20, 21, 22, 23], page: 3, pages: 3, from: 21, to: 24 })
  assert.equal(lib.paginateClips(items, 99).page, 3)
  assert.deepEqual(lib.paginateClips([], 1), { items: [], page: 1, pages: 1, from: 0, to: 0 })
  assert.deepEqual(lib.pageWindow(2, 3), [1, 2, 3])
  assert.deepEqual(lib.pageWindow(1, 12), [1, 2, 'gap', 12])
  assert.deepEqual(lib.pageWindow(6, 12), [1, 'gap', 5, 6, 7, 'gap', 12])
  assert.deepEqual(lib.pageWindow(12, 12), [1, 'gap', 11, 12])
})

test('clip length and age read like the canvas', () => {
  assert.equal(formatClipLength(38.6), '0:38')
  assert.equal(formatClipLength(64), '1:04')
  const now = Date.parse('2026-11-19T12:00:00Z')
  assert.equal(formatClipAge('2026-11-19T10:00:00Z', 'ro', now), 'acum 2 ore')
  assert.equal(formatClipAge('2026-11-18T12:00:00Z', 'ro', now), 'ieri')
  assert.equal(formatClipAge('2026-11-05T12:00:00Z', 'en', now), '2 weeks ago')
})

test('favorites scope: starred clips only, counted, and a valid URL scope', () => {
  const library = lib.buildClipsLibrary({
    projects: [{ id: 'job', folders: [], clips: [clip('a', { favorite: true }), clip('b'), clip('c', { favorite: true, folderId: P })] }],
    collections: [{ id: P, name: 'Podcast' }]
  })
  assert.equal(library.favorites, 2)
  assert.equal(library.clips.find((item) => item.id === 'b').favorite, false, 'Missing flag means not starred')
  const query = lib.parseClipsQuery({ project: 'favorites' })
  assert.equal(query.project, 'favorites')
  assert.equal(lib.clipsHref(query), '/dashboard/clips?project=favorites')
  assert.deepEqual(
    lib.selectClips(library.clips, query).map((item) => item.id).sort(),
    ['a', 'c']
  )
  assert.equal(lib.isClipsListScope('favorites'), true)
  assert.equal(lib.isClipsListScope(P), false)
})
