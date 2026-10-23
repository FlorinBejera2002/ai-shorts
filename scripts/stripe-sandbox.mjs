import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

export const API_VERSION = '2026-06-24.dahlia'
export const WEBHOOK_EVENTS = Object.freeze([
  'checkout.session.completed', 'checkout.session.expired', 'checkout.session.async_payment_succeeded',
  'customer.subscription.created', 'customer.subscription.updated',
  'customer.subscription.deleted', 'customer.subscription.paused',
  'customer.subscription.resumed', 'customer.subscription.pending_update_applied',
  'customer.subscription.pending_update_expired', 'invoice.paid', 'invoice.payment_succeeded',
  'invoice.payment_failed', 'invoice.payment_action_required', 'invoice.finalization_failed',
])
const PLAN_KEYS = ['creator', 'pro', 'agency']
const PACK_KEYS = ['credits_100', 'credits_500', 'credits_1000']
const fail = message => { throw new Error(message) }
const hash = value => createHash('sha256').update(stable(value)).digest('hex')
const stable = value => JSON.stringify(canonical(value))
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical)
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]))
  return value
}
function fields(value, allowed, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} must be an object`)
  if (Object.keys(value).some(key => !allowed.includes(key))) fail(`${label} contains an unsupported field`)
}
function choice(value, allowed, label) {
  if (!allowed.includes(value)) fail(`${label} must be explicitly chosen from ${allowed.join(', ')}`)
}
function boolean(value, label) { if (typeof value !== 'boolean') fail(`${label} must be explicitly true or false`) }
function identifier(value, prefix, label) {
  if (typeof value !== 'string' || !new RegExp(`^${prefix}_[A-Za-z0-9]+$`).test(value)) fail(`Invalid ${label}`)
}
function safeURL(value, label, localAllowed = false) {
  let url
  try { url = new URL(value) } catch { fail(`Invalid ${label}`) }
  if (url.username || url.password || url.hash || url.search ||
    (url.protocol !== 'https:' && !(localAllowed && url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))) fail(`Invalid ${label}`)
  return url
}

// This schema intentionally has no prices, tax choices or cancellation defaults.
export function validatePolicy(policy) {
  fields(policy, ['version', 'configurationKey', 'expectedAccountId', 'appOrigin', 'catalog', 'portal', 'webhookUrl'], 'Policy')
  if (policy.version !== 1) fail('Policy version must be 1')
  if (!/^[a-z][a-z0-9-]{2,59}$/.test(policy.configurationKey ?? '')) fail('Invalid configurationKey')
  identifier(policy.expectedAccountId, 'acct', 'expectedAccountId')
  const origin = safeURL(policy.appOrigin, 'appOrigin', true)
  if (origin.origin !== policy.appOrigin) fail('appOrigin must contain only the origin, without a trailing slash')
  if (!Array.isArray(policy.catalog) || policy.catalog.length < 3 || policy.catalog.length > 6) fail('catalog must contain the three paid plans and optional credit packs')
  const keys = new Set()
  for (const entry of policy.catalog) {
    fields(entry, ['key', 'name', 'currency', 'unitAmount', 'taxBehavior', 'interval', 'intervalCount', 'productId', 'priceId'], 'Catalog entry')
    choice(entry.key, [...PLAN_KEYS, ...PACK_KEYS], 'catalog key')
    if (keys.has(entry.key)) fail('Duplicate catalog key')
    keys.add(entry.key)
    if (typeof entry.name !== 'string' || entry.name.length < 1 || entry.name.length > 100 || /[\r\n]/.test(entry.name)) fail('Invalid catalog name')
    if (!/^[a-z]{3}$/.test(entry.currency ?? '')) fail('Currency must be an explicit lowercase ISO currency code')
    if (!Number.isSafeInteger(entry.unitAmount) || entry.unitAmount <= 0) fail('unitAmount must be an explicit positive integer in the currency minor unit')
    choice(entry.taxBehavior, ['inclusive', 'exclusive', 'unspecified'], 'taxBehavior')
    if (PLAN_KEYS.includes(entry.key)) {
      choice(entry.interval, ['month', 'year'], 'interval')
      if (!Number.isInteger(entry.intervalCount) || entry.intervalCount < 1 || entry.intervalCount > 12) fail('intervalCount must be explicit, between 1 and 12')
    } else if (entry.interval !== undefined || entry.intervalCount !== undefined) fail('Credit packs must be one-time prices')
    if (entry.productId !== undefined) identifier(entry.productId, 'prod', 'productId')
    if (entry.priceId !== undefined) identifier(entry.priceId, 'price', 'priceId')
  }
  if (PLAN_KEYS.some(key => !keys.has(key))) fail('All three paid plan keys are required')
  fields(policy.portal, ['paymentMethodUpdate', 'invoiceHistory', 'customerUpdates', 'cancelEnabled', 'cancelMode', 'cancelProrationBehavior', 'updateEnabled', 'updateProrationBehavior', 'returnPath', 'configurationId'], 'Portal')
  for (const key of ['paymentMethodUpdate', 'invoiceHistory', 'cancelEnabled', 'updateEnabled']) boolean(policy.portal[key], key)
  if (!Array.isArray(policy.portal.customerUpdates) || new Set(policy.portal.customerUpdates).size !== policy.portal.customerUpdates.length || policy.portal.customerUpdates.some(value => !['name', 'email', 'address', 'phone', 'tax_id'].includes(value))) fail('Invalid customerUpdates')
  choice(policy.portal.cancelMode, ['at_period_end', 'immediately'], 'cancelMode')
  choice(policy.portal.cancelProrationBehavior, ['none', 'create_prorations'], 'cancelProrationBehavior')
  if (policy.portal.cancelMode === 'at_period_end' && policy.portal.cancelProrationBehavior !== 'none') fail('Period-end cancellation must not create prorations')
  choice(policy.portal.updateProrationBehavior, ['none', 'create_prorations', 'always_invoice'], 'updateProrationBehavior')
  if (!/^\/(?:ro|en)\/dashboard\/billing$/.test(policy.portal.returnPath ?? '')) fail('returnPath must point to a localized dashboard billing page')
  if (policy.portal.configurationId !== undefined) identifier(policy.portal.configurationId, 'bpc', 'configurationId')
  if (policy.webhookUrl !== undefined && policy.webhookUrl !== null) {
    const webhook = safeURL(policy.webhookUrl, 'webhookUrl')
    if (webhook.pathname !== '/api/webhooks/stripe') fail('webhookUrl must use /api/webhooks/stripe')
  }
  return policy
}

function metadata(policy, key) {
  return { sneepcut_configuration: policy.configurationKey, sneepcut_catalog_key: key }
}
function owned(resource, policy, key) {
  return resource.metadata?.sneepcut_configuration === policy.configurationKey && resource.metadata?.sneepcut_catalog_key === key
}
function single(candidates, label) {
  if (candidates.length > 1) fail(`Ambiguous existing ${label}; resolve duplicates explicitly before continuing`)
  return candidates[0]
}
function assertTest(resource, label) {
  if (resource.livemode !== false) fail(`${label} is not explicitly a test-mode object`)
}
function pickProduct(products, entry, policy) {
  const product = entry.productId
    ? single(products.filter(item => item.id === entry.productId), `product ${entry.key}`)
    : single(products.filter(item => owned(item, policy, entry.key)), `product ${entry.key}`)
  if (entry.productId && !product) fail(`Explicit product ${entry.key} was not found`)
  if (!product && products.some(item => item.name === entry.name)) fail(`Unmanaged product name matches ${entry.key}; review it and supply its productId to reuse it`)
  if (product) {
    assertTest(product, 'Product')
    if (!product.active || product.name !== entry.name) fail(`Existing product ${entry.key} differs from policy`)
  }
  return product
}
function priceMatches(price, entry, productId) {
  return price.active === true && price.product === productId && price.currency === entry.currency &&
    price.unit_amount === entry.unitAmount && price.tax_behavior === entry.taxBehavior &&
    price.billing_scheme === 'per_unit' && !price.transform_quantity && !price.custom_unit_amount &&
    (PLAN_KEYS.includes(entry.key)
      ? price.type === 'recurring' && price.recurring?.interval === entry.interval && price.recurring?.interval_count === entry.intervalCount && price.recurring?.usage_type === 'licensed' && !price.recurring?.trial_period_days
      : price.type === 'one_time' && !price.recurring)
}
function pickPrice(prices, entry, product, policy) {
  const lookup = `${policy.configurationKey}:${entry.key}`
  let candidates = prices.filter(item => entry.priceId ? item.id === entry.priceId : owned(item, policy, entry.key) || item.lookup_key === lookup)
  if (!entry.priceId && candidates.length === 0 && product) candidates = prices.filter(item => priceMatches(item, entry, product.id))
  const price = single(candidates, `price ${entry.key}`)
  if (entry.priceId && !price) fail(`Explicit price ${entry.key} was not found`)
  if (price) {
    assertTest(price, 'Price')
    if (!product || !priceMatches(price, entry, product.id)) fail(`Existing price ${entry.key} differs from policy; immutable prices must be reviewed, never silently replaced`)
  }
  return price
}
export function portalSettings(policy, catalog) {
  const options = policy.portal
  const update = { enabled: options.updateEnabled, default_allowed_updates: options.updateEnabled ? ['price'] : [], proration_behavior: options.updateProrationBehavior, billing_cycle_anchor: 'unchanged' }
  if (options.updateEnabled) update.products = catalog.filter(entry => PLAN_KEYS.includes(entry.key)).map(entry => ({ product: entry.productId, prices: [entry.priceId], adjustable_quantity: { enabled: false } })).sort((a, b) => String(a.product).localeCompare(String(b.product)))
  return {
    default_return_url: `${policy.appOrigin}${options.returnPath}`,
    features: {
      customer_update: { enabled: options.customerUpdates.length > 0, allowed_updates: [...options.customerUpdates].sort() },
      invoice_history: { enabled: options.invoiceHistory }, payment_method_update: { enabled: options.paymentMethodUpdate },
      subscription_cancel: { enabled: options.cancelEnabled, mode: options.cancelMode, proration_behavior: options.cancelProrationBehavior },
      subscription_update: update,
    },
  }
}
function project(actual, wanted) {
  if (Array.isArray(wanted)) return Array.isArray(actual) ? actual.map((item, index) => project(item, wanted[index] ?? wanted[0])).sort((a,b) => stable(a).localeCompare(stable(b))) : actual
  if (wanted && typeof wanted === 'object') return Object.fromEntries(Object.entries(wanted).map(([key, value]) => [key, project(actual?.[key], value)]))
  return actual
}
function matchSettings(actual, wanted) { return stable(project(actual, wanted)) === stable(project(wanted, wanted)) }

export function createStripeClient(secret, fetcher = fetch) {
  // Live/restricted-live keys never reach the network, including in prepare mode.
  if (!/^(?:sk|rk)_test_[A-Za-z0-9]+$/.test(secret ?? '') || secret.includes('...')) fail('A securely supplied Stripe test secret or restricted test key is required')
  return {
    async request(method, resource, data, idempotencyKey) {
      const url = new URL(`https://api.stripe.com/v1${resource}`)
      const body = new URLSearchParams()
      const append = (value, name) => {
        if (Array.isArray(value)) {
          if (value.length === 0) body.append(name, '')
          else value.forEach((item, index) => append(item, `${name}[${index}]`))
        } else if (value && typeof value === 'object') Object.entries(value).forEach(([key, item]) => append(item, name ? `${name}[${key}]` : key))
        else if (value !== undefined && value !== null) body.append(name, String(value))
      }
      if (data) append(data, '')
      if (method === 'GET') url.search = body.toString()
      const headers = { Authorization: `Bearer ${secret}`, 'Stripe-Version': API_VERSION }
      if (method === 'POST') headers['Content-Type'] = 'application/x-www-form-urlencoded'
      if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey
      let response
      try { response = await fetcher(url, { method, headers, body: method === 'POST' ? body : undefined, signal: AbortSignal.timeout(30000), redirect: 'error' }) }
      catch { fail('Stripe request could not complete; retry the same reviewed operation after connectivity recovers') }
      let result
      try { result = await response.json() } catch { fail('Stripe returned an invalid response') }
      if (!response.ok) fail(`Stripe request failed with HTTP ${response.status}; inspect the request in Stripe Workbench (no provider payload was logged)`)
      return result
    },
  }
}
async function list(client, resource) {
  const result = []
  let last
  for (let page = 0; page < 1000; page++) {
    const response = await client.request('GET', resource, {
      limit: 100,
      ...(resource === '/billing_portal/configurations' ? { expand: ['data.features.subscription_update.products'] } : {}),
      ...(last ? { starting_after: last } : {}),
    })
    if (!Array.isArray(response.data)) fail('Invalid Stripe list response')
    response.data.forEach(item => assertTest(item, resource))
    result.push(...response.data)
    if (!response.has_more) return result
    const next = response.data.at(-1)?.id
    if (!next || last === next) fail('Stripe pagination did not advance')
    last = next
  }
  fail('Stripe inventory exceeded the safety limit')
}

