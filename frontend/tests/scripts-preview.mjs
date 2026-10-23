// From frontend/: node tests/scripts-preview.mjs
// Vite must already be running. Optional: FRONTEND_ORIGIN=http://127.0.0.1:5173
// and SCRIPTS_PREVIEW_PORT=5175 (PORT is also accepted). Open the printed URL.
// All API traffic stays in this synthetic, in-memory workspace; restarting the
// helper resets its records. Static assets and HMR are proxied to local Vite.
import assert from 'node:assert/strict'
import http from 'node:http'
import {
  generatedSnapshot,
  libraryRecords,
  scriptId
} from './fixtures/scripts-workspace.mjs'

const frontend = new URL(process.env.FRONTEND_ORIGIN || 'http://127.0.0.1:5173')
assert.equal(frontend.protocol, 'http:', 'The preview requires a local HTTP Vite server')
assert.ok(
  ['localhost', '127.0.0.1', '[::1]'].includes(frontend.hostname),
  'FRONTEND_ORIGIN must address local Vite'
)
assert.equal(frontend.pathname, '/', 'FRONTEND_ORIGIN must be an origin without a path')
const port = Number(process.env.SCRIPTS_PREVIEW_PORT || process.env.PORT || 5175)
assert.ok(Number.isInteger(port) && port > 0 && port <= 65535, 'Invalid preview port')
assert.notEqual(port, Number(frontend.port || 80), 'Preview and Vite need separate ports')

const records = structuredClone(libraryRecords())
const histories = new Map()
const user = {
  id: '00000000-0000-4000-8000-000000004299',
  name: 'Alex Morgan',
  email: 'scripts-preview@example.invalid',
  credits: 1000,
  plan: 'pro',
  access_role: 'member'
}
let createdCount = 0

for (const record of records) {
  histories.set(record.id, Array.from({ length: record.revision }, (_, index) => ({
    id: `${record.id}-v${record.revision - index}`,
    versionNumber: record.revision - index,
    changeType: index === record.revision - 1 ? 'create' : 'edit',
    summary: index === 0 ? 'Refined scene 2 dialogue' : index === 1 ? 'Updated hook' : 'Initial draft',
    createdAt: `2026-10-23T0${9 - Math.min(index, 2)}:00:00Z`,
    snapshot: {
      ...structuredClone(record.snapshot),
      hook: index === 0 ? record.snapshot.hook : `Restored hook from v${record.revision - index}`
    }
  })))
}

function json(response, body, status = 200) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  })
  response.end(JSON.stringify(body))
}

async function payload(request) {
  const chunks = []
  let size = 0
  for await (const chunk of request) {
    size += chunk.length
    if (size > 1024 * 1024) {
      const error = new Error('Synthetic request body exceeds 1 MiB')
      error.status = 413
      throw error
    }
    chunks.push(chunk)
  }
  const body = Buffer.concat(chunks).toString('utf8')
  try {
    return body ? JSON.parse(body) : {}
  } catch {
    const error = new Error('Expected a JSON request body')
    error.status = 400
    throw error
  }
}

function applyFields(record, data) {
  const fields = {
    title: 'title', topic: 'topic', status: 'status', platform: 'platform',
    language: 'language', target_duration_seconds: 'targetDurationSeconds',
    tone: 'tone', style: 'style', audience: 'audience', snapshot: 'snapshot'
  }
  for (const [input, output] of Object.entries(fields)) {
    if (Object.hasOwn(data, input)) record[output] = structuredClone(data[input])
  }
}

function addVersion(record, summary, changeType = 'edit') {
  const history = histories.get(record.id) || []
  history.unshift({
    id: `${record.id}-v${record.revision}`,
    versionNumber: record.revision,
    changeType,
    summary,
    createdAt: record.updatedAt,
    snapshot: structuredClone(record.snapshot)
  })
  histories.set(record.id, history)
}

function isApi(path) {
  return /^\/(api|v1)(\/|$)/.test(path)
}

