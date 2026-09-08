// Build development images first. Runs disposable probes, with no DB/media mounts.
import assert from 'node:assert/strict'
import { spawn, execFileSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const root = process.cwd()
mkdirSync('.cache', { recursive: true })
const dir = mkdtempSync(path.join(root, '.cache', 'dev-reload-'))
const docker = (...args) => execFileSync('docker', args, { encoding: 'utf8', windowsHide: true })
const original = JSON.parse(docker('compose', '-f', 'docker-compose.yml', '-f', 'docker-compose.dev.yml', 'config', '--format', 'json'))
const config = { services: {} }
const fixture = (name) => {
  const target = path.join(dir, name)
  mkdirSync(target, { recursive: true })
  return target
}
const go = fixture('go')
const python = fixture('python')
const src = fixture('src')
const messages = fixture('messages')
cpSync('frontend/src', src, { recursive: true })
cpSync('frontend/messages', messages, { recursive: true })
const route = path.join(src, 'app/api/reload-probe/route.ts')
mkdirSync(path.dirname(route), { recursive: true })
const writeRoute = (v) => writeFileSync(route, `import messages from '../../../../messages/en.json'; export function GET() { return Response.json({source:'${v}', translation:messages.common.save}) }`)
const writeGo = (v) => writeFileSync(path.join(go, 'reload_probe.go'), `package main\nimport ("fmt"; "time")\nfunc main() {fmt.Println("${v}"); for {time.Sleep(time.Second)}}\n`)
const writePython = (v) => writeFileSync(path.join(python, 'reload_probe.py'), `import time\nprint('${v}', flush=True)\nwhile True: time.sleep(1)\n`)
writeGo('go-v1')
writePython('python-v1')
writeRoute('source-v1')
for (const name of ['backend-go', 'worker', 'job-dispatcher']) {
  const service = original.services[name]
  const isGo = name === 'backend-go'
  const command = isGo ? ['go', 'run', './reload_probe.go'] : ['python', '/app/app/reload_probe.py']
  config.services[name] = {
    image: service.image,
    user: '10001:10001',
    entrypoint: [], command,
    working_dir: isGo ? '/src' : '/app',
    environment: isGo ? { GOCACHE: service.environment.GOCACHE, GOFLAGS: '-p=1', GOMAXPROCS: '2' } : {},
    ...(isGo ? { tmpfs: service.tmpfs } : {}),
    stop_grace_period: '1s',
    develop: { watch: service.develop.watch.map((rule) => ({ ...rule, path: isGo ? go : python })) }
  }
}
config.services.frontend = {
  image: original.services.frontend.image,
  command: ['npm', 'run', 'dev'],
  environment: { WATCHPACK_POLLING: 'true', GO_API_URL: 'http://127.0.0.1:9' },
  volumes: original.services.frontend.volumes
    .filter((volume) => ['/app/src', '/app/messages'].includes(volume.target))
    .map((volume) => ({ ...volume, source: volume.target === '/app/src' ? src : messages })),
  ports: ['127.0.0.1::3000']
}
assert.equal(config.services.frontend.volumes.length, 2, 'Dev must mount both source and translations')
const file = path.join(dir, 'compose.json')
writeFileSync(file, JSON.stringify(config))
const args = ['compose', '-p', `reload-probe-${process.pid}`, '-f', file]
const compose = (...rest) => docker(...args, ...rest)
const waitFor = async (label, check, timeout = 180000) => {
  const until = Date.now() + timeout
  while (Date.now() < until) {
    if (await check()) return
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }
  throw new Error(`Timed out: ${label}`)
}
let watcher
let watchOutput = ''
try {
  compose('create')
  for (const [name, source, target] of [['backend-go', go, '/src'], ['worker', python, '/app/app'], ['job-dispatcher', python, '/app/app']]) {
    compose('cp', `${source}/.`, `${name}:${target}`)
  }
  compose('start')
  watcher = spawn('docker', [...args, 'watch', '--no-up'], { windowsHide: true })
  watcher.stdout.on('data', (chunk) => { watchOutput += chunk })
  watcher.stderr.on('data', (chunk) => { watchOutput += chunk })
  await waitFor('watch startup', () => /Watch enabled|watching/i.test(watchOutput))
  const ids = Object.fromEntries(Object.keys(config.services).map((name) => [name, compose('ps', '-q', name).trim()]))
  const started = (name) => docker('inspect', ids[name], '--format', '{{.State.StartedAt}}').trim()
  for (const [name, marker] of [['backend-go', 'go-v1'], ['worker', 'python-v1'], ['job-dispatcher', 'python-v1']]) {
    await waitFor(`${name} initial run`, () => docker('logs', ids[name]).includes(marker))
  }
  const before = Object.fromEntries(Object.keys(ids).map((name) => [name, started(name)]))
  writeGo('go-v2')
  await waitFor('Go recompilation', () => docker('logs', ids['backend-go']).includes('go-v2'))
  assert.notEqual(started('backend-go'), before['backend-go'])
  for (const name of ['worker', 'job-dispatcher', 'frontend']) assert.equal(started(name), before[name])
  console.log('PASS: Go edit synchronized, recompiled and restarted only Go')
  writePython('python-v2')
  for (const name of ['worker', 'job-dispatcher']) {
    await waitFor(`${name} reload`, () => docker('logs', ids[name]).includes('python-v2'))
    assert.notEqual(started(name), before[name])
  }
  console.log('PASS: Python edit synchronized and restarted both Python services')
  const address = compose('port', 'frontend', '3000').trim()
  const probe = async () => {
    try { return await (await fetch(`http://${address}/api/reload-probe`, { signal: AbortSignal.timeout(5000) })).json() } catch { return {} }
  }
  await waitFor('Next.js initial response', async () => (await probe()).source === 'source-v1')
  writeRoute('source-v2')
  const messageFile = path.join(messages, 'en.json')
  const content = JSON.parse(readFileSync(messageFile, 'utf8'))
  content.common.save = 'translation-v2'
  writeFileSync(messageFile, JSON.stringify(content))
  await waitFor('Next.js source and translation reload', async () => {
    const result = await probe()
    return result.source === 'source-v2' && result.translation === 'translation-v2'
  })
  assert.equal(started('frontend'), before.frontend)
  console.log('PASS: Next.js source and translations updated without container restart')
} catch (error) {
  console.error(watchOutput)
  throw error
} finally {
  try {
    if (watcher && watcher.exitCode === null) {
      if (process.platform === 'win32') {
        // Docker launches Compose as a child; stop both so Watch cannot linger.
        const taskkill = path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'taskkill.exe')
        execFileSync(taskkill, ['/PID', String(watcher.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' })
      } else {
        watcher.kill()
      }
    }
  } finally {
    compose('down', '--remove-orphans')
  }
}
