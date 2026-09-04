import { pathToFileURL } from 'node:url'

const PRIVATE_HOSTS = new Set([
  'backend',
  'localhost',
  'nginx',
  'postgres',
  'redis',
  '127.0.0.1',
  '::1'
])
const PLACEHOLDER_SECRET =
  /(?:change[-_ ]?me|placeholder|replace[-_ ]?me|example|test[-_ ]?value|your[-_])/i

function value(environment, key) {
  return environment[key]?.trim() ?? ''
}

function parseUrl(environment, key, issues, protocols) {
  const raw = value(environment, key)
  if (!raw) {
    issues.push(`${key} is required`)
    return null
  }

  try {
    const url = new URL(raw)
    if (!protocols.includes(url.protocol)) {
      issues.push(`${key} must use ${protocols.join(' or ')}`)
    }
    if (url.username && key !== 'DATABASE_URL' && key !== 'REDIS_URL') {
      issues.push(`${key} must not contain URL credentials`)
    }
    if (PRIVATE_HOSTS.has(url.hostname.toLowerCase())) {
      issues.push(`${key} must use a publicly reachable production host`)
    }
    return url
  } catch {
    issues.push(`${key} must be a valid URL`)
    return null
  }
}

function requireSecret(environment, key, issues, minimum = 24) {
  const secret = value(environment, key)
  if (!secret) issues.push(`${key} is required`)
  else if (secret.length < minimum) {
    issues.push(`${key} must contain at least ${minimum} characters`)
  } else if (PLACEHOLDER_SECRET.test(secret)) {
    issues.push(`${key} must not use a placeholder value`)
  }
}

export function validateCloudflareEnvironment(environment) {
  const issues = []
  const appUrl = parseUrl(environment, 'APP_URL', issues, ['https:'])
  const nextAuthUrl = parseUrl(environment, 'NEXTAUTH_URL', issues, ['https:'])
  const publicAppUrl = parseUrl(
    environment,
    'NEXT_PUBLIC_APP_URL',
    issues,
    ['https:']
  )
  const backendUrl = parseUrl(environment, 'BACKEND_URL', issues, ['https:'])
  parseUrl(environment, 'MEDIA_PROXY_HOST', issues, ['https:'])
  const uploadUrl = parseUrl(environment, 'NEXT_PUBLIC_UPLOAD_URL', issues, ['https:'])
  if (uploadUrl && uploadUrl.pathname !== '/api/upload/direct') {
    issues.push('NEXT_PUBLIC_UPLOAD_URL must end with /api/upload/direct')
  }
  if (uploadUrl && backendUrl && uploadUrl.origin !== backendUrl.origin) {
    issues.push('NEXT_PUBLIC_UPLOAD_URL must use the BACKEND_URL origin')
  }
  const databaseUrl = parseUrl(
    environment,
    'DATABASE_URL',
    issues,
    ['postgres:', 'postgresql:']
  )
  if (
    databaseUrl &&
    !['require', 'verify-ca', 'verify-full'].includes(
      databaseUrl.searchParams.get('sslmode') ?? ''
    )
  ) {
    issues.push(
      'DATABASE_URL must enforce TLS with sslmode=require, verify-ca, or verify-full'
    )
  }
  parseUrl(environment, 'REDIS_URL', issues, ['rediss:'])

  const origins = [appUrl, nextAuthUrl, publicAppUrl]
    .filter(Boolean)
    .map((url) => url.origin)
  if (new Set(origins).size > 1) {
    issues.push('APP_URL, NEXTAUTH_URL, and NEXT_PUBLIC_APP_URL must share one origin')
  }

  const authSecret = value(environment, 'AUTH_SECRET') || value(environment, 'NEXTAUTH_SECRET')
  if (authSecret.length < 32) {
    issues.push('AUTH_SECRET or NEXTAUTH_SECRET must contain at least 32 characters')
  } else if (PLACEHOLDER_SECRET.test(authSecret)) {
    issues.push('AUTH_SECRET or NEXTAUTH_SECRET must not use a placeholder value')
  }
  requireSecret(environment, 'INTERNAL_API_KEY', issues, 32)
  requireSecret(environment, 'UPLOAD_TOKEN_SECRET', issues, 32)
  requireSecret(environment, 'STRIPE_SECRET_KEY', issues)
  requireSecret(environment, 'STRIPE_WEBHOOK_SECRET', issues)
  if (!value(environment, 'STRIPE_SECRET_KEY').startsWith('sk_live_')) {
    issues.push('STRIPE_SECRET_KEY must be a live Stripe secret key')
  }
  if (!value(environment, 'STRIPE_WEBHOOK_SECRET').startsWith('whsec_')) {
    issues.push('STRIPE_WEBHOOK_SECRET must be a Stripe webhook secret')
  }

  const stripePrices = [
    'STRIPE_PRICE_CREATOR',
    'STRIPE_PRICE_PRO',
    'STRIPE_PRICE_AGENCY'
  ].map((key) => {
    const price = value(environment, key)
    if (!price) issues.push(`${key} is required`)
    else if (!price.startsWith('price_')) issues.push(`${key} must be a Stripe price ID`)
    return price
  })
  const configuredPrices = stripePrices.filter(Boolean)
  if (new Set(configuredPrices).size !== configuredPrices.length) {
    issues.push('Every paid plan must use a distinct Stripe price ID')
  }

  const googleClientId = value(environment, 'GOOGLE_CLIENT_ID')
  const googleClientSecret = value(environment, 'GOOGLE_CLIENT_SECRET')
  if (Boolean(googleClientId) !== Boolean(googleClientSecret)) {
    issues.push('GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be configured together')
  }

  if (value(environment, 'APP_ENV') !== 'production') {
    issues.push('APP_ENV must be production')
  }
  if (value(environment, 'AUTH_TRUST_HOST') !== 'true') {
    issues.push('AUTH_TRUST_HOST must be exactly true')
  }

  const contactEmail = value(environment, 'NEXT_PUBLIC_CONTACT_EMAIL')
  if (contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) {
    issues.push('NEXT_PUBLIC_CONTACT_EMAIL must be a valid email address')
  }

  return issues
}

function run() {
  const issues = validateCloudflareEnvironment(process.env)
  if (issues.length > 0) {
    console.error('Cloudflare production environment is not ready:')
    for (const issue of issues) console.error(`- ${issue}`)
    process.exitCode = 1
    return
  }
  console.log('Cloudflare production environment validation passed.')
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) run()
