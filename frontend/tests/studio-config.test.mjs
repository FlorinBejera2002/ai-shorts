import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import ts from 'typescript'

const source = readFileSync(new URL('../src/components/studio/studio-config.ts', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } })
const { configuredStudioOrigin } = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputText).toString('base64')}`)

test('production never defaults or connects to a local Studio service', () => {
  for (const value of [undefined, '', ' ', 'http://localhost:5191', 'https://localhost:5191', 'https://127.0.0.1', 'https://[::1]', 'https://editor.localhost', 'http://studio.sneepcut.com', 'invalid']) {
    assert.equal(configuredStudioOrigin(value, true), null)
  }
})

test('explicit HTTPS deployment and local development remain available', () => {
  assert.equal(configuredStudioOrigin('https://studio.sneepcut.com', true), 'https://studio.sneepcut.com')
  assert.equal(configuredStudioOrigin(undefined, false), 'http://localhost:5191')
  assert.equal(configuredStudioOrigin('', false), 'http://localhost:5191')
  assert.equal(configuredStudioOrigin('http://localhost:5193', false), 'http://localhost:5193')
})
