import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

const exports = {}
vm.runInNewContext(
  ts.transpileModule(
    readFileSync(
      new URL('../src/lib/dashboard-sections.ts', import.meta.url),
      'utf8'
    ),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022
      }
    }
  ).outputText,
  { exports, URLSearchParams }
)
const {
  dashboardSections,
  dashboardSectionTab,
  dashboardSectionHref,
  dashboardRedirectHref
} = exports

test('unknown or repeated tabs fall back to the section default', () => {
  for (const [section, { tabs }] of Object.entries(dashboardSections)) {
    for (const value of [undefined, '', 'missing', ['billing', 'brand']]) {
      assert.equal(dashboardSectionTab(section, value), tabs[0])
    }
    for (const tab of tabs) assert.equal(dashboardSectionTab(section, tab), tab)
  }
})

test('tab links use one canonical page per section', () => {
  assert.equal(
    dashboardSectionHref('projects', 'analytics'),
    '/dashboard/history?tab=analytics'
  )
  assert.equal(
    dashboardSectionHref('settings', 'billing'),
    '/dashboard/settings'
  )
  assert.equal(
    dashboardSectionHref('settings', 'invalid'),
    '/dashboard/settings'
  )
})

test('all consolidated routes have a useful destination', () => {
  assert.equal(dashboardRedirectHref('review'), '/dashboard/clips')
  assert.equal(
    dashboardRedirectHref('analytics'),
    '/dashboard/history?tab=analytics'
  )
  assert.equal(dashboardRedirectHref('brand'), '/dashboard/brand')
})

test('legacy billing links preserve checkout results and repeated query values', () => {
  const url = new URL(
    dashboardRedirectHref('billing', {
      session_id: 'cs_synthetic&value',
      success: 'true',
      tag: ['one', 'two'],
      missing: undefined,
      tab: 'brand'
    }),
    'https://example.invalid'
  )
  assert.equal(url.pathname, '/dashboard/billing')
  assert.equal(url.searchParams.get('tab'), null)
  assert.equal(url.searchParams.get('session_id'), 'cs_synthetic&value')
  assert.equal(url.searchParams.get('success'), 'true')
  assert.deepEqual(url.searchParams.getAll('tag'), ['one', 'two'])
  assert.equal(url.searchParams.has('missing'), false)
})

test('section labels exist in both supported locales', () => {
  for (const locale of ['en', 'ro']) {
    const labels = JSON.parse(
      readFileSync(
        new URL(`../messages/${locale}.json`, import.meta.url),
        'utf8'
      )
    ).dashboardSections
    for (const [section, { tabs }] of Object.entries(dashboardSections)) {
      for (const key of [section, ...tabs])
        assert.ok(labels[key], `${locale}: ${key}`)
    }
  }
})
