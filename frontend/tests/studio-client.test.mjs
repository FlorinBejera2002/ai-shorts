import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import ts from 'typescript'

const source = readFileSync(new URL('../src/components/studio/studio-client.ts', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } })
const { studioOrigin, createStudioClient, prepareStudioClip, prepareStudioWorkspace } = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputText).toString('base64')}`)
test('validates the exact configured Studio origin before credentials are sent', () => {
  assert.equal(studioOrigin('https://studio.example.com/'), 'https://studio.example.com')
  assert.equal(studioOrigin('http://localhost:5191'), 'http://localhost:5191')
  for (const value of ['http://example.com', 'https://user:pass@example.com', 'https://example.com/path', 'https://example.com?token=x', 'javascript:alert(1)', '//example.com']) assert.throws(() => studioOrigin(value))
})

test('handshake refreshes once on 401 and keeps credentials out of URLs', async () => {
  const calls = []
  let refreshed = 0
  const client = createStudioClient('https://studio.example.com', {
    getAccessToken: () => 'expired', refresh: async () => { refreshed++; return 'fresh' }
  }, async (url, init) => {
    calls.push({ url, init })
    return new Response(null, { status: calls.length === 1 ? 401 : 204 })
  })
  await client.connect()
  assert.equal(refreshed, 1)
  assert.equal(calls.length, 2)
  for (const { url, init } of calls) {
    assert.equal(url, 'https://studio.example.com/sneepcut/session')
    assert.equal(init.credentials, 'include')
    assert.equal(init.redirect, 'error')
  }
  assert.equal(calls[1].init.headers.Authorization, 'Bearer fresh')
})

test('list and create validate server responses and do not retry mutations', async () => {
  const calls = []
  const auth = { getAccessToken: () => 'token', refresh: async () => 'token' }
  const client = createStudioClient('https://studio.example.com', auth, async (url, init) => {
    calls.push({ url, init })
    return Response.json(init.method === 'POST' ? { project: { id: 'p_1', title: 'First cut' } } : { projects: [{ id: 'p_1', title: 'First cut' }] })
  })
  assert.deepEqual(await client.projects(), [{ id: 'p_1', title: 'First cut' }])
  assert.equal((await client.create(' First cut ')).title, 'First cut')
  assert.equal(calls[1].init.body, JSON.stringify({ title: 'First cut' }))
  await assert.rejects(client.create(' '))
  assert.equal(calls.length, 2)
  const broken = createStudioClient('https://studio.example.com', auth, async () => Response.json({ projects: [{ id: '../escape', title: 'Unsafe' }] }))
  await assert.rejects(broken.projects(), /invalid project/)
})

test('session failure and disconnect are explicit', async () => {
  const auth = { getAccessToken: () => null, refresh: async () => null }
  let sent = false
  const client = createStudioClient('http://localhost:5191', auth, async (_url, init) => { sent = true; assert.equal(init.method, 'DELETE'); return new Response(null, { status: 204 }) })
  await assert.rejects(client.connect(), /Sign in/)
  assert.equal(sent, false)
  await client.disconnect()
  assert.equal(sent, true)
})

test('opens a blank workspace and an existing generated clip without sending media URLs', async () => {
  const calls=[]
  const client=createStudioClient('https://studio.example.com',{getAccessToken:()=> 'token',refresh:async()=> 'token'},async(url,init)=>{
    calls.push({url,init});return Response.json({project:{id:'p_1',title:'My generated clip'}})
  })
  await client.workspace()
  assert.equal((await client.openClip('33333333-3333-4333-8333-333333333333')).title,'My generated clip')
  assert.equal(calls[0].url,'https://studio.example.com/sneepcut/workspace')
  assert.equal(calls[1].url,'https://studio.example.com/sneepcut/clips/33333333-3333-4333-8333-333333333333/open')
  assert.equal(calls[1].init.method,'POST')
  assert.equal(calls[1].init.body,undefined)
  await assert.rejects(client.openClip('../escape'))
  assert.equal(calls.length,2)
})

test('direct Studio navigation waits for the session and uses the selected clip project', async () => {
  const calls = []
  let connected = false
  const controller = new AbortController()
  const clipId = '33333333-3333-4333-8333-333333333333'
  const client = createStudioClient('https://studio.example.com', {
    getAccessToken: () => 'private-token', refresh: async () => null
  }, async (url, init) => {
    calls.push(url)
    assert.equal(init.signal, controller.signal)
    assert.equal(init.credentials, 'include')
    if (url.endsWith('/session')) {
      await Promise.resolve()
      connected = true
      return new Response(null, { status: 204 })
    }
    assert.equal(connected, true)
    assert.equal(url, `https://studio.example.com/sneepcut/clips/${clipId}/open`)
    return Response.json({ project: { id: 'selected_project', title: 'Selected clip' } })
  })
  const url = await prepareStudioClip(client, clipId, controller.signal)
  assert.equal(url, 'https://studio.example.com/#project/selected_project')
  assert.equal(calls.length, 2)
  assert.doesNotMatch(url, /private-token|dashboard|iframe/)
})

test('direct Studio navigation produces no destination when session or import fails', async () => {
  for (const failure of ['session', 'import']) {
    const calls = []
    const client = createStudioClient('https://studio.example.com', {
      getAccessToken: () => 'token', refresh: async () => null
    }, async (url) => {
      calls.push(url)
      if (url.endsWith('/session') && failure !== 'session') {
        return new Response(null, { status: 204 })
      }
      return Response.json({ error: 'Temporarily unavailable' }, { status: 503 })
    })
    await assert.rejects(prepareStudioClip(client, '33333333-3333-4333-8333-333333333333'))
    assert.equal(calls.length, failure === 'session' ? 1 : 2)
  }
})

test('workspace launcher reuses an owned project and creates only an empty first workspace', async () => {
  for (const projects of [[], [{ id: 'existing', title: 'Existing project' }]]) {
    const calls = []
    const client = {
      origin: 'https://studio.example.com',
      connect: async () => { calls.push('connect') },
      projects: async () => { calls.push('projects'); return projects },
      workspace: async () => { calls.push('workspace'); return { id: 'blank', title: 'Blank' } }
    }
    assert.equal(await prepareStudioWorkspace(client), `https://studio.example.com/#project/${projects.length ? 'existing' : 'blank'}`)
    assert.deepEqual(calls, projects.length ? ['connect', 'projects'] : ['connect', 'projects', 'workspace'])
  }
})

test('legacy project URLs only open a project owned by the signed-in account', async () => {
  const client = {
    origin: 'https://studio.example.com',
    connect: async () => {},
    projects: async () => [{ id: 'first', title: 'First' }, { id: 'selected', title: 'Selected' }],
    workspace: async () => { throw new Error('Must not create a fallback for a missing project') }
  }
  assert.equal(await prepareStudioWorkspace(client, { projectId: 'selected' }), 'https://studio.example.com/#project/selected')
  await assert.rejects(prepareStudioWorkspace(client, { projectId: 'other-owner' }), /unavailable for this account/)
})

test('legacy clip targets take precedence over workspace selection', async () => {
  const calls = []
  const client = {
    origin: 'https://studio.example.com',
    connect: async () => { calls.push('connect') },
    openClip: async (id) => { calls.push(id); return { id: 'clip-project', title: 'Clip' } },
    projects: async () => { throw new Error('Must open the selected clip') }
  }
  assert.equal(await prepareStudioWorkspace(client, { clipId: 'clip', projectId: 'ignored' }), 'https://studio.example.com/#project/clip-project')
  assert.deepEqual(calls, ['connect', 'clip'])
})
