import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'
import * as jsxRuntime from 'react/jsx-runtime'

function load(relative, imports = {}) {
  const exports = {}
  const source = readFileSync(new URL(relative, import.meta.url), 'utf8')
  vm.runInNewContext(
    ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX
      }
    }).outputText,
    {
      exports,
      require: (name) => {
        if (!(name in imports)) throw Error(`Unexpected import ${name}`)
        return imports[name]
      }
    }
  )
  return exports
}

// Values from the vm realm differ in prototype, so deep comparisons normalise them first.
const assertDeep = (actual, expected) =>
  assert.deepStrictEqual(structuredClone(actual), expected)
const useStoryLanguage = () => (en) => en
const types = load('../src/components/story/types.ts')
const footageLogic = load('../src/components/story/story-footage.ts')

let cleanupAvailable = false
const cleanupMock = () => ({
  useAudioCleanupAvailability: () => ({ available: cleanupAvailable, loading: false })
})

// Components are called as functions, so each child appears as an element with a string type.
const { StorySoundSource } = load('../src/components/story/story-sound-source.tsx', {
  react: {},
  'react/jsx-runtime': jsxRuntime,
  './story-segmented-control': { StorySegmentedControl: 'segmented' },
  './use-story-language': { useStoryLanguage },
  './types': types
})
const { StorySoundOptions } = load('../src/components/story/story-sound-options.tsx', {
  react: { useId: () => 'sound-test' },
  'next-intl': { useTranslations: () => (key) => key },
  '@/hooks/use-audio-cleanup-availability': cleanupMock(),
  '@/components/ui/switch': { Switch: 'switch' },
  'react/jsx-runtime': jsxRuntime,
  './story-help': { StoryHelp: 'help' },
  './story-sound-source': { StorySoundSource: 'sound-source' },
  './story-noise-footage-picker': { StoryNoiseFootagePicker: 'footage-picker' },
  './story-footage': footageLogic,
  './types': types,
  './use-story-language': { useStoryLanguage },
  './story-options.module.css': {}
})
const { StoryOptionsInspector } = load('../src/components/story/story-options-inspector.tsx', {
  'react/jsx-runtime': jsxRuntime,
  './story-brand-kit-field': { StoryBrandKitField: 'brand-kit' },
  './story-clip-count': { StoryClipCount: 'clip-count' },
  './story-format': { StoryFormat: 'format' },
  './story-more-options': { StoryMoreOptions: 'more-options' },
  './story-option-section': { StoryOptionSection: 'section' },
  './story-segmented-control': { StorySegmentedControl: 'segmented' },
  './story-sound-options': { StorySoundOptions: 'sound-options' },
  './use-story-language': { useStoryLanguage },
  './types': types,
  './use-story-appearance': {},
  './story-options.module.css': {}
})

function nodes(tree) {
  if (!tree || typeof tree !== 'object') return []
  if (Array.isArray(tree)) return tree.flatMap(nodes)
  return [tree, ...nodes(tree.props?.children)]
}

function ofType(tree, type) {
  return nodes(tree).filter((node) => node.type === type)
}

const appearance = { visible: false, open: false, setOpen() {} }

test('sound source switches between clip sound and narration without losing music or noise choices', () => {
  const options = {
    ...types.defaultOptions,
    audio_cleanup: { enabled: true, asset_ids: ['a'] },
    music: { track_id: 'incompetech:one', source_audio: 'mute', volume: 0.25, sync: true }
  }
  let changed
  const segment = StorySoundSource({
    options,
    hasNarration: false,
    onChange: (value) => {
      changed = value
    }
  })
  assert.equal(segment.type, 'segmented')
  assert.equal(segment.props.value, undefined, 'muted music shows no clip-sound choice')
  segment.props.onChange('voice')
  assert.equal(changed.narration, true)
  assertDeep(changed.audio_cleanup, { enabled: false, asset_ids: ['a'] })
  assert.equal(changed.music.source_audio, 'mute')
  segment.props.onChange('clips')
  assert.equal(changed.narration, false)
  assert.equal(changed.music.source_audio, 'preserve')
  assert.equal(changed.music.volume, 0.25)
})

test('a saved voice recording locks the clip-sound choice until it is removed', () => {
  const segment = StorySoundSource({
    options: { ...types.defaultOptions, narration: true },
    hasNarration: true,
    onChange() {}
  })
  assert.equal(segment.props.value, 'voice')
  assert.equal(segment.props.options[0].disabled, true)
})

