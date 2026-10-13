import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'
import * as jsxRuntime from 'react/jsx-runtime'
import { renderToStaticMarkup } from 'react-dom/server'

function load(name, imports = {}, extension = 'ts', globals = {}) {
  const exports = {}
  const source = readFileSync(new URL(`../src/components/workspace-agent/${name}.${extension}`, import.meta.url), 'utf8')
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText,
    { exports, require: name => { if (!(name in imports)) throw Error(`Unexpected import ${name}`); return imports[name] }, Map, Set, JSON, Error, URL, encodeURIComponent, crypto: globalThis.crypto, ...globals })
  return exports
}
const { safeAgentRoute, mergeRuns, pollingDelay, resourceIdsForContext, resourceProjectFromRun, agentContext, publishingConsentMissing } = load('model')

test('conversation follows the current viewport across responsive portal changes without pulling readers from history', () => {
  const observers = []
  class ResizeObserver {
    constructor(callback) { this.callback = callback; this.nodes = []; observers.push(this) }
    observe(node) { this.nodes.push(node) }
    disconnect() { this.disconnected = true }
  }
  const { useConversationScroll: renderScrollHook } = load('use-conversation-scroll', { react: {
    useRef: current => ({ current }), useState: initial => [initial, () => {}], useCallback: callback => callback
  } }, 'ts', { ResizeObserver })
  const viewport = () => ({ clientHeight: 300, scrollHeight: 1400, scrollTop: 0, firstElementChild: {},
    scrollTo(options) { this.scrollOptions = options; this.scrollTop = options.top }
  })
  const hook = renderScrollHook()
  const desktop = viewport()
  hook.viewportRef(desktop)
  observers[0].callback()
  assert.equal(desktop.scrollTop, 1400)
  assert.equal(observers[0].nodes.length, 2)
  hook.viewportRef(null)
  assert.equal(observers[0].disconnected, true)
  const mobile = viewport()
  hook.viewportRef(mobile)
  observers[1].callback()
  assert.equal(mobile.scrollTop, 1400)
  mobile.scrollHeight = 1800
  observers[1].callback()
  assert.equal(mobile.scrollTop, 1800)
  mobile.scrollTop = 200
  hook.onScroll()
  mobile.scrollHeight = 2000
  observers[1].callback()
  assert.equal(mobile.scrollTop, 200)
  hook.viewportRef(null)
  const replacement = viewport()
  hook.viewportRef(replacement)
  observers[2].callback()
  assert.equal(replacement.scrollTop, 200)
  hook.scrollToLatest()
  assert.equal(replacement.scrollOptions.behavior, 'instant')
  hook.onScroll()
  replacement.scrollHeight = 1700
  observers[2].callback()
  assert.equal(replacement.scrollTop, 1700)
  replacement.scrollTop = 400
  hook.preserveHistoryPosition()
  replacement.scrollHeight = 2000
  observers[2].callback()
  assert.equal(replacement.scrollTop, 700)
})

