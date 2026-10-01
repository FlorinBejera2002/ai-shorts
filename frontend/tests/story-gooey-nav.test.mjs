import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'
import * as React from 'react'
import * as jsxRuntime from 'react/jsx-runtime'
import * as motion from 'framer-motion'
import { renderToStaticMarkup } from 'react-dom/server'

const exports = {}
const imports = {
  react: React,
  'react/jsx-runtime': jsxRuntime,
  'framer-motion': motion,
  '@/lib/utils': { cn: (...classes) => classes.filter(Boolean).join(' ') }
}
const source = readFileSync(new URL('../src/components/ui/gooey-nav.tsx', import.meta.url), 'utf8')
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX
} }).outputText, { exports, require: (name) => {
  if (!(name in imports)) throw Error(`Unexpected import ${name}`)
  return imports[name]
} })

test('calendar-style Gooey Nav keeps horizontal layout and pressed-state semantics by default', () => {
  const html = renderToStaticMarkup(React.createElement(exports.GooeyNav, {
    items: [{ label: 'Monday' }, { label: 'Tuesday' }, { label: 'Wednesday' }],
    value: 1, stretch: true, size: 'xs', 'aria-label': 'Week', onChange: () => {}
  }))
  assert.match(html, /data-orientation="horizontal"/)
  assert.equal((html.match(/aria-pressed="true"/g) ?? []).length, 1)
  assert.equal((html.match(/aria-pressed="false"/g) ?? []).length, 2)
  assert.doesNotMatch(html, /aria-current=|flex-col|NaN|Infinity/)
  assert.match(html, /margin-left:14px/)
  assert.match(html, /viewBox="0 0 14 100"/)
})

test('story Gooey Nav uses a vertical seam without changing label direction or enabling later steps', () => {
  const html = renderToStaticMarkup(React.createElement(exports.GooeyNav, {
    items: [{ label: 'Footage' }, { label: 'Story & audio', disabled: true }],
    value: 0, orientation: 'vertical', currentStep: true, stretch: true,
    'aria-label': 'Story creation steps', onChange: () => {}
  }))
  assert.match(html, /data-orientation="vertical"/)
  assert.equal((html.match(/aria-current="step"/g) ?? []).length, 1)
  assert.match(html, /disabled=""/)
  assert.match(html, /margin-top:16px/)
  assert.match(html, /viewBox="0 0 100 16"/)
  assert.doesNotMatch(html, /aria-pressed=|rotate\(|NaN|Infinity/)
})