test('caption segment writes the matching mode and keeps the rest of the brief untouched', () => {
  const original = {
    ...types.defaultOptions,
    brief: 'Keep every word. No music. Începe cu finalul.',
    language: 'ro',
    target_seconds: 90
  }
  const changes = []
  const tree = StoryOptionsInspector({
    options: original,
    footage: [],
    hasNarration: false,
    appearance,
    onChange: (value) => changes.push(value)
  })
  const captions = ofType(tree, 'segmented').find((node) => node.props.label === 'Captions')
  assertDeep(
    captions.props.options.map((option) => option.value),
    ['all', 'selective', 'off']
  )
  for (const option of captions.props.options) {
    captions.props.onChange(option.value)
    const changed = changes.at(-1)
    assert.equal(changed.caption_mode, option.value)
    assert.equal(changed.captions, option.value !== 'off')
    assert.equal(changed.brief, original.brief)
    assert.equal(changed.language, 'ro')
    assert.equal(changed.target_seconds, 90)
  }
})

test('length segment writes seconds, and narration replaces it with the full-narration sentence', () => {
  const changes = []
  const tree = StoryOptionsInspector({
    options: types.defaultOptions,
    footage: [],
    hasNarration: false,
    appearance,
    onChange: (value) => changes.push(value)
  })
  const length = ofType(tree, 'segmented').find((node) => node.props.label === 'Length')
  assertDeep(
    length.props.options.map((option) => option.value),
    [15, 30, 45, 60, 90]
  )
  length.props.onChange(60)
  assert.equal(changes.at(-1).target_seconds, 60)

  const narrated = StoryOptionsInspector({
    options: { ...types.defaultOptions, narration: true },
    footage: [],
    hasNarration: true,
    appearance,
    onChange() {}
  })
  assert.equal(
    ofType(narrated, 'segmented').some((node) => node.props.label === 'Length'),
    false
  )
  assert.ok(
    nodes(narrated).some(
      (node) => node.props.children === 'Matches your full narration.'
    )
  )
})

test('format and clip count controls write aspect ratio and the clip count', () => {
  const changes = []
  const tree = StoryOptionsInspector({
    options: types.defaultOptions,
    footage: [],
    hasNarration: false,
    appearance,
    onChange: (value) => changes.push(value)
  })
  const format = ofType(tree, 'format')[0]
  format.props.onChange('16:9')
  assert.equal(changes.at(-1).aspect_ratio, '16:9')
  const clips = ofType(tree, 'clip-count')[0]
  assert.equal(clips.props.value, 0)
  clips.props.onChange(8)
  assert.equal(changes.at(-1).clip_count, 8)
})

test('brand kit choice writes use_brand_kit and clears a caption style when the kit is used', () => {
  const changes = []
  const options = { ...types.defaultOptions, caption_style: { font: 'x' } }
  const tree = StoryOptionsInspector({
    options,
    footage: [],
    hasNarration: false,
    appearance,
    onChange: (value) => changes.push(value)
  })
  const kit = ofType(tree, 'brand-kit')[0]
  kit.props.onChange(true)
  assert.equal(changes.at(-1).use_brand_kit, true)
  assert.equal(changes.at(-1).caption_style, undefined)
  kit.props.onChange(false)
  assertDeep(changes.at(-1).caption_style, { font: 'x' })
})

test('noise reduction cannot be enabled while unavailable; saved selections stay reversible', () => {
  let changed
  const toggle = (enabled, available) => {
    cleanupAvailable = available
    const tree = StorySoundOptions({
      options: { ...types.defaultOptions, audio_cleanup: { enabled, asset_ids: [] } },
      footage: [],
      hasNarration: false,
      onChange: (value) => {
        changed = value
      }
    })
    return ofType(tree, 'switch')[0]
  }

  const off = toggle(false, false)
  assert.equal(off.props.disabled, true)
  off.props.onCheckedChange(true)
  assert.equal(changed, undefined)

  const saved = toggle(true, false)
  assert.equal(saved.props.checked, true)
  assert.equal(saved.props.disabled, false)
  saved.props.onCheckedChange(false)
  assertDeep(changed.audio_cleanup, { enabled: false, asset_ids: [] })

  const available = toggle(false, true)
  assert.equal(available.props.disabled, false)
  available.props.onCheckedChange(true)
  assert.equal(changed.audio_cleanup.enabled, true)
  cleanupAvailable = false
})