test('waiting attachments use their explicit target instead of a stale selected story, including global resources', async () => {
  const { attachmentTarget } = load('attachment-target')
  const run = { status: 'waiting_for_resources', context: { project_id: 'source-project' }, missing_resources: [{ kind: 'document', target_id: 'source-project' }] }
  assert.equal(attachmentTarget(run).projectId, 'source-project')
  assert.equal(attachmentTarget({ ...run, missing_resources: [{ kind: 'logo' }] }).projectId, undefined)
  const ambiguous = attachmentTarget({ ...run, missing_resources: [...run.missing_resources, { kind: 'logo', target_id: 'other' }] })
  assert.equal(ambiguous.ambiguous, true)
  assert.equal(attachmentTarget({ ...run, status: 'completed' }), undefined)
  const registered = []
  const { useAgentAttachments: renderAttachmentsHook } = load('use-agent-attachments', {
    react: { useRef: current => ({ current }), useState: initial => [initial, () => {}], useEffect: () => {} },
    '@/lib/auth': { apiFetch: () => { throw Error('Unexpected upload') } },
    '@/lib/api-error': { extractApiError: (_, fallback) => fallback },
    '@/components/dashboard/brand/constants': { LOGO_MAX_BYTES: 5242880, LOGO_TYPES: [] },
    '@/components/calendar/publishing-media-utils': {},
    './api': { agentApi: { resource: async input => { registered.push(input); return { ...input, id: 'resource' } } } }
  }, 'ts', { AbortController })
  const hook = renderAttachmentsHook('stale-story')
  const file = { name: 'brief.md', size: 30, text: async () => 'Campaign brief' }
  await hook.add([file], false, false, attachmentTarget(run))
  await hook.add([file], false, false, { projectId: undefined })
  await hook.add([file], false)
  await hook.add([file], false, false, ambiguous)
  assert.deepEqual(registered.map(item => item.project_id), ['source-project', undefined, 'stale-story'])
})

test('action details hide backend precondition hashes at every nesting level', () => {
  const { ActionDetails } = load('action-details', { 'react/jsx-runtime': jsxRuntime }, 'tsx')
  const html = renderToStaticMarkup(ActionDetails({ ro: false, action: { name: 'studio.assets.delete', input: {
    name: 'poster.webp', expected_asset_version: 'private-sha', expected_version: 'private-version',
    settings: { label: 'Intro', expected_receipt: 'private-receipt', asset_id: 'private-id' }
  } } }))
  assert.match(html, /poster.webp/)
  assert.match(html, /Intro/)
  assert.doesNotMatch(html, /private-|expected/)
})

test('Studio attachments accept the inventory media types and respect the total multipart body limit', () => {
  const { validStudioUpload } = load('studio-upload')
  for (const name of ['source.mp4', 'source.WEBM', 'source.mov', 'brand.woff', 'brand.woff2', 'brand.ttf', 'brand.otf', 'image.webp', 'music.mp3']) {
    assert.equal(validStudioUpload([{ name, size: 2048 }]), true, name)
  }
  assert.equal(validStudioUpload([{ name: 'source.mp4', size: 200 * 1024 ** 2 }]), true)
  assert.equal(validStudioUpload([{ name: 'a.mp4', size: 300 * 1024 ** 2 }, { name: 'b.mp4', size: 300 * 1024 ** 2 }]), false)
  assert.equal(validStudioUpload([{ name: 'a.mp4', size: 500 * 1024 ** 2 }]), false)
  assert.equal(validStudioUpload([{ name: 'empty.mp4', size: 0 }]), false)
  assert.equal(validStudioUpload([{ name: 'script.html', size: 2048 }]), false)
  assert.equal(validStudioUpload(Array.from({ length: 9 }, () => ({ name: 'source.mp4', size: 2048 }))), false)
})

