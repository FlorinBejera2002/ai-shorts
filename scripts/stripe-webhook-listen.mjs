import { spawn } from 'node:child_process'
import { appendFile, readFile, writeFile, mkdir, rename, rm } from 'node:fs/promises'
import { randomBytes } from 'node:crypto'
import { parseEnv } from 'node:util'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { API_VERSION, WEBHOOK_EVENTS } from './stripe-sandbox.mjs'

const FORWARD_TO = 'http://127.0.0.1:58081/api/webhooks/stripe'

export function validateListenerEnvironment(environment) {
  if (environment.STRIPE_MODE !== 'test' || !/^acct_[A-Za-z0-9]+$/.test(environment.STRIPE_EXPECTED_ACCOUNT_ID ?? '') || !/^(sk|rk)_test_[A-Za-z0-9]{16,}$/.test(environment.STRIPE_SECRET_KEY ?? '')) {
    throw new Error('Explicit sandbox key, mode and expected account ID are required')
  }
}

export async function saveSigningSecret(root, secret) {
  if (!/^whsec_[A-Za-z0-9]{16,}$/.test(secret)) throw new Error('Invalid listener signing secret')
  const destination = path.join(root, '.env')
  const previous = await readFile(destination, 'utf8')
  validateListenerEnvironment(parseEnv(previous))
  const assignment = `STRIPE_WEBHOOK_SECRET=${secret}`
  const next = /^STRIPE_WEBHOOK_SECRET\s*=.*$/m.test(previous)
    ? previous.replace(/^STRIPE_WEBHOOK_SECRET\s*=.*$/gm, () => assignment)
    : `${previous.trimEnd()}\n${assignment}\n`
  const scratch = path.join(root, '.cache', 'tmp', 'stripe-billing')
  await mkdir(scratch, { recursive: true })
  const temporary = path.join(scratch, `environment-${randomBytes(8).toString('hex')}.tmp`)
  try {
    await writeFile(temporary, next, { mode: 0o600, flag: 'wx' })
    await rename(temporary, destination)
  } finally {
    await rm(temporary, { force: true })
  }
}

// Forward only structural event evidence. Never pass through arbitrary CLI text,
// which can include signing secrets, request payloads or provider error details.
export function safeListenerEvidence(line) {
  const event = /-->\s+([a-z_.]+)\s+\[(evt_[A-Za-z0-9]+)\]/.exec(line)
  if (event) return { eventType: event[1], eventId: event[2], phase: 'received' }
  const response = /<--\s+\[(\d{3})\]/.exec(line)
  if (response) return { eventId: /\b(evt_[A-Za-z0-9]+)\b/.exec(line)?.[1] ?? null, httpStatus: Number(response[1]), phase: 'forwarded' }
  if (/connection refused|dial tcp|failed to post/i.test(line)) return { phase: 'transport_error', code: /connection refused/i.test(line) ? 'connection_refused' : 'forwarding_failed' }
  if (/invalid api key|unauthorized/i.test(line)) return { phase: 'transport_error', code: 'authentication_failed' }
  return null
}