test('noise footage picker appears only when reduction is on and writes explicit footage choices', () => {
  const footage = [
    { id: 'a', order: 0, kind: 'video', name: 'a.mp4' },
    { id: 'b', order: 1, kind: 'video', name: 'b.mp4' }
  ]
  cleanupAvailable = true
  let changed
  const render = (enabled) =>
    StorySoundOptions({
      options: { ...types.defaultOptions, audio_cleanup: { enabled, asset_ids: [] } },
      footage,
      hasNarration: false,
      onChange: (value) => {
        changed = value
      }
    })
  assert.equal(ofType(render(false), 'footage-picker').length, 0)
  const picker = ofType(render(true), 'footage-picker')[0]
  assertDeep(picker.props.selectedIDs, ['a', 'b'])
  picker.props.onToggle('b')
  assertDeep(changed.audio_cleanup, { enabled: true, asset_ids: ['a'] })
  cleanupAvailable = false
})

test('new stories keep source order with all-dialogue captions by default; legacy projects keep their choice', () => {
  assert.equal(types.defaultOptions.caption_mode, 'all')
  assert.equal(types.defaultOptions.captions, true)
  assert.equal(types.defaultOptions.audio_cleanup.enabled, true)
  assert.equal(types.defaultOptions.audio_cleanup.asset_ids.length, 0)
  assert.equal(types.defaultOptions.preserve_order, true)
  assert.equal(types.defaultOptions.clip_count, 0)
  assert.equal(types.storyCaptionMode({ captions: true }), 'all')
  assert.equal(types.storyCaptionMode({ captions: false }), 'off')
  assert.equal(
    types.storyCaptionMode({ captions: true, caption_mode: 'selective' }),
    'selective'
  )
})

test('clip count normalizes to Auto or 1..30 and manual entries are clamped', () => {
  assert.equal(types.normalizeClipCount(undefined), 0)
  assert.equal(types.normalizeClipCount(0), 0)
  assert.equal(types.normalizeClipCount(-4), 0)
  assert.equal(types.normalizeClipCount('abc'), 0)
  assert.equal(types.normalizeClipCount(3.9), 3)
  assert.equal(types.normalizeClipCount(31), 30)
  assert.equal(types.clampManualClipCount(0), 1)
  assert.equal(types.clampManualClipCount(45), 30)
  assert.equal(types.clampManualClipCount(12), 12)
  assert.equal(types.clampManualClipCount(Number.NaN), 1)
  assert.equal(types.storyClipCount({ ...types.defaultOptions, clip_count: 99 }), 30)
})

test('clip count and noise footage choices make a saved draft dirty', () => {
  const saved = { ...types.defaultOptions, audio_cleanup: { enabled: true, asset_ids: ['a'] } }
  assert.equal(types.storyOptionsEqual(saved, { ...saved }), true)
  assert.equal(
    types.storyOptionsEqual({ ...saved, clip_count: 5 }, saved),
    false
  )
  assert.equal(
    types.storyOptionsEqual(
      { ...saved, audio_cleanup: { enabled: true, asset_ids: ['a', 'b'] } },
      saved
    ),
    false
  )
})

test('recoverable failures can change their request without re-uploading; completed and active versions are protected', () => {
  for (const status of ['draft', 'failed', 'cancelled']) {
    assert.equal(
      types.canEditStorySources({ status, current_version: 0, versions: [] }),
      true
    )
  }
  for (const status of ['pending', 'analyzing', 'editing', 'ready', 'needs_review']) {
    assert.equal(
      types.canEditStorySources({ status, current_version: 0, versions: [] }),
      false
    )
  }
  assert.equal(
    types.canEditStorySources({
      status: 'failed',
      current_version: 1,
      versions: []
    }),
    false
  )
  assert.equal(
    types.canEditStorySources({
      status: 'failed',
      current_version: 0,
      versions: [{ accepted: true }]
    }),
    false
  )
})

test('a server-normalized legacy caption choice is saved, not a permanently dirty draft', () => {
  const { caption_mode: _legacyMode, ...legacy } = {
    ...types.defaultOptions,
    captions: true
  }
  const saved = { ...legacy, caption_mode: 'all', narration: false }
  assert.equal(types.storyOptionsEqual(legacy, saved), true)
  assert.equal(
    types.storyOptionsEqual({ ...legacy, caption_mode: 'selective' }, saved),
    false
  )
  assert.equal(
    types.storyOptionsEqual({ ...legacy, brief: 'Do not trim the ending.' }, saved),
    false
  )
  assert.equal(types.storyOptionsEqual({ ...legacy, narration: true }, saved), false)
})