test('Studio uploads target only a typed, unique waiting project and resume only its current waiter', () => {
  const { studioResourceTarget, studioResourceWaiter } = load('studio-resources')
  const studioId = '00000000-0000-0000-0000-000000000041'
  const otherId = '00000000-0000-0000-0000-000000000042'
  const run = { id: 'waiter', revision: 7, status: 'waiting_for_resources', context: { route: '/dashboard/brand', project_id: otherId }, missing_resources: [{ kind: 'studio_asset', target_id: studioId }] }
  assert.equal(studioResourceTarget(run, otherId), studioId)
  assert.equal(studioResourceWaiter([run], studioId).revision, 7)
  assert.equal(studioResourceWaiter([{ ...run, status: 'cancelled' }], studioId), undefined)
  assert.equal(studioResourceWaiter([run, { ...run, id: 'another' }], studioId), undefined)
  assert.equal(studioResourceWaiter([{ ...run, missing_resources: [...run.missing_resources, { kind: 'logo' }] }], studioId), undefined)
  assert.equal(studioResourceTarget({ ...run, missing_resources: [{ kind: 'studio_asset' }] }), undefined)
  assert.equal(studioResourceTarget({ ...run, context: { route: '/dashboard/studio', project_id: studioId }, missing_resources: [{ kind: 'studio_asset' }] }), studioId)
  assert.equal(studioResourceTarget({ ...run, missing_resources: [...run.missing_resources, { kind: 'studio_asset', target_id: otherId }] }), undefined)
})
test('resource completion resumes only one matching waiter once and never replayed history or partial upload', () => {
  const refs = []; let cursor = 0; let effect
  const { useResourceResume: renderResumeHook } = load('use-resource-resume', { react: { useRef: initial => refs[cursor++] ?? (refs[cursor - 1] = { current: initial }), useEffect: callback => { effect = callback } } })
  const resumed = []
  const run = { id: 'run', revision: 2, status: 'waiting_for_resources', context: { project_id: 'story' }, missing_resources: [{ kind: 'videos', target_id: 'story' }] }
  const base = { runs: [run], projectId: 'story', items: [{ id: 'file', status: 'complete' }], uploading: false, resources: [], completedBatch: 0, pending: false, busy: false, resume: value => resumed.push(value.id) }
  const render = overrides => { cursor = 0; renderResumeHook({ ...base, ...overrides }); effect() }
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
  const resources = load('resource-results', { 'react/jsx-runtime': jsxRuntime }, 'tsx')
  const { ResultDetails } = load('result-details', { 'react/jsx-runtime': jsxRuntime, '@/components/ui/button': { Button: props => jsxRuntime.jsx('button', props) }, './resource-results': resources }, 'tsx')
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

test('Studio confirmation names the destructive target and effects without exposing internal identifiers', () => {
  const { ApprovalPreview } = load('approval-preview', { 'react/jsx-runtime': jsxRuntime, './model': { publishingConsentMissing } }, 'tsx')
  const html = renderToStaticMarkup(ApprovalPreview({ ro: true, value: {
    action: 'studio.assets.delete', title: 'Campanie de vară', project_id: 'private-project-id', expected_version: 'private-version-hash',
    asset: { asset_id: 'private-asset-id', name: 'poster.webp', expected_asset_version: 'private-asset-hash' },
    affected_layers: [{ id: 'private-layer-id', tag: 'img' }], irreversible: true
  } }))
  assert.match(html, /poster.webp/)
  assert.match(html, /vor pierde această resursă/)
  assert.match(html, /referințe în stiluri/)
  assert.match(html, /Ștergerea este definitivă/)
  assert.doesNotMatch(html, /private-|Fără dată programată/)
  const layer = renderToStaticMarkup(ApprovalPreview({ ro: true, value: { action: 'studio.layer.remove', title: 'Campanie', layer: { id: 'private-layer-id', text: 'Titlul de final', start: 5, duration: 3 } } }))
  assert.match(layer, /Titlul de final/)
  assert.match(layer, /Poți anula această modificare/)
  assert.doesNotMatch(layer, /definitivă|private-/)
})

test('resource and Studio result cards present saved data without revealing storage or receipt fields', () => {
  const { ResourceResults, StudioResults } = load('resource-results', { 'react/jsx-runtime': jsxRuntime }, 'tsx')
  const resources = renderToStaticMarkup(ResourceResults({ ro: true, data: { items: [{ id: 'private-resource-id', name: 'Identitate.webp', kind: 'logo', reference: '/private/storage/file.webp' }], has_more: true } }))
  assert.match(resources, /Identitate.webp/)
  assert.match(resources, /pagina următoare/)
  assert.doesNotMatch(resources, /private|storage/)
  const exported = renderToStaticMarkup(StudioResults({ ro: true, data: { id: 'private-project-id', job_id: 'private-job-id', verified: true, bytes: 1048576, download_path: '/private/download/export.mp4' } }))
  assert.match(exported, /Export verificat/)
  assert.match(exported, /1 MB/)
  assert.doesNotMatch(exported, /private|download/)
})
test('polling pauses for confirmation and paused jobs, slows for missing resources', () => {
  assert.equal(pollingDelay([{ status: 'paused' }, { status: 'waiting_for_confirmation' }]), false)
  assert.equal(pollingDelay([{ status: 'waiting_for_resources' }]), 15000)
  assert.equal(pollingDelay([{ status: 'running' }]), 2000)
})
test('route context includes only a concrete clip id', () => {
  assert.equal(agentContext('/dashboard/clips/clip-42/edit').clip_id, 'clip-42')
  assert.equal(agentContext('/dashboard/clips/clip-42/edit?tab=subtitles').clip_id, 'clip-42')
  assert.equal(agentContext('/dashboard/jobs/project-42').project_id, 'project-42')
  assert.equal(agentContext('/dashboard/clips').clip_id, undefined)
})
test('retry preserves request identity and controls submit the observed revision', async () => {
  const calls = []
  const { agentApi } = load('api', {
    '@/lib/auth': { apiFetch: async (path, options) => { calls.push({ path, ...options }); return { ok: true, status: 200, json: async () => ({ id: 'run-1', revision: 1, status: 'planning' }) } } },
    '@/lib/api-error': { extractApiError: (_, fallback) => fallback }
  })
  const request = { request_id: 'fixed-uuid', message: 'Create', context: { route: '/dashboard' }, suggestion_id: 'suggestion-1' }
  await agentApi.send(request); await agentApi.send(request)
  assert.equal(calls[0].body, calls[1].body)
  assert.equal(JSON.parse(calls[0].body).action, undefined)
  await agentApi.control({ id: 'run-1', revision: 7 }, 'approve')
  assert.deepEqual(JSON.parse(calls[2].body), { command: 'approve', revision: 7 })
})

test('malformed or unrelated successful responses remain ambiguous, not completed operations', async () => {
  for (const result of [{}, { id: 'expected', revision: 1, status: 'invented' }, { id: 'other-run', revision: 1, status: 'completed' }]) {
    const { agentApi } = load('api', {
      '@/lib/auth': { apiFetch: async () => ({ ok: true, status: 200, json: async () => result }) },
      '@/lib/api-error': { extractApiError: (_, fallback) => fallback }
    })
    await assert.rejects(agentApi.send({ request_id: 'expected', message: 'Create', context: { route: '/dashboard' } }), /could not be verified/)
  }
})

test('ordinary Send recovers the same request after connection loss and preserves an edited draft across navigation', async () => {
  const states = []; const refs = []; let stateIndex = 0; let refIndex = 0
  const records = new Map(); const calls = []; const controls = []
  let resources = [
    { id: 'global-logo', kind: 'logo', name: 'Global' },
    { id: 'selected-logo', kind: 'logo', name: 'Selected', project_id: 'selected-project' },
    { id: 'other-logo', kind: 'logo', name: 'Other', project_id: 'other-project' }
  ]
  const client = {
    getQueryData: key => records.get(JSON.stringify(key)),
    setQueryData: (key, value) => records.set(JSON.stringify(key), typeof value === 'function' ? value(records.get(JSON.stringify(key))) : value),
    invalidateQueries: async () => {}
  }
  class AgentApiError extends Error {}
  const { useWorkspaceAgent: renderAgentHook } = load('use-workspace-agent', {
    react: {
      useState: initial => {
        const index = stateIndex++
        if (!(index in states)) states[index] = initial
        return [states[index], value => { states[index] = typeof value === 'function' ? value(states[index]) : value }]
      },
      useRef: initial => refs[refIndex++] ?? (refs[refIndex - 1] = { current: initial }),
      useCallback: value => value,
      useEffect: () => {}
    },
    '@tanstack/react-query': { useQueryClient: () => client, useQuery: () => ({ isError: false }) },
    './model': { agentContext, mergeRuns, pollingDelay, resourceIdsForContext, resourceProjectFromRun, safeAgentRoute },
    './activity': { publishAgentActivity: () => {} },
    './studio-selection': { useStudioSelection: () => null },
    './api': { AgentApiError, agentApi: { send: async body => {
      calls.push(body)
      if (calls.length === 1) throw new Error('Connection interrupted after acceptance')
      return { id: body.request_id, revision: 1, status: 'planning', created_at: '2026-10-13', context: body.context }
    }, control: async (run, command, resourceIds) => {
      controls.push({ run, command, resourceIds })
      return { ...run, status: 'planning', revision: run.revision + 1 }
    } } }
  })
  let route = '/dashboard'
  const render = () => { stateIndex = 0; refIndex = 0; return renderAgentHook(route, () => {}, 'selected-project', undefined, 'ro', resources) }
  let agent = render()
  agent.setDraft('Create the project')
  agent = render(); await agent.send()
  agent = render()
  assert.equal(agent.retry.request_id, calls[0].request_id)
  assert.deepEqual(Array.from(calls[0].resource_ids), ['global-logo', 'selected-logo'])
  agent.setDraft('Now change its name')
  resources = [...resources, { id: 'later-global-brief', kind: 'document', name: 'Later' }]
  route = '/dashboard/clips/selected-clip/edit'
  agent = render(); await agent.send()
  assert.equal(calls[1].request_id, calls[0].request_id)
  assert.equal(calls[1].message, 'Create the project')
  assert.equal(calls[1].context.route, '/dashboard')
  assert.equal(calls[1], calls[0], 'ambiguous request retains the original complete payload after attachments change')
  agent = render()
  assert.equal(agent.retry, null)
  assert.equal(agent.draft, 'Now change its name')
  await agent.send()
  assert.notEqual(calls[2].request_id, calls[0].request_id)
  assert.equal(calls[2].context.clip_id, 'selected-clip')
  assert.equal(calls[2].context.project_id, undefined)
  assert.deepEqual(Array.from(calls[2].resource_ids), ['global-logo', 'later-global-brief'])
  await agent.control({ id: 'waiting-other', revision: 3, created_at: '2026-10-13', context: { route: '/dashboard/clips', project_id: 'other-project' } }, 'resume')
  assert.deepEqual(Array.from(controls[0].resourceIds), ['global-logo', 'other-logo', 'later-global-brief'])
  await agent.send(undefined, { id: 'suggestion-other', title: 'Use the other project', context: { route: '/dashboard/clips', project_id: 'other-project' } })
  assert.deepEqual(Array.from(calls[3].resource_ids), ['global-logo', 'other-logo', 'later-global-brief'])
})

test('resource selection keeps global files and only the exact target project', () => {
  const resources = [{ id: 'global', project_id: '' }, { id: 'story', project_id: 'story-42' }, { id: 'source', project_id: 'source-45' }]
  assert.deepEqual(Array.from(resourceIdsForContext(resources, { project_id: 'story-42' })), ['global', 'story'])
  assert.deepEqual(Array.from(resourceIdsForContext(resources, { project_id: 'source-45' })), ['global', 'source'])
  assert.deepEqual(Array.from(resourceIdsForContext(resources, { clip_id: 'clip-with-unknown-parent' })), ['global'])
})

test('resource controls select only a single backend-confirmed waiting video target', () => {
  const run = { status: 'waiting_for_resources', missing_resources: [{ kind: 'videos', target_id: 'story-1' }] }
  assert.equal(resourceProjectFromRun(run), 'story-1')
  assert.equal(resourceProjectFromRun({ ...run, status: 'completed' }), undefined)
  assert.equal(resourceProjectFromRun({ ...run, missing_resources: [{ kind: 'logo', target_id: 'project-1' }] }), undefined)
  assert.equal(resourceProjectFromRun({ ...run, missing_resources: [...run.missing_resources, { kind: 'videos', target_id: 'story-2' }] }), undefined)
})
