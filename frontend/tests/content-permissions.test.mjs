import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

const source = readFileSync(new URL('../src/lib/content-permissions.ts', import.meta.url), 'utf8')
const exports = {}
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports })

test('only a server-refreshed member role can modify content', () => {
  assert.equal(exports.canWriteContent({ user: { accessRole: 'member' } }), true)
  for (const accessRole of ['viewer', 'admin', '', undefined]) {
    assert.equal(exports.canWriteContent({ user: { accessRole } }), false)
  }
  assert.equal(exports.canWriteContent(null), false)
})

test('direct database content mutation handlers enforce role checks', () => {
  const routes = ['user/brand/route.ts', 'user/brand/logo/route.ts', 'calendar/route.ts', 'calendar/[id]/route.ts', 'clips/[id]/route.ts']
  for (const route of routes) {
    const text = readFileSync(new URL(`../src/app/api/${route}`, import.meta.url), 'utf8')
    for (const section of text.split('export async function ').slice(1)) {
      if (!/^(POST|PUT|PATCH|DELETE)\b/.test(section)) continue
      assert.match(section, /canWriteContent\(session\)/, route)
    }
  }
})
