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
      require: (name) => {
        if (!(name in imports)) throw Error(`Unexpected import ${name}`)
        return imports[name]
      }
    }
  )
  return exports
}

const billing = load('../src/lib/billing.ts')
const { billingOverview } = load('../src/components/billing/billing-overview.ts', { '@/lib/billing': billing })
const plain = (value) => JSON.parse(JSON.stringify(value))
const PERIOD_END = '2026-12-18T10:00:00Z'
const data = ({ plan = 'creator', credits = 870, subscription, ...rest } = {}) => ({
  account: { credits, plan, hasBillingProfile: true },
  subscription:
    subscription === null ? null : { status: 'active', cancelAtPeriodEnd: false, currentPeriodEnd: PERIOD_END, ...subscription },
  invoices: [],
  providerAvailable: true,
  checkoutVerification: null,
  ...rest
})

test('usage is the share of the plan allowance used, in whole percentages', () => {
  assert.deepEqual(plain(billing.billingUsage(870, 'creator')), { used: 42, remaining: 58 })
  assert.deepEqual(plain(billing.billingUsage(650, 'free')), { used: 35, remaining: 65 })
  assert.deepEqual(plain(billing.billingUsage(4800, 'pro')), { used: 4, remaining: 96 })
  // Rolled-over balance above the allowance counts as nothing used; overdrafts as everything.
  assert.deepEqual(plain(billing.billingUsage(2600, 'creator')), { used: 0, remaining: 100 })
  assert.deepEqual(plain(billing.billingUsage(-40, 'agency')), { used: 100, remaining: 0 })
  assert.deepEqual(plain(billing.billingUsage(Number.NaN, 'pro')), { used: 100, remaining: 0 })
})

test('paid tiers are described as multiples of the Creator allowance', () => {
  assert.equal(billing.planUsageMultiple('creator'), 1)
  assert.equal(billing.planUsageMultiple('pro'), 3)
  assert.equal(billing.planUsageMultiple('agency'), 13)
})

test('an active paid plan renews, resets usage and can change plan', () => {
  const overview = plain(billingOverview(data(), false))
  assert.equal(overview.access, 'paid')
  assert.deepEqual(overview.status, { key: 'statuses.active', tone: 'success' })
  assert.deepEqual(overview.period, { kind: 'renews', date: PERIOD_END })
  assert.deepEqual(overview.usage, { used: 42, remaining: 58, resets: true })
  assert.equal(overview.canChangePlan, true)
  assert.equal(overview.canManageBilling, true)
})

test('past due keeps the renewal date but only offers the billing portal', () => {
  const overview = plain(billingOverview(data({ subscription: { status: 'past_due' } }), false))
  assert.deepEqual(overview.status, { key: 'statuses.pastDue', tone: 'warning' })
  assert.equal(overview.period.kind, 'renews')
  assert.equal(overview.canChangePlan, false)
})

test('scheduled cancellation ends the period with a neutral state', () => {
  const overview = plain(billingOverview(data({ subscription: { cancelAtPeriodEnd: true } }), false))
  assert.deepEqual(overview.status, { key: 'summaryDesign.cancellationScheduled', tone: 'neutral' })
  assert.equal(overview.period.kind, 'ends')
  assert.equal(overview.canChangePlan, true)
})

test('free access uses the one-time trial grant without a state badge', () => {
  const overview = plain(billingOverview(data({ plan: 'free', credits: 650, subscription: null }), false))
  assert.equal(overview.access, 'free')
  assert.equal(overview.status, null)
  assert.equal(overview.period, null)
  assert.deepEqual(overview.usage, { used: 35, remaining: 65, resets: false })
})

test('an unconfirmed paid subscription and a pending checkout block plan changes', () => {
  const unconfirmed = plain(billingOverview(data({ plan: 'free' }), false))
  assert.equal(unconfirmed.needsConfirmation, true)
  assert.deepEqual(unconfirmed.status, { key: 'coverageUnconfirmed', tone: 'warning' })
  const pending = plain(
    billingOverview(data({ plan: 'free', subscription: null, checkoutVerification: { status: 'pending', planId: 'pro' } }), false)
  )
  assert.equal(pending.confirmingCheckout, true)
  assert.equal(pending.canChangePlan, false)
})

test('admins have no usage limit, state badge or plan upsell', () => {
  const overview = plain(billingOverview(data({ plan: 'agency', subscription: null }), true))
  assert.equal(overview.access, 'admin')
  assert.equal(overview.usage, null)
  assert.equal(overview.status, null)
  assert.equal(overview.canChangePlan, false)
  assert.equal(overview.canManageBilling, true)
})