export async function prepare(client, input, environment) {
  const policy = validatePolicy(input)
  if (environment?.STRIPE_MODE !== 'test' || environment?.STRIPE_EXPECTED_ACCOUNT_ID !== policy.expectedAccountId) fail('Explicit test environment and matching STRIPE_EXPECTED_ACCOUNT_ID are required')
  // Identity is read before inventory and before any possible mutation.
  const account = await client.request('GET', '/account')
  if (account.id !== policy.expectedAccountId) fail('Stripe account identity does not match expectedAccountId')
  const products = await list(client, '/products')
  const prices = await list(client, '/prices')
  const portals = await list(client, '/billing_portal/configurations')
  const endpoints = policy.webhookUrl ? await list(client, '/webhook_endpoints') : []
  const catalog = policy.catalog.map(entry => {
    const product = pickProduct(products, entry, policy)
    const price = pickPrice(prices, entry, product, policy)
    return { key: entry.key, productId: product?.id ?? null, priceId: price?.id ?? null }
  })
  const portal = policy.portal.configurationId
    ? single(portals.filter(item => item.id === policy.portal.configurationId), 'portal configuration')
    : single(portals.filter(item => owned(item, policy, 'portal')), 'portal configuration')
  if (policy.portal.configurationId && !portal) fail('Explicit portal configuration was not found')
  const wantedPortal = portalSettings(policy, catalog)
  if (portal && (!portal.active || portal.application || !matchSettings(portal, wantedPortal) || portal.features?.subscription_update?.schedule_at_period_end?.conditions?.length)) fail('Existing portal differs from policy; review changes manually before applying')
  if (!portal && portals.some(item => item.default_return_url === wantedPortal.default_return_url)) fail('Unmanaged portal matches return URL; supply its configurationId after review')
  const endpoint = policy.webhookUrl ? single(endpoints.filter(item => item.url === policy.webhookUrl || owned(item, policy, 'webhook')), 'webhook endpoint') : undefined
  if (endpoint && (endpoint.url !== policy.webhookUrl || endpoint.api_version !== API_VERSION || endpoint.status !== 'enabled' || stable([...endpoint.enabled_events].sort()) !== stable([...WEBHOOK_EVENTS].sort()) || endpoint.application)) fail('Existing webhook differs from the required snapshot events, API version, URL, scope or status')
  const plan = {
    version: 1, environment: 'test', accountId: account.id, configurationKey: policy.configurationKey,
    policyDigest: hash(policy), configuration: structuredClone(policy), apiVersion: API_VERSION,
    catalog, portalConfigurationId: portal?.id ?? null, webhookEndpointId: endpoint?.id ?? null,
    webhookUrl: policy.webhookUrl ?? null,
    actions: [...catalog.flatMap(entry => [!entry.productId && `create product ${entry.key}`, !entry.priceId && `create price ${entry.key}`].filter(Boolean)), ...(!portal ? ['create portal configuration'] : []), ...(policy.webhookUrl && !endpoint ? ['create webhook endpoint'] : [])],
  }
  return { ...plan, reviewDigest: hash(plan) }
}

