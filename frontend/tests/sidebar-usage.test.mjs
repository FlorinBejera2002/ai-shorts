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
const accountCredits = load('../src/lib/account-credits.ts')
const usageImports = {
  '@tanstack/react-query': { useQuery: () => ({}) },
  '@/components/auth/use-auth': { useAuth: () => ({}) },
  '@/lib/auth': { apiFetch: async () => ({ ok: true, json: async () => ({}) }) },
  '@/lib/account-credits': accountCredits,
  '@/lib/billing': billing,
  '@/components/billing/billing-overview': overview
}
const { creditUsage, creditPeriod } = load('../src/components/dashboard/sidebar-usage.ts', usageImports)

const renewing = { status: 'active', cancelAtPeriodEnd: false, currentPeriodEnd: '2026-12-18T10:00:00Z' }
const data = ({ subscription = renewing, ...account } = {}) => ({
  account: { credits: 2900, plan: 'pro', hasBillingProfile: true, ...account },
  subscription,
  invoices: [],
  providerAvailable: true,
  checkoutVerification: null
})
const plain = (value) => (value ? { ...value } : value)

test('the ring reports remaining balance while Billing reports the complementary spent share', () => {
  assert.deepEqual(plain(creditUsage(data().account)), { credits: 2900, unlimited: false, plan: 'pro', allowance: 5000, remaining: 58 })
  assert.deepEqual(plain(creditPeriod(data().account, data())), { kind: 'renews', date: renewing.currentPeriodEnd })
})

test('the sidebar shows exactly the Billing page percentage, including its rounding', () => {
  // Near-half values are where rounding "used" instead of "remaining" would drift by 1%.
  for (const credits of [0, 1, 2825, 2875, 2900, 2925, 4999, 5000]) {
    const page = overview.billingOverview(data({ credits }), false).usage
    assert.equal(creditUsage(data({ credits }).account).remaining, page.remaining, `${credits} credits`)
    assert.equal(creditUsage(data({ credits }).account).remaining + page.used, 100)
  }
})

test('usage is clamped to 0–100% when credits roll over or are overdrawn', () => {
  assert.equal(creditUsage(data({ credits: 7200 }).account).remaining, 100)
  assert.equal(creditUsage(data({ credits: 7200 }).account).credits, 7200, 'Exact rollover balance is preserved')
  assert.equal(creditUsage(data({ credits: -40 }).account).remaining, 0)
  assert.equal(creditUsage(data({ credits: -40 }).account).credits, 0)
})

test('scheduled cancellation shows an end date rather than promising a credit reset', () => {
  const cancelled = data({ subscription: { ...renewing, cancelAtPeriodEnd: true } })
  assert.equal(creditPeriod(cancelled.account, cancelled).kind, 'ends')
  assert.equal(creditPeriod(cancelled.account, cancelled).date, renewing.currentPeriodEnd)
})

test('free and admin balances are represented without invented billing dates', () => {
  const free = data({ plan: 'free', credits: 400, hasBillingProfile: false, subscription: null })
  assert.equal(creditUsage(free.account).remaining, 40)
  assert.equal(creditPeriod(free.account, free), null)
  assert.equal(creditUsage(data({ creditsUnlimited: true }).account).unlimited, true)
  assert.equal(creditPeriod(data({ creditsUnlimited: true }).account, data()), null)
})

test('each paid plan uses its own allowance', () => {
  for (const [plan, allowance] of Object.entries(billing.PLAN_CREDITS)) {
    const usage = creditUsage(data({ plan, credits: allowance / 2 }).account)
    assert.equal(usage.remaining, 50)
    assert.equal(usage.allowance, allowance)
  }
})

test('unknown, mismatched and invalid billing periods are omitted', () => {
  assert.equal(creditPeriod(data().account, undefined), null)
  assert.equal(creditPeriod(data({ plan: 'creator' }).account, data()), null)
  assert.equal(creditPeriod(data().account, data({ subscription: { ...renewing, currentPeriodEnd: 'invalid' } })), null)
  assert.equal(creditPeriod(data().account, data({ subscription: null })), null)
})

test('query keys isolate account balances, including anonymous state', () => {
  assert.notDeepEqual([...accountCredits.accountCreditsKey('first')], [...accountCredits.accountCreditsKey('second')])
  assert.notDeepEqual([...accountCredits.accountCreditsKey('first')], [...accountCredits.accountCreditsKey(undefined)])
})

test('the creation meter adapter shares the circle balance and omits non-renewing reset dates', () => {
  const readUsage = payload => load('../src/components/dashboard/sidebar-usage.ts', {
    ...usageImports,
    '@/components/auth/use-auth': { useAuth: () => ({ status: 'authenticated', user: { id: 'synthetic-usage' } }) },
    '@tanstack/react-query': { useQuery: options => ({ data: options.queryKey[0] === 'account-credits' ? payload.account : payload }) }
  }).useMonthlyUsage().data
  assert.deepEqual(plain(readUsage(data())), { percent: 42, resetsAt: renewing.currentPeriodEnd })
  assert.equal(readUsage(data({ plan: 'free' })), null)
  assert.equal(readUsage(data({ creditsUnlimited: true })), null)
  const ending = readUsage(data({ subscription: { ...renewing, cancelAtPeriodEnd: true } }))
  assert.deepEqual(plain(ending), { percent: 42, resetsAt: null })
})
