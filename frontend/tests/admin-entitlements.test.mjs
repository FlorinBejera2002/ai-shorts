import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'
import * as jsxRuntime from 'react/jsx-runtime'

function load(relative, imports = {}) {
  const exports = {}
  const source = readFileSync(new URL(relative, import.meta.url), 'utf8')
  vm.runInNewContext(
    ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX
      }
    }).outputText,
    {
      exports,
      URLSearchParams,
      require: (name) => {
        if (name === 'react/jsx-runtime') return jsxRuntime
        if (name.endsWith('.module.css'))
          return { default: new Proxy({}, { get: (_, key) => String(key) }) }
        if (!(name in imports)) throw Error(`Unexpected import ${name}`)
        return imports[name]
      }
    }
  )
  return exports
}

function hooks() {
  const state = []
  const effects = []
  let index = 0
  return {
    react: {
      useState(initial) {
        const current = index++
        if (!(current in state)) state[current] = initial
        return [state[current], (value) => {
          state[current] = typeof value === 'function' ? value(state[current]) : value
        }]
      },
      useEffect(effect) { effects.push(effect) },
      useCallback(callback) { return callback },
      useMemo(callback) { return callback() }
    },
    render(callback) { index = 0; return callback() },
    async mount(callback) {
      this.render(callback)
      for (const effect of effects.splice(0)) effect()
      await new Promise(setImmediate)
      return this.render(callback)
    }
  }
}

function nodes(tree) {
  if (!tree || typeof tree !== 'object') return []
  if (Array.isArray(tree)) return tree.flatMap(nodes)
  return [tree, ...nodes(tree.props?.children)]
}

function content(tree) {
  if (tree === null || tree === undefined || typeof tree === 'boolean') return ''
  if (Array.isArray(tree)) return tree.map(content).join(' ')
  if (typeof tree !== 'object') return String(tree)
  return content(tree.props?.children)
}

function renderComponents(tree) {
  if (Array.isArray(tree)) return tree.map(renderComponents)
  if (!tree || typeof tree !== 'object') return tree
  if (typeof tree.type === 'function')
    return renderComponents(tree.type(tree.props))
  return { ...tree, props: { ...tree.props, children: renderComponents(tree.props?.children) } }
}

const auth = (role) => ({ useAuth: () => ({ user: { access_role: role } }) })
const translations = {
  useLocale: () => 'en',
  useTranslations: () => (key, values) => `${key}${values ? `:${JSON.stringify(values)}` : ''}`
}

async function summary(role, account, extra = {}) {
  const runtime = hooks()
  const { SummaryCard } = load('../src/components/create/summary-card.tsx', {
    react: runtime.react,
    'next-intl': translations,
    'lucide-react': { AlertTriangle: 'svg', Wand2: 'svg', Zap: 'svg' },
    '@/components/auth/use-auth': auth(role),
    '@/components/ui/loading-indicator': { LoadingIndicator: 'span' },
    '@/components/ui/button': { Button: 'button' },
    '@/components/ui/card': { Card: 'section' },
    '@/i18n/navigation': { Link: 'a' },
    '@/lib/auth': { apiFetch: async () => ({ ok: true, json: async () => account }) }
  })
  return runtime.mount(() => SummaryCard({
    videoCount: 1, creditCost: 10, canGenerate: true, busy: false,
    isBatch: false, onGenerate() {}, ...extra
  }))
}

test('admins with zero or negative balances can generate without a credit charge', async () => {
  for (const credits of [0, -10]) {
    const tree = await summary('admin', { credits, creditsUnlimited: true })
    assert.equal(nodes(tree).find((node) => node.type === 'button').props.disabled, false)
    assert.match(content(tree), /0\s+creditsUnit/)
    assert.match(content(tree), /creditsUnlimited/)
    assert.doesNotMatch(content(tree), /insufficientCredits|balance:/)
  }
})