export async function listen(root) {
  const environment = parseEnv(await readFile(path.join(root, '.env'), 'utf8'))
  validateListenerEnvironment(environment)
  const manifest = JSON.parse(await readFile(path.join(root, 'config', 'stripe-sandbox-manifest.json'), 'utf8'))
  if (manifest.account.id !== environment.STRIPE_EXPECTED_ACCOUNT_ID || manifest.account.livemode !== false) throw new Error('Sandbox manifest and environment identity differ')
  let response
  try {
    response = await fetch('https://api.stripe.com/v1/account', {
      headers: { Authorization: `Bearer ${environment.STRIPE_SECRET_KEY}`, 'Stripe-Version': API_VERSION },
      signal: AbortSignal.timeout(15000), redirect: 'error',
    })
    const account = await response.json()
    if (!response.ok || account.id !== environment.STRIPE_EXPECTED_ACCOUNT_ID) throw new Error('identity')
  } catch { throw new Error('Could not verify the expected Stripe sandbox before starting listener') }

  const cliPackage = `cli-${process.platform}-${process.arch}`
  const executable = process.platform === 'win32' ? 'stripe.exe' : 'stripe'
  const cli = path.join(root, '.cache', 'tmp', 'stripe-billing', 'cli', 'node_modules', '@stripe', cliPackage, 'bin', executable)
  const evidencePath = path.join(root, 'frontend', 'test-results', 'stripe-deliveries.jsonl')
  await mkdir(path.dirname(evidencePath), { recursive: true })
  let evidenceWrites = Promise.resolve()
  const record = value => {
    const entry = { recordedAt: new Date().toISOString(), ...value }
    evidenceWrites = evidenceWrites.then(() => appendFile(evidencePath, `${JSON.stringify(entry)}\n`))
    return evidenceWrites
  }
  const child = spawn(cli, ['listen', '--skip-update', '--color', 'off', '--events-from', '@self', '--events', WEBHOOK_EVENTS.join(','), '--forward-to', FORWARD_TO], {
    cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, STRIPE_API_KEY: environment.STRIPE_SECRET_KEY, STRIPE_INSTALL_METHOD: 'npm_local' },
  })
  let signingSecretSaved = false
  let saving = false
  let observedAPIVersion = null
  let failure = false
  const statusPath = path.join(root, '.cache', 'tmp', 'stripe-billing', 'listener-status.json')
  const status = state => writeFile(statusPath, `${JSON.stringify({ state, processId: process.pid, cliProcessId: child.pid, accountId: environment.STRIPE_EXPECTED_ACCOUNT_ID, forwardTo: FORWARD_TO, signingSecretSaved, observedAPIVersion, applicationAPIVersion: API_VERSION, cliVersionOverrideSupported: false, persistentEndpointCreated: false }, null, 2)}\n`)
  await status('starting')
  await record({ phase: 'listener_starting', accountId: environment.STRIPE_EXPECTED_ACCOUNT_ID, cliProcessId: child.pid, forwardTo: FORWARD_TO })
  const onLine = async raw => {
    const line = raw.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '')
    const version = /\b(20\d\d-\d\d-\d\d\.[a-z]+)\b/.exec(line)
    if (version) observedAPIVersion = version[1]
    const secret = /\bwhsec_[A-Za-z0-9]{16,}\b/.exec(line)?.[0]
    if (secret && !saving && !signingSecretSaved) {
      saving = true
      try {
        await saveSigningSecret(root, secret)
        signingSecretSaved = true
        await status('ready')
        await record({ phase: 'listener_ready', accountId: environment.STRIPE_EXPECTED_ACCOUNT_ID, cliProcessId: child.pid, observedAPIVersion, applicationAPIVersion: API_VERSION, signingSecretSaved: true })
        console.log(`Stripe sandbox listener ready on loopback58081; signing secret saved securely; CLI PID ${child.pid}.`)
        if (observedAPIVersion) console.log(`Listener account payload version: ${observedAPIVersion}; application requests use ${API_VERSION}.`)
      } catch {
        failure = true
        console.error('Could not save sandbox listener configuration; no provider output or secret was printed.')
        child.kill()
      }
    }
    const evidence = safeListenerEvidence(line)
    if (evidence) { await record(evidence); console.log(JSON.stringify(evidence)) }
  }
  for (const stream of [child.stdout, child.stderr]) {
    let pending = ''
    stream.on('data', chunk => {
      pending += chunk.toString('utf8')
      const lines = pending.split(/[\r\n]/)
      pending = lines.pop().slice(-8192)
      lines.forEach(line => { onLine(line).catch(() => { failure = true; child.kill() }) })
    })
    stream.on('end', () => { if (pending) onLine(pending).catch(() => { failure = true }) })
  }
  const stop = () => child.kill()
  process.once('SIGINT', stop)
  process.once('SIGTERM', stop)
  const code = await new Promise(resolve => {
    child.once('error', () => { failure = true; resolve(1) })
    child.once('close', value => resolve(value ?? 0))
  })
  await status('stopped')
  await record({ phase: 'listener_stopped', cliProcessId: child.pid, exitCode: code, failure })
  process.removeListener('SIGINT', stop)
  process.removeListener('SIGTERM', stop)
  if (failure || code || !signingSecretSaved) throw new Error('Stripe sandbox listener stopped before successful completion; inspect safe status evidence')
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  listen(fileURLToPath(new URL('../', import.meta.url))).catch(() => {
    console.error('Stripe sandbox listener failed; check local prerequisites, identity and connectivity. Secrets and raw provider output were suppressed.')
    process.exitCode = 1
  })
}