export async function apply(client, policy, environment, reviewed, checkpoint = async () => {}) {
  const current = await prepare(client, policy, environment)
  if (stable(current) !== stable(reviewed)) fail('Reviewed plan differs from the current account/policy inventory; prepare and review again')
  const manifest = { ...current, catalog: current.catalog.map(entry => ({ ...entry })), created: [] }
  const create = async (resource, form, key) => {
    const idempotency = `sneepcut-config:${hash({ account: current.accountId, configuration: policy.configurationKey, resource, key, form })}`
    const result = await client.request('POST', resource, form, idempotency)
    assertTest(result, 'Created resource')
    // Never copy the response: webhook creation includes a signing secret.
    manifest.created.push({ resource, key, id: result.id })
    await checkpoint(manifest)
    return result.id
  }
  for (const entry of policy.catalog) {
    const actual = manifest.catalog.find(item => item.key === entry.key)
    if (!actual.productId) actual.productId = await create('/products', { name: entry.name, metadata: metadata(policy, entry.key) }, `product:${entry.key}`)
    if (!actual.priceId) actual.priceId = await create('/prices', {
      product: actual.productId, currency: entry.currency, unit_amount: entry.unitAmount, tax_behavior: entry.taxBehavior,
      lookup_key: `${policy.configurationKey}:${entry.key}`, metadata: metadata(policy, entry.key),
      ...(PLAN_KEYS.includes(entry.key) ? { recurring: { interval: entry.interval, interval_count: entry.intervalCount, usage_type: 'licensed' } } : {}),
    }, `price:${entry.key}`)
    await checkpoint(manifest)
  }
  if (!manifest.portalConfigurationId) manifest.portalConfigurationId = await create('/billing_portal/configurations', { ...portalSettings(policy, manifest.catalog), metadata: metadata(policy, 'portal') }, 'portal')
  if (policy.webhookUrl && !manifest.webhookEndpointId) manifest.webhookEndpointId = await create('/webhook_endpoints', {
    url: policy.webhookUrl, api_version: API_VERSION, enabled_events: WEBHOOK_EVENTS, metadata: metadata(policy, 'webhook'),
    description: `Sneep Cut isolated sandbox: ${policy.configurationKey}`,
  }, 'webhook')
  manifest.actions = []
  manifest.environmentVariables = {
    STRIPE_MODE: 'test', STRIPE_EXPECTED_ACCOUNT_ID: current.accountId,
    STRIPE_PORTAL_CONFIGURATION: manifest.portalConfigurationId,
    ...Object.fromEntries(manifest.catalog.map(entry => [`STRIPE_PRICE_${entry.key.toUpperCase()}`, entry.priceId])),
  }
  manifest.webhookSecretAction = manifest.webhookEndpointId ? 'Read the endpoint signing secret through secure Stripe Dashboard access and inject STRIPE_WEBHOOK_SECRET into the sandbox runtime; it is deliberately absent from this manifest.' : 'Use stripe listen with the isolated account and inject its signing secret securely; no remote webhook endpoint was requested.'
  await checkpoint(manifest)
  return manifest
}