test('member credit checks and busy/input checks still block generation', async () => {
  for (const credits of [0, 9]) {
    const tree = await summary('member', { credits, creditsUnlimited: false })
    assert.equal(nodes(tree).find((node) => node.type === 'button').props.disabled, true)
    assert.match(content(tree), /insufficientCredits/)
  }
  const funded = await summary('member', { credits: 10, creditsUnlimited: false })
  assert.equal(nodes(funded).find((node) => node.type === 'button').props.disabled, false)
  for (const extra of [{ busy: true }, { canGenerate: false }]) {
    const tree = await summary('admin', { credits: 0, creditsUnlimited: true }, extra)
    assert.equal(nodes(tree).find((node) => node.type === 'button').props.disabled, true)
  }
})

test('fresh account entitlement overrides an old admin session; legacy API falls back to role', async () => {
  const demoted = await summary('admin', { credits: 0, creditsUnlimited: false })
  assert.equal(nodes(demoted).find((node) => node.type === 'button').props.disabled, true)
  const legacy = await summary('admin', { credits: 0 })
  assert.equal(nodes(legacy).find((node) => node.type === 'button').props.disabled, false)
})

test('brand kit unlocks white label for admins and respects current server entitlements', async () => {
  for (const [role, account, allowed] of [
    ['admin', { plan: 'free', canWhiteLabel: true }, true],
    ['admin', { plan: 'free', canWhiteLabel: false }, false],
    ['admin', { plan: 'free' }, true],
    ['member', { plan: 'free', canWhiteLabel: false }, false],
    ['member', { plan: 'agency' }, true]
  ]) {
    const runtime = hooks()
    const { useBrandKit } = load('../src/components/dashboard/brand/use-brand-kit.ts', {
      react: runtime.react,
      '@/components/auth/use-auth': auth(role),
      '@/components/ui/toast': { useToast: (select = (state) => state) => select({ add() {} }) },
      'next-intl': { useTranslations: () => (key) => key },
      '@/lib/auth': { apiFetch: async () => ({ ok: true, json: async () => account }) },
      './constants': load('../src/components/dashboard/brand/constants.ts'),
      './utils': load('../src/components/dashboard/brand/utils.ts'),
      './use-logo-preview': { useLogoPreview: () => null }
    })
    const kit = await runtime.mount(() => useBrandKit((key) => key))
    assert.equal(kit.canWhiteLabel, allowed)
    assert.equal(kit.loading, false)
    assert.equal(kit.loadError, false)
  }
})

const billing = load('../src/lib/billing.ts')

const billingOverviewModule = () =>
  load('../src/components/billing/billing-overview.ts', { '@/lib/billing': billing })
const billingAccount = (creditsUnlimited) => ({
  account: { credits: 0, creditsUnlimited, plan: 'free', hasBillingProfile: true },
  subscription: null, providerAvailable: true, invoices: [], checkoutVerification: null
})

function loadBillingSummary(intl = translations) {
  return load('../src/components/billing/billing-summary.tsx', {
    'next-intl': intl,
    'lucide-react': { CalendarDays: 'svg', CreditCard: 'svg', Gauge: 'svg', Sparkles: 'svg' },
    '@/lib/billing': billing,
    './billing-format': load('../src/components/billing/billing-format.ts'),
    './billing-usage-meter': { BillingUsageMeter: 'billing-usage-meter' }
  }).BillingSummary
}

test('billing summary replaces the usage meter with full access for unlimited accounts', () => {
  const BillingSummary = loadBillingSummary()
  const { billingOverview } = billingOverviewModule()
  const render = (unlimited) => renderComponents(BillingSummary({
    overview: billingOverview(billingAccount(unlimited), unlimited),
    planName: 'Plan', planPrice: undefined, locale: 'en', actions: null
  }))
  const admin = render(true)
  assert.match(content(admin), /adminAccess/)
  assert.equal(nodes(admin).some((node) => node.type === 'billing-usage-meter'), false)
  const member = render(false)
  assert.doesNotMatch(content(member), /adminAccess/)
  const meter = nodes(member).find((node) => node.type === 'billing-usage-meter')
  assert.deepEqual({ ...meter.props.usage }, { used: 100, remaining: 0, resets: false })
})

