import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'
const source = ts.transpileModule(readFileSync(new URL('../src/components/shared/sign-out-action.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 }
}).outputText
function fixture(iconOnly) {
  const exports = {}; const states = []; let cursor = 0; let calls = 0
  const jsx = (type, props) => ({ type, props })
  const require = name => {
    if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx, Fragment: 'Fragment' }
    if (name === 'react') return { useRef: () => ({ current: null }), useState: initial => { const index = cursor++; if (!(index in states)) states[index] = initial; return [states[index], value => { states[index] = value }] } }
    if (name === 'next-intl') return { useLocale: () => 'en' }
    if (name.endsWith('/toast')) return { useToast: () => ({ add() {} }) }
    if (name === '@/lib/auth') return { authClient: { logout: async () => { calls++ } } }
    return new Proxy({}, { get: (_, key) => key })
  }
  vm.runInNewContext(source, { exports, require })
  function render() { cursor = 0; return exports.SignOutAction({ iconOnly }) }
  function nodes(root, type) { if (!root || typeof root !== 'object') return []; return [...(root.type === type ? [root] : []), ...[root.props?.children].flat(Infinity).flatMap(child => nodes(child, type))] }
  return { render, nodes, calls: () => calls }
}
for (const iconOnly of [true, false]) {
  test(`logout requires confirmation (${iconOnly ? 'sidebar icon' : 'settings button'})`, async () => {
    const f = fixture(iconOnly); let tree = f.render()
    const trigger = f.nodes(tree, 'DialogTrigger')[0]
    assert.equal(trigger.props.children.props.onClick, undefined)
    tree.props.onOpenChange(true)
    tree = f.render()
    assert.equal(tree.props.open, true)
    assert.equal(f.calls(), 0)
    const cancel = f.nodes(tree, 'Button').find(node => node.props.children === 'Cancel')
    cancel.props.onClick()
    assert.equal(f.render().props.open, false)
    assert.equal(f.calls(), 0)
    tree.props.onOpenChange(true)
    tree = f.render()
    const confirm = f.nodes(tree, 'Button').find(node => node.props.variant === 'destructive')
    confirm.props.onClick()
    assert.equal(f.calls(), 1)
    assert.equal(f.nodes(f.render(), 'Button').find(node => node.props.variant === 'destructive').props.disabled, true)
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(f.render().props.open, false)
  })
}