async function api(request, response, url) {
  const path = url.pathname
  const method = request.method || 'GET'
  if (path === '/v1/auth/refresh' && method === 'POST') {
    return json(response, { access_token: 'synthetic-scripts-preview-token', user })
  }
  if (path === '/api/scripts/items' && method === 'GET') {
    const query = (url.searchParams.get('query') || '').toLowerCase()
    return json(response, { scripts: records.filter(record =>
      (url.searchParams.get('archived') === 'true' || !record.archived) &&
      `${record.title} ${record.topic}`.toLowerCase().includes(query)
    ) })
  }
  if (path === '/api/scripts/items' && method === 'POST') {
    const data = await payload(request)
    const now = new Date().toISOString()
    const record = {
      id: scriptId(100 + ++createdCount),
      archived: false,
      revision: 1,
      createdAt: now,
      updatedAt: now
    }
    applyFields(record, data)
    records.unshift(record)
    addVersion(record, 'Initial draft', 'create')
    return json(response, { script: record })
  }
  if (path === '/api/scripts/generate' && method === 'POST') {
    await payload(request)
    return json(response, { script: generatedSnapshot() })
  }

  const item = path.match(/^\/api\/scripts\/items\/([^/]+)$/)
  const versions = path.match(/^\/api\/scripts\/items\/([^/]+)\/versions$/)
  const restore = path.match(/^\/api\/scripts\/items\/([^/]+)\/versions\/([^/]+)\/restore$/)
  const recordId = item?.[1] || versions?.[1] || restore?.[1]
  const record = recordId && records.find(candidate => candidate.id === recordId)
  if (recordId && !record) return json(response, { error: 'Synthetic script not found' }, 404)
  if (item && method === 'GET') return json(response, { script: record })
  if (item && method === 'DELETE') {
    Object.assign(record, { archived: true, status: 'archived' })
    return json(response, { archived: true })
  }
  if (item && method === 'PATCH') {
    const data = await payload(request)
    if (data.revision !== record.revision) {
      return json(response, { error: 'Synthetic script revision changed. Reload and retry.' }, 409)
    }
    applyFields(record, data)
    record.revision += 1
    record.updatedAt = new Date().toISOString()
    addVersion(record, data.summary || 'Updated script')
    return json(response, { script: record })
  }
  if (versions && method === 'GET') {
    return json(response, {
      versions: (histories.get(record.id) || []).map(({ snapshot: _snapshot, ...version }) => version)
    })
  }
  if (restore && method === 'POST') {
    const data = await payload(request)
    const version = histories.get(record.id)?.find(candidate => candidate.id === restore[2])
    if (!version) return json(response, { error: 'Synthetic version not found' }, 404)
    if (data.revision !== record.revision || version.versionNumber === record.revision) {
      return json(response, { error: 'Choose an older version of the current synthetic script' }, 409)
    }
    Object.assign(record, {
      snapshot: structuredClone(version.snapshot),
      title: version.snapshot.title,
      revision: record.revision + 1,
      updatedAt: new Date().toISOString()
    })
    addVersion(record, `Restored v${version.versionNumber}`, 'restore')
    return json(response, { script: record })
  }
  if (method !== 'GET' && method !== 'HEAD') {
    return json(response, { error: 'Unknown mutation blocked by synthetic Scripts preview' }, 405)
  }
  const responses = {
    '/api/projects': { projects: [] },
    '/api/publishing': { providers: [], accounts: [], clips: [], posts: [] },
    '/api/calendar': { posts: [], clips: [] },
    '/api/workspace-agent/runs': { runs: [], has_more: false },
    '/api/workspace-agent/suggestions': { suggestions: [], capabilities: [] },
    '/api/user/profile': { profile: {
      ...user, image: null, provider: 'password', canChangePassword: true,
      recentlyAuthenticated: true, emailVerified: '2026-10-01T09:00:00Z',
      createdAt: '2026-10-01T09:00:00Z'
    } }
  }
  return json(response, responses[path] || {})
}

function proxyOptions(request) {
  const { cookie: _cookie, authorization: _authorization, ...headers } = request.headers
  return {
    hostname: frontend.hostname.replace(/^\[|\]$/g, ''),
    port: frontend.port || 80,
    method: request.method,
    path: request.url,
    headers: { ...headers, host: frontend.host }
  }
}

function proxy(request, response) {
  const upstream = http.request(proxyOptions(request), result => {
    response.writeHead(result.statusCode || 502, result.headers)
    result.pipe(response)
  })
  upstream.on('error', () => {
    if (!response.headersSent) json(response, { error: 'Local Vite is unavailable. Start it first.' }, 502)
    else response.destroy()
  })
  request.on('aborted', () => upstream.destroy())
  response.on('close', () => upstream.destroy())
  request.pipe(upstream)
}

const server = http.createServer((request, response) => {
  const url = new URL(request.url || '/', 'http://127.0.0.1')
  if (!isApi(url.pathname)) return proxy(request, response)
  void api(request, response, url).catch(error => {
    if (!response.headersSent) json(response, { error: error.message }, error.status || 500)
    else response.destroy()
  })
})

server.on('upgrade', (request, socket, head) => {
  const url = new URL(request.url || '/', 'http://127.0.0.1')
  if (isApi(url.pathname)) {
    socket.end('HTTP/1.1 405 Method Not Allowed\r\nConnection: close\r\n\r\n')
    return
  }
  const upstream = http.request(proxyOptions(request))
  upstream.on('upgrade', (result, upstreamSocket, upstreamHead) => {
    const headers = Object.entries(result.headers)
      .flatMap(([name, value]) => (Array.isArray(value) ? value : [value])
        .filter(value => value !== undefined).map(value => `${name}: ${value}`))
    socket.write(`HTTP/1.1 ${result.statusCode} ${result.statusMessage}\r\n${headers.join('\r\n')}\r\n\r\n`)
    if (upstreamHead.length) socket.write(upstreamHead)
    if (head.length) upstreamSocket.write(head)
    socket.pipe(upstreamSocket).pipe(socket)
    socket.on('error', () => upstreamSocket.destroy())
    upstreamSocket.on('error', () => socket.destroy())
  })
  upstream.on('response', result => {
    result.resume()
    socket.end('HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\n\r\n')
  })
  upstream.on('error', () => socket.destroy())
  socket.on('error', () => upstream.destroy())
  upstream.end()
})

server.on('error', error => {
  console.error(`Scripts preview failed: ${error.message}`)
  process.exitCode = 1
})
server.listen(port, '127.0.0.1', () => {
  console.log(`Synthetic Scripts preview: http://127.0.0.1:${port}/en/dashboard/script-generator`)
  console.log(`Static assets and HMR: ${frontend.origin}; all /api and /v1 requests are synthetic.`)
})
