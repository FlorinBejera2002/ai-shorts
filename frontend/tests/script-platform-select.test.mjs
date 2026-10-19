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

const publishing = {}
vm.runInNewContext(compile('../src/lib/publishing.ts'), { exports: publishing })
const component = {}
const jsx = (type, props) => ({ type, props })
vm.runInNewContext(
  compile('../src/components/script/script-platform-select.tsx'),
  {
    exports: component,
    require: (name) => {
      if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx }
      if (name === '@/lib/publishing') return publishing
      if (name.endsWith('/label')) return { Label: 'label' }
      if (name.endsWith('/native-select')) return { NativeSelect: 'select' }
      throw new Error(`Unexpected dependency: ${name}`)
    }
  }
)

function render(value) {
  const changes = []
  const tree = component.ScriptPlatformSelect({
    value,
    onValueChange: (next) => changes.push(next),
    label: 'Platform',
    placeholder: 'Choose a supported platform'
  })
  const select = tree.props.children.find((child) => child.type === 'select')
  const options = select.props.children.flat().filter(Boolean)
  return { select, options, changes }
}

test('retired script destinations require explicit selection without choosing a replacement', () => {
  for (const value of ['linkedin', 'x', 'twitter', 'unknown']) {
    const view = render(value)
    assert.equal(view.select.props.value, '')
    assert.equal(view.options[0].props.value, '')
    assert.equal(view.options[0].props.disabled, true)
    assert.equal(view.options[0].props.children, 'Choose a supported platform')
    assert.deepEqual(
      Array.from(view.options.slice(1), (option) => option.props.value),
      ['tiktok', 'instagram', 'facebook', 'youtube']
    )
    assert.deepEqual(view.changes, [])
    view.select.props.onChange({ target: { value: 'instagram' } })
    assert.deepEqual(view.changes, ['instagram'])
  }
})

test('supported script destinations remain selected without a placeholder', () => {
  for (const value of ['instagram', 'facebook', 'tiktok', 'youtube']) {
    const view = render(value)
    assert.equal(view.select.props.value, value)
    assert.equal(view.options.length, 4)
    assert.equal(view.options.some((option) => option.props.value === ''), false)
    assert.deepEqual(view.changes, [])
  }
})
