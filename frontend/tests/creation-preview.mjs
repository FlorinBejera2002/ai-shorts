// From frontend/: node tests/creation-preview.mjs
// Optional FRONTEND_ORIGIN=http://127.0.0.1:5173, CREATION_PREVIEW_PORT=5189.
// Static assets/HMR proxy to local Vite; every API and provider request is synthetic.
import assert from 'node:assert/strict'
import http from 'node:http'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { syntheticMp4Response } from './fixtures/synthetic-media.mjs'
import { previewRuntime } from './fixtures/create-clips/preview-runtime.mjs'
import {
  audioURL, creationId, defaultOptions, jobId, jobStates, limits, musicTrack, photoURL,
  previewUser, silentWav, sourceAssets, storyId, storyProject, storyStates, youtubeJob
} from './fixtures/create-clips/workspace.mjs'

const frontend = new URL(process.env.FRONTEND_ORIGIN || 'http://127.0.0.1:5173')
assert.equal(frontend.protocol, 'http:', 'Use local HTTP Vite')
assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(frontend.hostname), 'Vite must be loopback')
assert.equal(frontend.pathname, '/', 'FRONTEND_ORIGIN must be an origin')
const port = Number(process.env.CREATION_PREVIEW_PORT || 5189)
assert.ok(Number.isInteger(port) && port > 0 && port <= 65535, 'Invalid preview port')
assert.notEqual(port, Number(frontend.port || 80), 'Preview must use a separate port')
const photo = await readFile(fileURLToPath(new URL('./fixtures/create-clips/studio-source.png', import.meta.url)))
const wav = silentWav()
const projects = new Map(storyStates.map(state => [storyId(state), storyProject(state)]))
const jobs = new Map(jobStates.filter(state => state !== 'load-error').map(state => [jobId(state), youtubeJob(state)]))
const allowedStates = new Set([...storyStates, ...jobStates.map(state => `job-${state}`), 'youtube', 'batch', 'credits-low', 'unlimited', 'load-error'])
const calls = []
const assistantHistory = []
let nextJob = 7950

function json(response, body, status = 200) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
  response.end(JSON.stringify(body))
}
function selectedState(request) {
  return request.headers.cookie?.match(/(?:^|;\s*)creation-preview-state=([^;]+)/)?.[1] || 'draft'
}
function userFor(request) {
  const state = selectedState(request)
  return { ...previewUser, credits: state === 'credits-low' ? 20 : state === 'unlimited' ? 0 : 360,
    access_role: state === 'unlimited' ? 'admin' : 'member' }
}
async function consume(request, max = 1024 * 1024) {
  const chunks = []
  let length = 0
  for await (const chunk of request) {
    length += chunk.length
    if (length > max) throw Object.assign(new Error('Synthetic preview request is too large'), { status: 413 })
    chunks.push(chunk)
  }
  return Buffer.concat(chunks).toString('utf8')
}
async function payload(request) {
  try { return JSON.parse((await consume(request)) || '{}') }
  catch (error) { throw error.status ? error : Object.assign(new Error('Expected JSON'), { status: 400 }) }
}

