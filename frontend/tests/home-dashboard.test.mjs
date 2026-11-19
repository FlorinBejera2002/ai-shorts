import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

function load(relative, imports = {}) {
  const exports = {}
  const source = readFileSync(new URL(relative, import.meta.url), 'utf8')
  vm.runInNewContext(
    ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
    }).outputText,
    {
      exports,
      Date,
      URLSearchParams,
      require: (name) => {
        if (!(name in imports)) throw Error(`Unexpected import ${name}`)
        return imports[name]
      }
    }
  )
  return exports
}

const { selectWorkItems, isRunningJob } = load('../src/components/dashboard/home/use-home-data.ts', {
  '@tanstack/react-query': { useQuery: () => ({}) },
  '@/lib/auth': { apiFetch: async () => ({ ok: true, json: async () => ({}) }) }
})
const { lastSevenDays } = load('../src/components/dashboard/home/home-activity.ts')

// Values come from another vm realm: copy them into this realm before deep comparison.
const plain = (value) => structuredClone(value)
const now = Date.parse('2026-11-19T12:00:00Z')
const job = (id, status, extra = {}) => ({
  id, status, progress: 0, createdAt: '2026-11-19T08:00:00Z', completedAt: null, sourceUrl: null, sourceFilePath: null, _count: { clips: 0 }, ...extra
})

test('"În lucru" shows running jobs first, then recent finished jobs with clips, at most two', () => {
  const items = selectWorkItems([
    job('old-done', 'completed', { completedAt: '2026-11-01T08:00:00Z', _count: { clips: 4 } }),
    job('done-empty', 'completed', { completedAt: '2026-11-18T08:00:00Z' }),
    job('done', 'completed', { completedAt: '2026-11-18T08:00:00Z', _count: { clips: 6 } }),
    job('failed', 'failed'),
    job('running', 'analyzing', { progress: 64 })
  ], now)
  assert.deepEqual(plain(items.map((item) => [item.kind, item.job.id])), [['running', 'running'], ['done', 'done']])
  assert.equal(selectWorkItems([job('a', 'pending'), job('b', 'rendering'), job('c', 'clipping')], now).length, 2)
  assert.deepEqual(plain(selectWorkItems([job('failed', 'failed')], now)), [])
  assert.equal(isRunningJob(job('legacy', 'processing')), true)
})

test('the weekly chart always shows the last seven UTC days ending today', () => {
  const days = lastSevenDays([
    { date: '2026-11-19', clips: 3, projects: 1 },
    { date: '2026-11-15T00:00:00Z', clips: 2, projects: 1 },
    { date: '2026-11-01', clips: 9, projects: 2 }
  ], new Date(now))
  assert.equal(days.length, 7)
  assert.equal(days[0].date.toISOString().slice(0, 10), '2026-11-13')
  assert.deepEqual(plain(days.map((day) => day.clips)), [0, 0, 2, 0, 0, 0, 3])
  assert.deepEqual(plain(days.map((day) => day.today)), [false, false, false, false, false, false, true])
})