async function main() {
  const [mode, ...args] = process.argv.slice(2)
  const options = {}
  for (let index = 0; index < args.length; index += 2) {
    if (!['--policy', '--out', '--reviewed'].includes(args[index]) || !args[index + 1] || options[args[index]]) fail('Use prepare|apply --policy <json> --out <json> [--reviewed <json>]')
    options[args[index]] = args[index + 1]
  }
  if (!['prepare', 'apply'].includes(mode) || !options['--policy'] || !options['--out'] || (mode === 'apply' && !options['--reviewed'])) fail('Use prepare|apply --policy <json> --out <json> [--reviewed <json>]')
  const output = path.resolve(options['--out'])
  if ([options['--policy'], options['--reviewed']].filter(Boolean).some(filename => path.resolve(filename) === output)) fail('Output must not overwrite the policy or reviewed plan')
  const policy = JSON.parse(await readFile(options['--policy'], 'utf8'))
  const client = createStripeClient(process.env.STRIPE_SECRET_KEY)
  const save = value => writeFile(output, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 })
  const result = mode === 'prepare' ? await prepare(client, policy, process.env) : await apply(client, policy, process.env, JSON.parse(await readFile(options['--reviewed'], 'utf8')), save)
  await save(result)
  console.log(`${mode === 'prepare' ? 'Review plan prepared' : 'Sandbox configuration completed'} for ${result.accountId}; nonsecret IDs saved to the requested output file.`)
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(error => {
    // JSON/parser/filesystem messages can contain private input; emit only errors we own.
    const safe = error instanceof SyntaxError || error.code ? 'Could not read/write the requested local JSON files; check paths, permissions and JSON syntax.' : error.message
    console.error(safe)
    process.exitCode = 1
  })
}
