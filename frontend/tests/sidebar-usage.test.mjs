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

const billing = load('../src/lib/billing.ts')
const { monthlyUsage } = load('../src/components/dashboard/sidebar-usage.ts', {
  '@tanstack/react-query': { useQuery: () => ({}) },
  '@/lib/auth': { apiFetch: async () => ({ ok: true, json: async () => ({}) }) },
  '@/lib/billing': billing
})

const renewing = { status: 'active', cancelAtPeriodEnd: false, currentPeriodEnd: '2026-12-18T10:00:00Z' }
const account = (overrides = {}) => ({ credits: 2900, plan: 'pro', hasBillingProfile: true, ...overrides })

test('monthly usage is the spent share of the plan allowance, with the renewal date', () => {
  // Pro grants 5000 credits a month; 2900 remain, so 42% is used.
  assert.deepEqual({ ...monthlyUsage({ account: account(), subscription: renewing }) }, {
    percent: 42,
    resetsAt: '2026-12-18T10:00:00Z'
  })
})

test('usage is clamped to 0–100% when credits roll over or are overdrawn', () => {
  assert.equal(monthlyUsage({ account: account({ credits: 7200 }), subscription: renewing }).percent, 0)
  assert.equal(monthlyUsage({ account: account({ credits: -40 }), subscription: renewing }).percent, 100)
})

test('a subscription ending at the period end shows usage without a reset date', () => {
  const usage = monthlyUsage({ account: account(), subscription: { ...renewing, cancelAtPeriodEnd: true } })
  assert.equal(usage.percent, 42)
  assert.equal(usage.resetsAt, null)
})

test('accounts without a monthly allowance show no usage card', () => {
  assert.equal(monthlyUsage({ account: account({ plan: 'free', credits: 400 }), subscription: null }), null)
  assert.equal(monthlyUsage({ account: account(), subscription: null }), null)
  assert.equal(monthlyUsage({ account: account(), subscription: { ...renewing, status: 'canceled' } }), null)
  assert.equal(monthlyUsage({ account: account({ creditsUnlimited: true }), subscription: renewing }), null)
})
