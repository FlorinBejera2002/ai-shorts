import { createHmac } from 'node:crypto'
import { appendFile, mkdir, readFile } from 'node:fs/promises'
import { parseEnv } from 'node:util'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { API_VERSION } from './stripe-sandbox.mjs'
import { validateListenerEnvironment } from './stripe-webhook-listen.mjs'

const DESTINATION = 'http://127.0.0.1:58081/api/webhooks/stripe'

export function signEvent(body, secret, timestamp) {
  if (!/^whsec_[A-Za-z0-9]{16,}$/.test(secret ?? '')) throw new Error('A securely configured sandbox webhook signing secret is required')
  const signature = createHmac('sha256', secret).update(`${timestamp}.`).update(body).digest('hex')
  return `t=${timestamp},v1=${signature}`
}

export async function replayEvent(environment, expectedAccountId, eventId, fetcher = fetch) {
  validateListenerEnvironment(environment)
  if (environment.STRIPE_EXPECTED_ACCOUNT_ID !== expectedAccountId) throw new Error('Sandbox manifest and environment identity differ')
  if (!/^evt_[A-Za-z0-9]+$/.test(eventId ?? '')) throw new Error('A valid sandbox event ID is required')
  // Validate secret before any API call, without exposing it in an exception.
  signEvent('', environment.STRIPE_WEBHOOK_SECRET, 1)
  const headers = { Authorization: `Bearer ${environment.STRIPE_SECRET_KEY}`, 'Stripe-Version': API_VERSION }
  const get = resource => fetcher(`https://api.stripe.com/v1${resource}`, { headers, redirect: 'error', signal: AbortSignal.timeout(15000) })
  const accountResponse = await get('/account')
  const account = await accountResponse.json()
  if (!accountResponse.ok || account.id !== expectedAccountId) throw new Error('Stripe sandbox identity verification failed')
  const response = await get(`/events/${eventId}`)
  if (!response.ok) throw new Error('Could not retrieve the requested sandbox event')
  const body = await response.text()
  if (Buffer.byteLength(body) > 1024 * 1024) throw new Error('Event exceeds webhook payload limit')
  let event
  try { event = JSON.parse(body) } catch { throw new Error('Stripe returned an invalid event') }
  if (event.id !== eventId || event.object !== 'event' || event.livemode !== false || (event.account && event.account !== expectedAccountId)) throw new Error('Event does not belong to the expected sandbox context')
  const attempts = []
  for (let attempt = 1; attempt <= 2; attempt++) {
    const timestamp = Math.floor(Date.now() / 1000)
    const delivery = await fetcher(DESTINATION, {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15000), body,
      headers: { 'Content-Type': 'application/json', 'Stripe-Signature': signEvent(body, environment.STRIPE_WEBHOOK_SECRET, timestamp) },
    })
    let result
    try { result = await delivery.json() } catch { result = null }
    attempts.push({ attempt, eventId, httpStatus: delivery.status, duplicate: typeof result?.duplicate === 'boolean' ? result.duplicate : null, transport: 'local_replay_of_retrieved_stripe_event' })
  }
  return attempts
}

async function main(root) {
  if (process.argv.length !== 3) throw new Error('Usage: node scripts/stripe-sandbox-replay.mjs <evt_id>')
  const environment = parseEnv(await readFile(path.join(root, '.env'), 'utf8'))
  const manifest = JSON.parse(await readFile(path.join(root, 'config', 'stripe-sandbox-manifest.json'), 'utf8'))
  if (manifest.account.livemode !== false) throw new Error('Only the verified sandbox manifest may be used')
  const results = await replayEvent(environment, manifest.account.id, process.argv[2])
  const evidence = path.join(root, 'frontend', 'test-results', 'stripe-replays.jsonl')
  await mkdir(path.dirname(evidence), { recursive: true })
  for (const result of results) {
    const record = { recordedAt: new Date().toISOString(), ...result }
    await appendFile(evidence, `${JSON.stringify(record)}\n`)
    console.log(JSON.stringify(record))
  }
  if (results.some(result => result.httpStatus !== 200) || results[1].duplicate !== true) process.exitCode = 1
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main(fileURLToPath(new URL('../', import.meta.url))).catch(() => {
    console.error('Sandbox event replay failed; verify account, event ID, ignored environment and local harness availability. No secret, event body or provider error was printed.')
    process.exitCode = 1
  })
}
