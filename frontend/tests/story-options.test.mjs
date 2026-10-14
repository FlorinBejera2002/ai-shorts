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
const types = load('../src/components/story/types.ts')
let cleanupAvailable = false
const { StoryOptionsPanel } = load(
  '../src/components/story/story-options.tsx',
  {
    react: { useId: () => 'caption-test' },
    'next-intl': { useTranslations: () => (key) => key },
    '@/hooks/use-audio-cleanup-availability': {
      useAudioCleanupAvailability: () => ({
        available: cleanupAvailable,
        loading: false
      })
    },
    'react/jsx-runtime': jsxRuntime,
    'lucide-react': { ChevronDown: 'svg' },
    '@/components/ui/textarea': { Textarea: 'textarea' },
    '@/components/ui/button': { Button: 'button' },
    './story-help': { StoryHelp: 'aside' },
    './story-appearance': { StoryAppearance: 'section' },
    './story-music': { StoryMusic: 'section' },
    './use-story-language': { useStoryLanguage: () => (english) => english },
    './types': types
  }
)
function nodes(tree) {
  if (!tree || typeof tree !== 'object') return []
  if (Array.isArray(tree)) return tree.flatMap(nodes)
  return [tree, ...nodes(tree.props?.children)]
}

test('new stories keep source order and do not silently add captions; legacy projects keep their choice', () => {
  assert.equal(types.defaultOptions.caption_mode, 'off')
  assert.equal(types.defaultOptions.captions, false)
  assert.equal(types.defaultOptions.preserve_order, true)
  assert.equal(types.storyCaptionMode({ captions: true }), 'all')
  assert.equal(types.storyCaptionMode({ captions: false }), 'off')
  assert.equal(
    types.storyCaptionMode({ captions: true, caption_mode: 'selective' }),
    'selective'
  )
})

test('each caption choice sends its distinct mode while preserving original instructions and settings', () => {
  const original = {
    ...types.defaultOptions,
    brief: 'Keep every word. No music. Începe cu finalul.',
    language: 'ro',
    target_seconds: 90
  }
  let changed
  const form = StoryOptionsPanel({
    options: original,
    disabled: false,
    onChange: (value) => {
      changed = value
    }
  })
  const radios = nodes(form).filter(
    (node) => node.type === 'input' && node.props.type === 'radio'
  )
  assert.deepEqual(
    radios.map((node) => node.props.value),
    ['all', 'selective', 'off']
  )
  assert.equal(radios.filter((node) => node.props.checked).length, 1)
  for (const radio of radios) {
    radio.props.onChange()
    assert.equal(changed.caption_mode, radio.props.value)
    assert.equal(changed.captions, radio.props.value !== 'off')
    assert.equal(changed.brief, original.brief)
    assert.equal(changed.language, 'ro')
    assert.equal(changed.preserve_order, true)
    assert.equal(changed.target_seconds, 90)
  }
})

test('recoverable failures can change their request without re-uploading; completed and active versions are protected', () => {
  for (const status of ['draft', 'failed', 'cancelled']) {
    assert.equal(
      types.canEditStorySources({ status, current_version: 0, versions: [] }),
      true
    )
  }
  for (const status of [
    'pending',
    'analyzing',
    'editing',
    'ready',
    'needs_review'
  ]) {
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
    types.storyOptionsEqual(
      { ...legacy, brief: 'Do not trim the ending.' },
      saved
    ),
    false
  )
  assert.equal(
    types.storyOptionsEqual({ ...legacy, narration: true }, saved),
    false
  )
})

test('unavailable cleanup cannot be enabled; saved selections remain reversible', () => {
  cleanupAvailable = false
  let changed
  const toggle = (enabled) =>
    nodes(
      StoryOptionsPanel({
        options: { ...types.defaultOptions, audio_cleanup: { enabled } },
        disabled: false,
        onChange: (value) => {
          changed = value
        }
      })
    ).find(
      (node) =>
        node.type === 'input' &&
        node.props['aria-label'] === 'Reduce background noise'
    )
  const off = toggle(false)
  assert.equal(off.props.disabled, true)
  off.props.onChange({ target: { checked: true } })
  assert.equal(changed, undefined)
  const saved = toggle(true)
  assert.equal(saved.props.checked, true)
  assert.equal(saved.props.disabled, false)
  saved.props.onChange({ target: { checked: false } })
  assert.equal(changed.audio_cleanup.enabled, false)
  cleanupAvailable = true
  const available = toggle(false)
  assert.equal(available.props.disabled, false)
  available.props.onChange({ target: { checked: true } })
  assert.equal(changed.audio_cleanup.enabled, true)
  cleanupAvailable = false
})
