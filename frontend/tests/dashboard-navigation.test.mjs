import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

const exports = {}
vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/lib/dashboard-navigation.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText, { exports })
const { dashboardNavigation, isDashboardRouteActive, dashboardRouteLabel } = exports

test('the sidebar exposes ten focused destinations, with create as a separate action', () => {
  const destinations = dashboardNavigation.flatMap(group => group.items.map(item => item.href))
  assert.equal(destinations.length, 10)
  assert.equal(new Set(destinations).size, 10)
  for (const route of ['studio','clips','history','calendar','publish','script-generator','brand','billing','settings']) assert.ok(destinations.includes(`/dashboard/${route}`))
  assert.ok(destinations.includes('/dashboard'))
})

test('active states match route boundaries, not similarly prefixed routes', () => {
  assert.equal(isDashboardRouteActive('/dashboard', '/dashboard'), true)
  assert.equal(isDashboardRouteActive('/dashboard/clips/123/edit', '/dashboard'), false)
  assert.equal(isDashboardRouteActive('/dashboard/clips/123/edit', '/dashboard/clips'), true)
  assert.equal(isDashboardRouteActive('/dashboard/clips-extra', '/dashboard/clips'), false)
})

test('nested job and clip routes display the correct navigation context', () => {
  assert.equal(dashboardRouteLabel('/dashboard/studio'), 'editor')
  assert.equal(dashboardRouteLabel('/dashboard/jobs/synthetic'), 'history')
  assert.equal(dashboardRouteLabel('/dashboard/clips/synthetic/edit'), 'clips')
  assert.equal(dashboardRouteLabel('/dashboard/create'), 'create')
  assert.equal(dashboardRouteLabel('/dashboard/calendar'), 'calendar')
  assert.equal(dashboardRouteLabel('/dashboard/publish'), 'publish')
  assert.equal(dashboardRouteLabel('/dashboard/history?tab=analytics'), 'history')
  assert.equal(dashboardRouteLabel('/dashboard/settings?tab=billing'), 'settings')
  assert.equal(dashboardRouteLabel('/dashboard/script-generator'), 'scripts')
})

test('sidebar state is read on the server and sensitive pages are not eagerly prefetched', () => {
  const layout = readFileSync(new URL('../src/app/[locale]/dashboard/layout.tsx', import.meta.url), 'utf8')
  const sidebar = readFileSync(new URL('../src/components/dashboard/app-sidebar.tsx', import.meta.url), 'utf8')
  assert.match(layout, /await cookies\(\)/)
  assert.match(layout, /sidebar_state/)
  assert.equal((sidebar.match(/prefetch=\{false\}/g) ?? []).length, 2)
  assert.match(sidebar, /aria-current/)
  const primitive = readFileSync(new URL('../src/components/ui/sidebar.tsx', import.meta.url), 'utf8')
  assert.match(primitive, /!tooltip \|\| isMobile \|\| state !== 'collapsed'/)
})

test('brand and billing have independent active states', () => {
 for (const page of ['brand', 'billing']) {
  assert.equal(dashboardRouteLabel('/dashboard/' + page), page)
  assert.equal(isDashboardRouteActive('/dashboard/' + page, '/dashboard/settings'), false)
 }
})
