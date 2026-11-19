import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

function load(relative, imports = {}) {
  const exports = {}
  const source = readFileSync(new URL(relative, import.meta.url), 'utf8')
  vm.runInNewContext(
    ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
    }).outputText,
    {
      exports,
      URL,
      require: (name) => {
        if (!(name in imports)) throw Error(`Unexpected import ${name}`)
        return imports[name]
      }
    }
  )
  return exports
}

// The sidebar reuses the Billing page's helpers, loaded here unchanged.
const billing = load('../src/lib/billing.ts')
const overview = load('../src/components/billing/billing-overview.ts', { '@/lib/billing': billing })
const { monthlyUsage } = load('../src/components/dashboard/sidebar-usage.ts', {
  '@tanstack/react-query': { useQuery: () => ({}) },
  '@/lib/auth': { apiFetch: async () => ({ ok: true, json: async () => ({}) }) },
  '@/components/billing/billing-overview': overview
})

const renewing = { status: 'active', cancelAtPeriodEnd: false, currentPeriodEnd: '2026-12-18T10:00:00Z' }
const data = ({ subscription = renewing, ...account } = {}) => ({
  account: { credits: 2900, plan: 'pro', hasBillingProfile: true, ...account },
  subscription,
  invoices: [],
  providerAvailable: true,
  checkoutVerification: null
})
const plain = (value) => (value ? { ...value } : value)

test('monthly usage is the spent share of the plan allowance, with the renewal date', () => {
  // Pro grants 5000 credits a month; 2900 remain, so 42% is used.
  assert.deepEqual(plain(monthlyUsage(data())), { percent: 42, resetsAt: '2026-12-18T10:00:00Z' })
})

test('the sidebar shows exactly the Billing page percentage, including its rounding', () => {
  // Near-half values are where rounding "used" instead of "remaining" would drift by 1%.
  for (const credits of [0, 1, 2825, 2875, 2900, 2925, 4999, 5000]) {
    const page = overview.billingOverview(data({ credits }), false).usage
    assert.equal(monthlyUsage(data({ credits })).percent, page.used, `${credits} credits`)
  }
})

test('usage is clamped to 0–100% when credits roll over or are overdrawn', () => {
  assert.equal(monthlyUsage(data({ credits: 7200 })).percent, 0)
  assert.equal(monthlyUsage(data({ credits: -40 })).percent, 100)
})

test('scheduled cancellations and past-due payments keep the reset date, as on the canvas', () => {
  assert.equal(monthlyUsage(data({ subscription: { ...renewing, cancelAtPeriodEnd: true } })).resetsAt, renewing.currentPeriodEnd)
  assert.equal(monthlyUsage(data({ subscription: { ...renewing, status: 'past_due' } })).resetsAt, renewing.currentPeriodEnd)
})

test('free, admin and unconfirmed accounts show no usage card', () => {
  assert.equal(monthlyUsage(data({ plan: 'free', credits: 400, hasBillingProfile: false, subscription: null })), null)
  assert.equal(monthlyUsage(data({ creditsUnlimited: true })), null)
  // The effective plan is Free while Stripe still reports an active subscription.
  assert.equal(monthlyUsage(data({ plan: 'free' })), null)
})
