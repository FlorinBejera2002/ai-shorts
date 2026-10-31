import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

function compile(path) {
  return ts.transpileModule(
    readFileSync(new URL(path, import.meta.url), 'utf8'),
    {
      compilerOptions: {
        jsx: ts.JsxEmit.ReactJSX,
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022
      }
    }
  ).outputText
}

function load(path, require) {
  const exports = {}
  vm.runInNewContext(compile(path), { exports, require })
  return exports
}

const publishing = load('../src/lib/publishing.ts', () => ({}))
const options = load('../src/components/script/script-options.ts', () => ({}))
const radioKeys = load('../src/components/script/script-radio-keys.ts', () => ({}))
const jsx = (type, props) => ({ type, props })
let ids = 0
const component = load('../src/components/script/script-platform-select.tsx', (name) => {
  if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx }
  if (name === 'react') return { useId: () => `id-${++ids}` }
  if (name === '@/lib/publishing') return publishing
  if (name === './script-options') return options
  if (name === './script-radio-keys') return radioKeys
  if (name === './script-badges') return { ScriptPlatformBadge: 'platform-badge' }
  if (name.endsWith('.module.css')) return { default: {} }
  throw new Error(`Unexpected dependency: ${name}`)
})

function render(value) {
  const changes = []
  const tree = component.ScriptPlatformSelect({
    value,
    onValueChange: (next) => changes.push(next),
    label: 'Platform',
    placeholder: 'Choose a supported platform'
  })
  const [label, group, hint] = tree.props.children
  const radios = Array.from(group.props.children)
  return { label, group, radios, hint, changes }
}

test('retired script destinations require explicit selection without choosing a replacement', () => {
  for (const value of ['linkedin', 'x', 'twitter', 'unknown']) {
    const view = render(value)
    assert.equal(view.group.props.role, 'radiogroup')
    assert.equal(view.group.props['aria-required'], 'true')
    assert.ok(view.radios.every((radio) => radio.props['aria-checked'] === false))
    assert.equal(view.hint.props.children, 'Choose a supported platform')
    assert.equal(view.group.props['aria-describedby'], view.hint.props.id)
    assert.deepEqual(
      view.radios.map((radio) => radio.props['data-platform']),
      ['tiktok', 'youtube', 'instagram', 'facebook']
    )
    // The first radio stays reachable with Tab while nothing is selected.
    assert.deepEqual(view.radios.map((radio) => radio.props.tabIndex), [0, -1, -1, -1])
    assert.deepEqual(view.changes, [])
    view.radios[2].props.onClick()
    assert.deepEqual(view.changes, ['instagram'])
  }
})

test('supported script destinations remain selected without a requirement hint', () => {
  for (const value of ['instagram', 'facebook', 'tiktok', 'youtube']) {
    const view = render(value)
    const checked = view.radios.filter((radio) => radio.props['aria-checked'])
    assert.deepEqual(checked.map((radio) => radio.props['data-platform']), [value])
    assert.equal(checked[0].props.tabIndex, 0)
    assert.equal(view.hint, false)
    assert.equal(view.group.props['aria-describedby'], undefined)
    assert.deepEqual(view.changes, [])
  }
})

test('the platform radios keep an accessible group label and recognizable names', () => {
  const view = render('tiktok')
  assert.equal(view.group.props['aria-labelledby'], view.label.props.id)
  assert.equal(view.label.props.children, 'Platform')
  assert.deepEqual(
    view.radios.map((radio) => radio.props['aria-label']),
    ['TikTok', 'YouTube Shorts', 'Instagram Reels', 'Facebook']
  )
  for (const radio of view.radios) {
    assert.equal(radio.props.role, 'radio')
    assert.equal(radio.props.children.props.platform, radio.props['data-platform'])
    assert.equal(radio.props.children.props.decorative, true)
  }
})

test('arrow keys move the platform choice like a native radio group', () => {
  const view = render('facebook')
  let prevented = false
  const focused = []
  const event = (key) => ({
    key,
    preventDefault: () => { prevented = true },
    currentTarget: { parentElement: { querySelectorAll: () => [0, 1, 2, 3].map((index) => ({ focus: () => focused.push(index) })) } }
  })
  view.radios[3].props.onKeyDown(event('ArrowRight'))
  view.radios[0].props.onKeyDown(event('ArrowLeft'))
  view.radios[1].props.onKeyDown(event('Home'))
  view.radios[1].props.onKeyDown(event('Tab'))
  assert.equal(prevented, true)
  assert.deepEqual(view.changes, ['tiktok', 'facebook', 'tiktok'])
  assert.deepEqual(focused, [0, 3, 0])
})
