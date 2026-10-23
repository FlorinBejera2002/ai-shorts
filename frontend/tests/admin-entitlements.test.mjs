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
      '@/components/ui/toast': { useToast: () => ({ add() {} }) },
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

test('dashboard shows unlimited entitlement without replacing real credit balances', () => {
  const { StatsBar } = load('../src/components/dashboard/stats-bar.tsx', {
    'next-intl': translations,
    'lucide-react': { Clock3: 'svg', Film: 'svg', Layers: 'svg', Coins: 'svg' },
    '@/components/auth/use-auth': auth('admin'),
    '@/i18n/navigation': { Link: 'a' }
  })
  const metrics = { credits: 0, jobCount: 3, clipCount: 4, durationMinutes: 6 }
  const admin = StatsBar({ ...metrics, creditsUnlimited: true })
  assert.match(content(admin), /∞/)
  assert.match(content(admin), /creditsUnlimited/)
  const member = StatsBar({ ...metrics, creditsUnlimited: false })
  assert.doesNotMatch(content(member), /∞|creditsUnlimited/)
})

const billing = load('../src/lib/billing.ts')

function loadBillingSummary(intl = translations) {
  return load('../src/components/billing/billing-summary.tsx', {
    'next-intl': intl,
    'lucide-react': { CalendarDays: 'svg', Coins: 'svg', FileVideo: 'svg', Package: 'svg' },
    '@/components/billing/portal-button': { PortalButton: 'button' },
    '@/components/ui/button': { Button: 'button' },
    '@/lib/billing': billing
  }).BillingSummary
}

test('billing summary removes the finite clip allowance for unlimited accounts', () => {
  const BillingSummary = loadBillingSummary({
    ...translations,
    useTranslations: () => (key, values) => key === 'availableClips' ? `${values.count} clips ready` : key
  })
  const props = {
    credits: 0, planName: 'Administrator', locale: 'en', subscription: null,
    hasBillingData: false, canManageBilling: false, providerAvailable: true,
    labels: { creditsUnlimited: 'Unlimited credits', adminAccess: 'All features included',
      clipRunwayValue: ({ count }) => `${count} clips ready` }
  }
  const admin = renderComponents(BillingSummary({ ...props, creditsUnlimited: true }))
  assert.match(content(admin), /Unlimited credits/)
  assert.match(content(admin), /All features included/)
  assert.doesNotMatch(content(admin), /0 clips ready/)
  assert.match(content(renderComponents(BillingSummary({ ...props, creditsUnlimited: false }))), /0 clips ready/)
})

test('billing keeps account management available while hiding subscription upsells for admins', () => {
  const messages = JSON.parse(readFileSync(new URL('../messages/en.json', import.meta.url), 'utf8')).billing
  for (const creditsUnlimited of [true, false]) {
    const data = {
      account: { credits: 0, creditsUnlimited, plan: 'free', hasBillingProfile: true },
      subscription: null, providerAvailable: true, invoices: []
    }
    const translated = { ...translations, useTranslations: () => (key) => messages[key] ?? key }
    const workspaceViews = load('../src/components/billing/billing-workspace-views.tsx', {
      'next-intl': translated,
      'lucide-react': { RefreshCw: 'svg' },
      './billing-guide': { BillingGuide: 'billing-guide' },
      './billing-notices': { BillingNotices: 'billing-notices' },
      './billing-summary': { BillingSummary: 'billing-summary' },
      './billing-test-mode-notice': { BillingTestModeNotice: 'billing-test-mode-notice' },
      './invoice-history': { InvoiceHistory: 'invoice-history' },
      './plan-selector': { PlanSelector: 'plan-selector' },
      '@/components/ui/button': { Button: 'button' },
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
      '@/components/billing/billing-initial-state': { BillingInitialState: 'billing-initial-state' },
      '@/components/billing/billing-page-header': { BillingPageHeader: 'billing-page-header' },
      '@/components/billing/billing-workspace-views': workspaceViews,
      '@/components/billing/use-billing-resource': { useBillingResource: () => ({ data, reload() {} }) },
      '@/components/billing/use-plan-catalog': { usePlanCatalog: () => ({}) },
      '@/components/dashboard/workspace-mobile-header': { WorkspaceMobileHeader: 'header' },
      '@/lib/billing': billing
    })
    const tree = renderComponents(BillingPage())
    const plans = nodes(tree).find((node) => node.props?.children?.type === 'plan-selector')
    assert.equal(plans.props.hidden, creditsUnlimited)
    const summary = nodes(tree).find((node) => node.type === 'billing-summary')
    assert.equal(summary.props.canManageBilling, true)
    assert.equal(summary.props.creditsUnlimited, creditsUnlimited)
    assert.equal(summary.props.planName, creditsUnlimited ? 'Administrator · unlimited' : 'Free')
    assert.equal(summary.props.canChangePlan, !creditsUnlimited)
    const workspace = nodes(tree).find((node) => node.props?.['data-billing-workspace'] === '')
    assert.equal(workspace.props['data-view'], creditsUnlimited ? 'overview' : 'plans')
    const renderedSummary = renderComponents(loadBillingSummary(translated)(summary.props))
    if (creditsUnlimited)
      assert.match(content(renderedSummary), /All features included without a subscription/)
    else
      assert.doesNotMatch(content(renderedSummary), /All features included without a subscription/)
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
      './story-music-summary': { StoryMusicSummary: 'div' }
    })
    const tree = StoryCreateReview({
      options: types.defaultOptions, videos: [], ready: false, busy: false,
      pendingCount: 0, onEdit() {}, onCreate() {}
    })
    assert.match(content(tree), role === 'admin' ? /Unlimited credits · no charge/ : /10 credits · charged once/)
  }
})
