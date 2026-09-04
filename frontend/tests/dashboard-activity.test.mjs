import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

const exports = {}
vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/lib/dashboard-activity.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText, { exports, Date, Map })
const { activityWindow, buildActivity, projectStatus } = exports

test('UTC range includes today and exactly 90 calendar days across a year boundary', () => {
  const now = new Date('2026-01-02T23:59:59Z')
  const { start, end } = activityWindow(now)
  assert.equal(end.toISOString(), '2026-01-03T00:00:00.000Z')
  assert.equal((end - start) / 86400000, 90)
  assert.equal(now.toISOString(), '2026-01-02T23:59:59.000Z')
})

test('fills absent days with zero and never fabricates activity', () => {
  const result = buildActivity([], new Date('2026-09-04T12:00:00Z'))
  assert.equal(result.length, 90)
  assert.equal(result.at(-1).date, '2026-09-04')
  assert.ok(result.every(day => day.clips === 0 && day.projects === 0))
})

test('maps SQL aggregates into ordered daily buckets and filters 7/30/90 days', () => {
  const result = buildActivity([
    { day: '2026-09-04', clips: 3, projects: 1 },
    { day: '2026-08-25', clips: 5, projects: 2 },
    { day: '2026-07-20', clips: 8, projects: 4 },
    { day: '2025-01-01', clips: 999, projects: 999 },
    { day: '2026-09-05', clips: 999, projects: 999 }
  ], new Date('2026-09-04T12:00:00Z'))
  const total = days => result.slice(-days).reduce((sum, item) => sum + item.clips, 0)
  assert.equal(total(7), 3)
  assert.equal(total(30), 8)
  assert.equal(total(90), 16)
  assert.equal(new Set(result.map(day => day.date)).size, 90)
})

test('UTC dates are stable around daylight-saving transitions', () => {
  const result = buildActivity([{ day: new Date('2026-03-29T00:00:00Z'), clips: 4, projects: 2 }], new Date('2026-03-30T01:00:00+03:00'), 7)
  assert.equal(result.at(-1).date, '2026-03-29')
  assert.equal(result.at(-1).clips, 4)
})

test('classifies terminal, active, legacy and unknown statuses without hiding jobs', () => {
  for (const status of ['completed', 'failed', 'cancelled']) assert.equal(projectStatus(status), status)
  for (const status of ['pending', 'rendering', 'processing', 'analyzing', 'generating']) assert.equal(projectStatus(status), 'active')
  assert.equal(projectStatus('future-state'), 'other')
})

test('database queries bind the account and aggregate server-side', () => {
  const source = readFileSync(new URL('../src/lib/dashboard-data.ts', import.meta.url), 'utf8')
  assert.equal((source.match(/user_id = \$\{userId\}::uuid/g) ?? []).length, 2)
  assert.ok(source.includes('GROUP BY day'))
  assert.ok(!source.includes('$queryRawUnsafe'))
  assert.ok(source.includes("where: { userId }"))
})
