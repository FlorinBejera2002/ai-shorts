import { spawn } from 'node:child_process'
import { readFile, access } from 'node:fs/promises'
import { parseEnv } from 'node:util'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildSchema } from './stripe-integration-schema.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))
const policy = JSON.parse(await readFile(path.join(root, 'config/stripe-sandbox-policy.json'), 'utf8'))
const local = parseEnv(await readFile(path.join(root, '.env'), 'utf8'))
const env = { ...local, ...process.env }
if (env.STRIPE_MODE !== 'test' || !/^(sk|rk)_test_[A-Za-z0-9]{16,}$/.test(env.STRIPE_SECRET_KEY ?? '')) {
  throw new Error('Real-provider tests require STRIPE_MODE=test and a sandbox key in the ignored local environment.')
}
if (!policy.expectedAccountId || env.STRIPE_EXPECTED_ACCOUNT_ID !== policy.expectedAccountId) {
  throw new Error('Explicit expected sandbox account must match the reviewed policy.')
}
if (!env.SNEEPCUT_TEST_DATABASE_URL) throw new Error('Set the dedicated loopback SNEEPCUT_TEST_DATABASE_URL.')
const schema = await buildSchema(root)
env.SNEEPCUT_TEST_SCHEMA_SQL = schema.path
env.STRIPE_SANDBOX_RUN = '1'
env.GOCACHE = path.join(root, '.cache/go-build')
if (process.argv.includes('--browser')) env.STRIPE_SANDBOX_BROWSER_HOLD_SECONDS = '900'
if (process.argv.includes('--verify-delivery')) env.STRIPE_SANDBOX_VERIFY_DELIVERY = '1'
if (/^whsec_[A-Za-z0-9]+$/.test(env.STRIPE_WEBHOOK_SECRET ?? '')) {
  env.STRIPE_SANDBOX_WEBHOOK_SECRET = env.STRIPE_WEBHOOK_SECRET
}
const bundledGo = path.join(root, '.cache/toolchains/go/bin/go.exe')
const go = await access(bundledGo).then(() => bundledGo, () => 'go')
const child = spawn(go, ['test', '-tags', 'stripe_sandbox', './internal/billing', '-run', '^TestStripeSandbox$', '-count=1', '-v', '-timeout', '35m'], {
  cwd: path.join(root, 'backend'), env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe']
})
const redact = text => text.replace(/(?:sk|rk|pk)_(?:test|live)_[A-Za-z0-9]+|whsec_[A-Za-z0-9]+|[A-Za-z0-9_]+_secret_[A-Za-z0-9]+/g, '[REDACTED]')
// Line buffering keeps a credential split across stream chunks out of output.
for (const [stream, output] of [[child.stdout, process.stdout], [child.stderr, process.stderr]]) {
  let pending = ''
  stream.setEncoding('utf8')
  stream.on('data', chunk => {
    pending += chunk
    const lines = pending.split('\n')
    pending = lines.pop()
    for (const line of lines) output.write(redact(line) + '\n')
  })
  stream.on('end', () => { if (pending) output.write(redact(pending)) })
}
child.on('error', () => { console.error('Unable to start the sandbox test process.'); process.exitCode = 1 })
child.on('exit', code => { process.exitCode = code ?? 1 })