async function api(request, response, url) {
  const path = url.pathname
  const method = request.method || 'GET'
  const user = userFor(request)
  if (path === '/v1/auth/refresh' && method === 'POST') return json(response, { access_token: 'synthetic-creation-preview-token', user })
  if (path === '/api/user/credits' && method === 'GET') return json(response, { credits: user.credits, creditsUnlimited: user.access_role === 'admin' })
  if (path === '/api/user/brand' && method === 'GET') return json(response, { brandKit: null })
  if (path === '/api/user/brand/fonts' && method === 'GET') return json(response, { fonts: [
    { id: 'builtin:inter', family: 'Inter', category: 'builtin', weights: [400, 500, 600, 700, 800], archived: false }
  ] })
  if (path === '/api/media-capabilities' && method === 'GET') return json(response, { audio_cleanup: { available: true } })
  if (path === '/api/music' && method === 'GET') {
    const query = (url.searchParams.get('query') || '').toLowerCase()
    const tracks = `${musicTrack.title} ambient calm`.toLowerCase().includes(query) ? [musicTrack] : []
    return json(response, { tracks, total: tracks.length, page: 1, has_more: false })
  }
  if (path === `/api/music/${musicTrack.id}` && method === 'GET') return json(response, musicTrack)
  if (path === '/api/workspace-agent/runs' && method === 'GET') return json(response, { runs: [], has_more: false })
  if (path === '/api/workspace-agent/suggestions' && method === 'GET') return json(response, { suggestions: [], capabilities: [] })
  if (path === '/api/assistant/history' && method === 'GET') return json(response, { messages: assistantHistory })
  if (path === '/api/assistant/history' && method === 'DELETE') {
    assistantHistory.length = 0
    return json(response, { cleared: true })
  }
  if (path === '/api/assistant/chat' && method === 'POST') {
    const data = await payload(request)
    calls.push({ path, method, data })
    const reply = 'Synthetic preview: configured three square clips.'
    const actions = [
      { type: 'update_settings', settings: { clips: 3, aspect_ratio: '1:1', subtitle_style: 'bold' } },
      { type: 'set_instructions', instructions: 'Keep the strongest practical tips.' }
    ]
    assistantHistory.push({ id: creationId(assistantHistory.length + 7970), role: 'user', content: String(data.message || '') },
      { id: creationId(assistantHistory.length + 7971), role: 'assistant', content: reply, actions })
    return json(response, { reply, actions })
  }
  if (path === '/api/upload/authorize' && method === 'POST') {
    await payload(request)
    return json(response, { uploadUrl: '/api/upload', token: null })
  }
  if (['/api/upload', '/api/upload/narration'].includes(path) && method === 'POST') {
    await consume(request, 8 * 1024 * 1024)
    return json(response, { file_path: 'synthetic-preview/upload.mp4' })
  }
  if (path === '/api/stories' && method === 'GET') return json(response, { stories: [...projects.values()], limits })
  if (path === '/api/stories' && method === 'POST') {
    const data = await payload(request)
    if (!/^[\da-f-]{36}$/i.test(data.id || '')) return json(response, { error: 'Synthetic project requires a UUID' }, 400)
    const project = { ...storyProject('empty'), id: data.id, title: 'New studio story', options: data.options || defaultOptions }
    projects.set(project.id, project)
    calls.push({ path, method, data })
    return json(response, project)
  }
  const match = /^\/api\/stories\/([^/]+)(.*)$/.exec(path)
  if (match) {
    if (selectedState(request) === 'load-error') return json(response, { error: 'Synthetic project connection failure' }, 503)
    const project = projects.get(match[1])
    if (!project) return json(response, { error: 'Synthetic story not found' }, 404)
    const suffix = match[2]
    if (!suffix && method === 'GET') return json(response, project)
    if (!suffix && method === 'DELETE') { projects.delete(project.id); return json(response, { deleted: true }) }
    if (!suffix && method === 'PATCH') {
      const data = await payload(request)
      if (data.options) project.options = { ...project.options, ...data.options }
      if (Array.isArray(data.assets)) project.assets = data.assets
      calls.push({ path, method, data })
      return json(response, project)
    }
    if (suffix === '/assets' && method === 'POST') {
      const data = await payload(request)
      if (data.replace_asset_id) project.assets = project.assets.filter(item => item.id !== data.replace_asset_id)
      project.assets.push({ ...sourceAssets()[0], id: data.id, name: data.name,
        kind: data.kind === 'narration' ? 'narration' : 'video', order: data.order ?? project.assets.length,
        ...(data.kind === 'narration' ? { source_url: audioURL, proxy_url: audioURL, duration: 2 } : {}) })
      return json(response, project)
    }
    const asset = /^\/assets\/([^/]+)$/.exec(suffix)
    if (asset && method === 'DELETE') {
      project.assets = project.assets.filter(item => item.id !== asset[1])
      return json(response, project)
    }
    if (asset && method === 'PATCH') {
      const data = await payload(request)
      const item = project.assets.find(item => item.id === asset[1])
      if (!item) return json(response, { error: 'Synthetic source not found' }, 404)
      Object.assign(item, data)
      return json(response, project)
    }
    if (['/generate', '/retry', '/transcript-review', '/cancel'].includes(suffix) && method === 'POST') {
      const data = await payload(request)
      calls.push({ path, method, data })
      if (suffix === '/transcript-review') return json(response, project)
      if (selectedState(request) === 'error') return json(response, { error: 'Synthetic generation failure; draft is retained.' }, 503)
      if (suffix === '/cancel') project.status = 'cancelled'
      else Object.assign(project, { status: 'analyzing', stage: 'analyzing', message: 'Reviewing source footage', error: undefined })
      return json(response, project)
    }
  }
  if (path === '/api/jobs' && method === 'GET') return json(response, { jobs: [...jobs.values()], total: jobs.size })
  if (['/api/jobs', '/api/jobs/batch'].includes(path) && method === 'POST') {
    const data = await payload(request)
    calls.push({ path, method, data })
    const urls = path.endsWith('/batch') ? data.source_urls : [data.source_url]
    const created = (urls || []).map(source_url => {
      const job = { ...youtubeJob('processing', creationId(nextJob++)), source_url }
      jobs.set(job.id, job)
      return job
    })
    return json(response, path.endsWith('/batch') ? { jobs: created } : { id: created[0]?.id })
  }
  const job = /^\/api\/jobs\/([^/]+)(.*)$/.exec(path)
  if (job) {
    if (job[1] === jobId('load-error')) return json(response, { error: 'Synthetic job connection failure' }, 503)
    const record = jobs.get(job[1])
    if (!record) return json(response, { error: 'Synthetic job not found' }, 404)
    if (!job[2] && method === 'GET') return json(response, { job: record })
    if (['/retry', '/cancel'].includes(job[2]) && method === 'POST') {
      const data = await payload(request)
      calls.push({ path, method, data })
      record.status = job[2] === '/cancel' ? 'cancelled' : 'transcribing'
      return json(response, { job: record })
    }
  }
  if (path === '/api/clips' && method === 'GET') return json(response, { clips: [], jobs: [...jobs.values()], total: 0 })
  if (path === '/api/dashboard' && method === 'GET') return json(response, { metrics: { credits: user.credits, plan: user.plan,
    jobCount: jobs.size, clipCount: 0, durationMinutes: 0, activity: [], statuses: {} }, recentClips: [] })
  if (method !== 'GET' && method !== 'HEAD') return json(response, { error: 'Unknown mutation blocked by synthetic Create clips preview' }, 405)
  const empty = { '/api/projects': { projects: [] }, '/api/publishing': { providers: [], accounts: [], clips: [], posts: [] },
    '/api/calendar': { posts: [], clips: [] } }
  return json(response, empty[path] || {})
}

