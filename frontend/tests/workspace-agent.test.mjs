import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'
import * as jsxRuntime from 'react/jsx-runtime'
import { renderToStaticMarkup } from 'react-dom/server'

function load(name, imports = {}, extension = 'ts') {
  const exports = {}
  const source = readFileSync(new URL(`../src/components/workspace-agent/${name}.${extension}`, import.meta.url), 'utf8')
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText,
    { exports, require: name => { if (!(name in imports)) throw Error(`Unexpected import ${name}`); return imports[name] }, Map, Set, JSON, Error, URL, encodeURIComponent })
  return exports
}
const { safeAgentRoute, mergeRuns, pollingDelay, agentContext, publishingConsentMissing } = load('model')
test('resource completion resumes only one matching waiter once and never replayed history or partial upload', () => {
  const refs = []; let cursor = 0; let effect
  const { useResourceResume } = load('use-resource-resume', { react: { useRef: initial => refs[cursor++] ?? (refs[cursor - 1] = { current: initial }), useEffect: callback => { effect = callback } } })
  const resumed = []
  const run = { id: 'run', revision: 2, status: 'waiting_for_resources', context: { project_id: 'story' }, missing_resources: [{ kind: 'videos', target_id: 'story' }] }
  const base = { runs: [run], projectId: 'story', items: [{ id: 'file', status: 'complete' }], uploading: false, resources: [], completedBatch: 0, pending: false, busy: false, resume: value => resumed.push(value.id) }
  const render = overrides => { cursor = 0; useResourceResume({ ...base, ...overrides }); effect() }
  render({}); assert.deepEqual(resumed, [])
  render({ uploading: true, items: [{ id: 'file', status: 'uploading' }] })
  render({ items: [{ id: 'file', status: 'failed' }] }); assert.deepEqual(resumed, [])
  render({ uploading: true }); render({}); assert.deepEqual(resumed, ['run'])
  render({ uploading: true }); render({}); assert.deepEqual(resumed, ['run'])
  render({ uploading: true }); render({ runs: [{ ...run, revision: 3 }, { ...run, id: 'another' }] }); assert.deepEqual(resumed, ['run'])
})
test('publish and reschedule require saved provider declarations but unschedule does not', () => {
  const preview = { action: 'publishing.publish', destinations: [{ provider: 'youtube' }], youtube: { termsAccepted: false } }
  assert.equal(publishingConsentMissing(preview), true)
  assert.equal(publishingConsentMissing({ ...preview, action: 'publishing.reschedule' }), true)
  assert.equal(publishingConsentMissing({ ...preview, action: 'publishing.unschedule' }), false)
  assert.equal(publishingConsentMissing({ ...preview, youtube: { termsAccepted: true } }), false)
})
const { activityMatchesRoute } = load('activity', { react: {}, './model': { safeAgentRoute } })
test('activity highlights only the current matching route and story resource', () => {
  const activity = { route: '/dashboard/create?story=story-1', resourceId: 'story-1' }
  assert.equal(activityMatchesRoute(activity, '/dashboard/create', '?story=story-1'), true)
  assert.equal(activityMatchesRoute(activity, '/dashboard/create', '?story=story-2'), false)
  assert.equal(activityMatchesRoute(activity, '/dashboard/brand', ''), false)
  assert.equal(activityMatchesRoute(null, '/dashboard/create', '?story=story-1'), false)
})
test('agent navigation only permits existing local dashboard destinations', () => {
  for (const route of ['/dashboard', '/dashboard/clips/abc/edit', '/dashboard/create', '/dashboard/publish/new']) assert.equal(safeAgentRoute(route), route)
  for (const route of ['https://evil.test', '//evil.test', '/dashboard/../../settings', '/dashboard/unknown', '/dashboard\\evil', '/login', '/dashboard#x', 'javascript:alert(1)']) assert.equal(safeAgentRoute(route), null)
})

test('result cards show useful read data without exposing hidden fields or executable markup', () => {
  const { ResultDetails } = load('result-details', { 'react/jsx-runtime': jsxRuntime, '@/components/ui/button': { Button: props => jsxRuntime.jsx('button', props) } }, 'tsx')
  const totals = renderToStaticMarkup(ResultDetails({ action: 'analytics.read', ro: false, data: { credits: 42, projects: 3, clips: 9, scripts: 2, secret: 'never-render-this' } }))
  assert.match(totals, /Credits/); assert.match(totals, /42/); assert.doesNotMatch(totals, /never-render-this/)
  const projects = renderToStaticMarkup(ResultDetails({ action: 'projects.list', ro: false, data: [{ id: 'id', name: '<script>unsafe</script>', status: 'ready', clips: 4 }] }))
  assert.match(projects, /4 clips/); assert.doesNotMatch(projects, /<script>/)
  const script = renderToStaticMarkup(ResultDetails({ action: 'scripts.generate', ro: false, data: { saved: false, snapshot: { title: 'Draft', hook: 'Opening', scenes: [{ dialogue: '<script>speech</script>', visual_description: 'Wide shot', duration_seconds: 12 }], call_to_action: 'Subscribe' } } }))
  assert.match(script, /Opening/); assert.match(script, /Wide shot/); assert.match(script, /not saved yet/); assert.doesNotMatch(script, /<script>/)
  const exported = renderToStaticMarkup(ResultDetails({ action: 'scripts.export', ro: false, data: { document: { title: 'Saved' }, filename: 'script.json' } }))
  assert.match(exported, /Download JSON/)
})
test('run reconciliation never overwrites a newer revision or duplicates a retried run', () => {
  const base = { id: 'a', created_at: '2026-09-22', revision: 2, status: 'completed' }
  const result = mergeRuns([base], [{ ...base, revision: 1, status: 'running' }, base])
  assert.equal(result.length, 1); assert.equal(result[0].status, 'completed')
})
test('polling pauses for confirmation and paused jobs, slows for missing resources', () => {
  assert.equal(pollingDelay([{ status: 'paused' }, { status: 'waiting_for_confirmation' }]), false)
  assert.equal(pollingDelay([{ status: 'waiting_for_resources' }]), 15000)
  assert.equal(pollingDelay([{ status: 'running' }]), 2000)
})
test('route context includes only a concrete clip id', () => {
  assert.equal(agentContext('/dashboard/clips/clip-42/edit').clip_id, 'clip-42')
  assert.equal(agentContext('/dashboard/clips').clip_id, undefined)
})
test('retry preserves request identity and controls submit the observed revision', async () => {
  const calls = []
  const { agentApi } = load('api', {
    '@/lib/auth': { apiFetch: async (path, options) => { calls.push({ path, ...options }); return { ok: true, status: 200, json: async () => ({ id: 'run-1' }) } } },
    '@/lib/api-error': { extractApiError: (_, fallback) => fallback }
  })
  const request = { request_id: 'fixed-uuid', message: 'Create', context: { route: '/dashboard' }, suggestion_id: 'suggestion-1' }
  await agentApi.send(request); await agentApi.send(request)
  assert.equal(calls[0].body, calls[1].body)
  assert.equal(JSON.parse(calls[0].body).action, undefined)
  await agentApi.control({ id: 'run-1', revision: 7 }, 'approve')
  assert.deepEqual(JSON.parse(calls[2].body), { command: 'approve', revision: 7 })
})