test('billing keeps account management available while hiding subscription upsells for admins', () => {
  const messages = JSON.parse(readFileSync(new URL('../messages/en.json', import.meta.url), 'utf8')).billing
  const message = (key) => key.split('.').reduce((value, part) => value?.[part], messages) ?? key
  for (const creditsUnlimited of [true, false]) {
    const data = billingAccount(creditsUnlimited)
    const translated = { ...translations, useTranslations: () => message }
    const workspaceViews = load('../src/components/billing/billing-workspace-views.tsx', {
      'next-intl': translated,
      'lucide-react': { RotateCw: 'svg' },
      './billing-details': { BillingDetails: 'billing-details', BillingDetailsLinks: 'billing-details-links' },
      './billing-notices': { BillingNotices: 'billing-notices' },
      './billing-overview': billingOverviewModule(),
      './use-checkout-return-toast': { useCheckoutReturnToast: () => undefined },
      './billing-summary': { BillingSummary: 'billing-summary' },
      './hosted-billing-button': { HostedBillingButton: 'hosted-billing-button' },
      './invoice-history': { InvoiceHistory: 'invoice-history' },
      './plan-selector': { PlanSelector: 'plan-selector' },
      '@/components/ui/loading-indicator': { LoadingIndicator: 'span' },
      '@/lib/billing': billing
    })
    const { default: BillingPage } = load('../src/components/dashboard/views/billing.tsx', {
      // Requesting plans exercises the member plan view and the admin guard
      // that redirects the same requested view back to the overview.
      react: { Suspense: 'div', useState: () => ['plans', () => {}] },
      'next-intl': translated,
      'next/navigation': { useSearchParams: () => new URLSearchParams() },
      '@/components/auth/use-auth': auth('admin'),
      '@/components/billing/billing-initial-state': { BillingLoading: 'billing-loading', BillingLoadError: 'billing-load-error' },
      '@/components/billing/billing-page-header': { BillingPageHeader: 'billing-page-header' },
      '@/components/billing/billing-workspace-views': workspaceViews,
      '@/components/billing/use-billing-resource': { useBillingResource: () => ({ data, reload() {}, recovering: false }) },
      '@/components/billing/use-plan-catalog': { usePlanCatalog: () => ({}) },
      '@/components/dashboard/workspace-mobile-header': { WorkspaceMobileHeader: 'header' },
      '@/lib/billing': billing
    })
    const tree = renderComponents(BillingPage())
    const workspace = nodes(tree).find((node) => node.props?.['data-billing-workspace'] === '')
    assert.equal(workspace.props['data-view'], creditsUnlimited ? 'overview' : 'plans')
    assert.equal(nodes(tree).some((node) => node.type === 'plan-selector'), !creditsUnlimited)
    if (!creditsUnlimited) continue
    const summary = nodes(tree).find((node) => node.type === 'billing-summary')
    assert.equal(summary.props.planName, 'Administrator · unlimited')
    assert.equal(summary.props.overview.access, 'admin')
    assert.equal(summary.props.overview.usage, null)
    const actions = nodes(renderComponents(summary.props.actions))
    assert.equal(actions.some((node) => node.props?.['data-billing-choose-plan'] === ''), false)
    assert.equal(actions.filter((node) => node.type === 'hosted-billing-button').length, 1)
    assert.ok(nodes(tree).find((node) => node.type === 'invoice-history'))
  }
})

test('story review explains admin generation has no credit charge', () => {
  const types = load('../src/components/story/types.ts')
  for (const role of ['admin', 'member']) {
    const { StoryCreateReview } = load('../src/components/story/story-create-review.tsx', {
      'lucide-react': { Pencil: 'svg' },
      '@/components/auth/use-auth': auth(role),
      '@/components/ui/button': { Button: 'button' },
      '@/lib/youtube': { formatDuration: (value) => `${value}s` },
      './types': types,
      './use-story-language': { useStoryLanguage: () => (english) => english },
      './story-music-summary': { StoryMusicSummary: 'div' },
      './story-source-preview': { StorySourcePreview: 'div' }
    })
    const tree = StoryCreateReview({
      options: types.defaultOptions, videos: [], ready: false, busy: false,
      pendingCount: 0, onEdit() {}, onCreate() {}
    })
    assert.match(content(tree), role === 'admin' ? /Unlimited credits · no charge/ : /10 credits · charged once/)
  }
})