function proxyOptions(request) {
  const { cookie: _cookie, authorization: _authorization, ...headers } = request.headers
  return { hostname: frontend.hostname.replace(/^\[|\]$/g, ''), port: frontend.port || 80,
    method: request.method, path: request.url, headers: { ...headers, host: frontend.host, 'accept-encoding': 'identity' } }
}
function proxy(request, response) {
  const upstream = http.request(proxyOptions(request), result => {
    const headers = { ...result.headers }
    if (!headers['content-type']?.includes('text/html')) {
      response.writeHead(result.statusCode || 502, headers)
      return result.pipe(response)
    }
    const chunks = []
    result.on('data', chunk => chunks.push(chunk))
    result.on('end', () => {
      const script = `<script>(${previewRuntime.toString()})();</script>`
      const html = Buffer.concat(chunks).toString('utf8').replace('<head>', '<head>' + script)
      delete headers['content-length']; delete headers['content-encoding']
      headers['content-security-policy'] = `default-src 'self' data: blob:; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' data: blob:; connect-src 'self' ws://127.0.0.1:${port} ws://${frontend.host}; font-src 'self' data:; worker-src 'self' blob:; object-src 'none'`
      response.writeHead(result.statusCode || 502, headers)
      response.end(html)
    })
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
  const method = request.method || 'GET'
  if (url.pathname.startsWith('/__creation-fixtures/') && !['GET', 'HEAD'].includes(method)) {
    return json(response, { error: 'Synthetic media and metadata are read only' }, 405)
  }
  if (url.pathname === '/__creation-preview') {
    if (method !== 'GET') return json(response, { error: 'Preview controls are read only' }, 405)
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    return response.end(`<h1>Synthetic Create clips workspace</h1><p>No real uploads, providers, credits or jobs.</p><ul>${[...allowedStates].map(state => `<li><a href="/dashboard/create?fixture=${state}">${state}</a></li>`).join('')}</ul>`)
  }
  if (url.pathname === '/__creation-fixtures/oembed') return json(response, { title: 'Morning studio tour', author_name: 'Demo studio', thumbnail_url: photoURL })
  if (url.pathname === photoURL) { response.writeHead(200, { 'Content-Type': 'image/png' }); return response.end(photo) }
  if (url.pathname === audioURL) { response.writeHead(200, { 'Content-Type': 'audio/wav' }); return response.end(wav) }
  if (url.pathname === '/__creation-fixtures/studio-source.mp4') {
    const data = syntheticMp4Response(request.headers.range)
    response.writeHead(data.status || 200, { 'Content-Type': data.contentType, ...data.headers })
    return response.end(data.body)
  }
  if (/^\/(api|v1)(\/|$)/.test(url.pathname)) {
    void api(request, response, url).catch(error => {
      if (!response.headersSent) json(response, { error: error.message }, error.status || 500)
      else response.destroy()
    })
    return
  }
  if (!['GET', 'HEAD'].includes(method)) return json(response, { error: 'Unknown mutation blocked by synthetic preview' }, 405)
  const state = url.searchParams.get('fixture')
  if (state) {
    if (!allowedStates.has(state)) return json(response, { error: 'Unknown synthetic fixture' }, 400)
    response.setHeader('Set-Cookie', `creation-preview-state=${state}; Path=/; SameSite=Strict; HttpOnly`)
    if (state.startsWith('job-')) url.pathname = `/dashboard/jobs/${jobId(state.slice(4))}`
    else if (storyStates.includes(state) || state === 'load-error') url.searchParams.set('story', storyId(state === 'load-error' ? 'draft' : state))
    else url.searchParams.set('mode', state === 'batch' ? 'batch' : 'youtube')
    const redirect = url.pathname + url.search
    if (redirect !== request.url) { response.writeHead(302, { Location: redirect }); return response.end() }
  } else if (/^\/(en\/|ro\/)?dashboard\/create$/.test(url.pathname) && !url.searchParams.has('mode') && !url.searchParams.has('story')) {
    response.writeHead(302, { Location: url.pathname + '?story=' + storyId('draft') })
    return response.end()
  }
  proxy(request, response)
})

server.on('upgrade', (request, socket, head) => {
  if (/^\/(api|v1)(\/|$)/.test(new URL(request.url, 'http://127.0.0.1').pathname)) return socket.end('HTTP/1.1 405 Method Not Allowed\r\n\r\n')
  const upstream = http.request(proxyOptions(request))
  upstream.on('upgrade', (result, upstreamSocket, upstreamHead) => {
    const headers = Object.entries(result.headers).flatMap(([name, value]) => (Array.isArray(value) ? value : [value])
      .filter(value => value !== undefined).map(value => `${name}: ${value}`))
    socket.write(`HTTP/1.1 ${result.statusCode} ${result.statusMessage}\r\n${headers.join('\r\n')}\r\n\r\n`)
    if (upstreamHead.length) socket.write(upstreamHead)
    if (head.length) upstreamSocket.write(head)
    socket.pipe(upstreamSocket).pipe(socket)
    socket.on('error', () => upstreamSocket.destroy())
    upstreamSocket.on('error', () => socket.destroy())
  })
  upstream.on('response', result => { result.resume(); socket.end('HTTP/1.1 502 Bad Gateway\r\n\r\n') })
  upstream.on('error', () => socket.destroy())
  socket.on('error', () => upstream.destroy())
  upstream.end()
})
server.on('error', error => { console.error(`Create clips preview failed: ${error.message}`); process.exitCode = 1 })
server.listen(port, '127.0.0.1', () => {
  console.log(`Synthetic Create clips preview: http://127.0.0.1:${port}/__creation-preview`)
  console.log(`Vite/HMR ${frontend.origin}; all API and provider calls stay synthetic. Restart resets all drafts.`)
})
