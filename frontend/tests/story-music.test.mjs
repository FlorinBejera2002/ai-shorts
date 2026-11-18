import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'
import * as jsxRuntime from 'react/jsx-runtime'

const exports = {}
vm.runInNewContext(
  ts.transpileModule(
    readFileSync(
      new URL('../src/components/story/types.ts', import.meta.url),
      'utf8'
    ),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022
      }
    }
  ).outputText,
  { exports }
)
const { defaultOptions, storyOptionsEqual } = exports

test('legacy drafts treat omitted and cleared music equally, without adding music by default', () => {
  assert.equal(defaultOptions.music, undefined)
  assert.equal(
    storyOptionsEqual(defaultOptions, { ...defaultOptions, music: null }),
    true
  )
})

test('saving a music choice tracks its identity, volume and sync independently', () => {
  const saved = {
    ...defaultOptions,
    music: { track_id: 'incompetech:one', volume: 0.18, sync: true }
  }
  assert.equal(storyOptionsEqual(structuredClone(saved), saved), true)
  for (const music of [
    null,
    { ...saved.music, track_id: 'incompetech:two' },
    { ...saved.music, volume: 0 },
    { ...saved.music, sync: false },
    { ...saved.music, start_seconds: 12 },
    { ...saved.music, end_seconds: 32 },
    { ...saved.music, loop: false },
    { ...saved.music, source_audio: 'mute' },
    { ...saved.music, upload_reference: 'uploads/user/song.wav' }
  ]) {
    assert.equal(storyOptionsEqual({ ...saved, music }, saved), false)
  }
  assert.equal(storyOptionsEqual(saved, defaultOptions), false)
})

const model = {}
vm.runInNewContext(
  ts.transpileModule(
    readFileSync(
      new URL('../src/components/story/story-music-model.ts', import.meta.url),
      'utf8'
    ),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022
      }
    }
  ).outputText,
  { exports: model }
)

test('excerpt validation prevents backwards, nonfinite and excessively long ranges', () => {
  for (const music of [
    undefined,
    { start_seconds: 0, end_seconds: 0 },
    { start_seconds: 60, end_seconds: 90 },
    { start_seconds: 1200, end_seconds: 1800 }
  ])
    assert.equal(model.musicRangeProblem(music), null)
  for (const music of [
    { start_seconds: NaN },
    { start_seconds: -1 },
    { start_seconds: 1800 },
    { start_seconds: 10, end_seconds: 9 },
    { start_seconds: 10, end_seconds: 10.5 },
    { start_seconds: 0, end_seconds: 601 },
    { end_seconds: Infinity }
  ])
    assert.ok(model.musicRangeProblem(music))
})

test('audio upload rejects unsupported, empty and oversized files before transmission', () => {
  assert.equal(
    model.musicUploadProblem({ name: 'SONG.FLAC', size: 1024 }),
    null
  )
  for (const file of [
    { name: 'song.exe', size: 100 },
    { name: 'song.wav', size: 0 },
    { name: 'song.mp3', size: 128 * 1024 * 1024 + 1 }
  ])
    assert.ok(model.musicUploadProblem(file))
})

test('legacy music settings normalize omitted excerpt and loop defaults without dirtying drafts', () => {
  const saved = {
    ...defaultOptions,
    music: { track_id: 'incompetech:one', volume: 0.18, sync: true }
  }
  assert.equal(
    storyOptionsEqual(saved, {
      ...saved,
      music: { ...saved.music, start_seconds: 0, end_seconds: 0, loop: true, source_audio: 'preserve' }
    }),
    true
  )
})

const output = {}
vm.runInNewContext(
  ts.transpileModule(
    readFileSync(
      new URL(
        '../src/components/story/story-music-credits.tsx',
        import.meta.url
      ),
      'utf8'
    ),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX
      }
    }
  ).outputText,
  {
    exports: output,
    require: (name) =>
      ({
        react: { useState: (value) => [value, () => {}] },
        'react/jsx-runtime': jsxRuntime,
        'lucide-react': { Check: 'svg', Copy: 'svg' },
        '@/components/ui/button': { Button: 'button' },
        './use-story-language': { useStoryLanguage: () => (english) => english }
      })[name]
  }
)
function descendants(node) {
  if (Array.isArray(node)) return node.flatMap(descendants)
  if (!node || typeof node !== 'object') return []
  return [node, ...descendants(node.props?.children)]
}
function renderedText(node) {
  if (Array.isArray(node)) return node.map(renderedText).join(' ')
  if (!node || typeof node === 'boolean') return ''
  if (typeof node !== 'object') return String(node)
  return renderedText(node.props?.children)
}

test('music results distinguish changed cuts from verified accent alignment and accept legacy outputs', () => {
  const music = { title: 'Song', attribution: '', sync_status: 'partial', adjusted_cuts: 4 }
  const legacy = renderedText(output.StoryMusicCredits({ music }))
  assert.ok(legacy.includes('4 cuts adjusted.'))
  assert.equal(legacy.includes('measured rhythmic accents'), false)
  const measured = renderedText(output.StoryMusicCredits({ music: { ...music, aligned_cuts: 2 } }))
  assert.ok(measured.includes('4 cuts adjusted.'))
  assert.ok(measured.includes('2 cuts aligned to measured rhythmic accents.'))
})
test('uploaded music output shows its actual fallback explanation without fabricated credits or empty links', () => {
  const explanation =
    'No reliable rhythm was found; complete actions and original timing were preserved.'
  const tree = output.StoryMusicCredits({
    music: {
      title: 'my-song.wav',
      attribution: '',
      artist: '',
      license: '',
      license_url: '',
      source_url: '',
      sync_status: 'unchanged',
      strategy: 'content',
      adjusted_cuts: 0,
      explanation
    }
  })
  assert.equal(tree.props['aria-label'], 'Music')
  assert.equal(
    descendants(tree).filter(
      (node) => node.type === 'a' || node.type === 'button'
    ).length,
    0
  )
  assert.ok(renderedText(tree).includes(explanation))
  assert.equal(renderedText(tree).includes('CC BY'), false)
  assert.equal(renderedText(tree).includes('Copy music credits'), false)
})
