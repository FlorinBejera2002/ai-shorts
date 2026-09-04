import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import { validateCloudflareEnvironment } from '../scripts/validate-cloudflare-env.mjs'

test('Worker bundling preserves self-contained next-themes inline scripts', () => {
  const config = JSON.parse(
    readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8')
  )
  assert.equal(config.keep_names, false)
})

const validEnvironment = {
  APP_ENV: 'production',
  AUTH_TRUST_HOST: 'true',
  APP_URL: 'https://app.sneepcut.example',
  NEXTAUTH_URL: 'https://app.sneepcut.example',
  NEXT_PUBLIC_APP_URL: 'https://app.sneepcut.example',
  BACKEND_URL: 'https://api.sneepcut.example',
  MEDIA_PROXY_HOST: 'https://media.sneepcut.example',
  NEXT_PUBLIC_UPLOAD_URL: 'https://api.sneepcut.example/api/upload/direct',
  DATABASE_URL:
    'postgresql://user:secret@db.sneepcut.example:5432/sneepcut?sslmode=require',
  REDIS_URL: 'rediss://default:secret@cache.sneepcut.example:6379',
  AUTH_SECRET: 'Yrp4ZQ0Y8G9vF2mWx1DK7aHs5Bc3Ne6J',
  INTERNAL_API_KEY: 'AK9nx2pW7M4dv8sF3zQ6hL1tY5cR0uBE',
  UPLOAD_TOKEN_SECRET: 'UT7fs2Kp9L4mx6Rz1Qd8vC3hN5aW0yEG',
  STRIPE_SECRET_KEY: 'sk_live_fixture_nonfunctional_00000000',
  STRIPE_WEBHOOK_SECRET: 'whsec_7QWERTYUIOPASDFGHJKLZXCVBNM',
  STRIPE_PRICE_CREATOR: 'price_creator',
  STRIPE_PRICE_PRO: 'price_pro',
  STRIPE_PRICE_AGENCY: 'price_agency',
  GOOGLE_CLIENT_ID: '',
  GOOGLE_CLIENT_SECRET: ''
}

test('accepts a complete public Cloudflare production environment', () => {
  assert.deepEqual(validateCloudflareEnvironment(validEnvironment), [])
})

test('rejects private service hosts and inconsistent application origins', () => {
  const issues = validateCloudflareEnvironment({
    ...validEnvironment,
    BACKEND_URL: 'http://backend:8000',
    REDIS_URL: 'redis://redis:6379',
    NEXTAUTH_URL: 'https://wrong.sneepcut.example'
  })
  assert.ok(issues.some((issue) => issue.startsWith('BACKEND_URL must use')))
  assert.ok(issues.some((issue) => issue.includes('publicly reachable')))
  assert.ok(issues.some((issue) => issue.includes('must share one origin')))
})

test('rejects missing secrets and duplicate plan prices', () => {
  const issues = validateCloudflareEnvironment({
    ...validEnvironment,
    AUTH_SECRET: '',
    INTERNAL_API_KEY: 'short',
    STRIPE_PRICE_PRO: 'price_creator'
  })
  assert.ok(issues.some((issue) => issue.includes('AUTH_SECRET')))
  assert.ok(issues.some((issue) => issue.includes('INTERNAL_API_KEY')))
  assert.ok(issues.some((issue) => issue.includes('distinct Stripe price')))
})

test('rejects unsafe database, upload, auth host, and placeholder configuration', () => {
  const issues = validateCloudflareEnvironment({
    ...validEnvironment,
    AUTH_TRUST_HOST: 'false',
    DATABASE_URL: 'postgresql://user:secret@db.sneepcut.example:5432/sneepcut',
    NEXT_PUBLIC_UPLOAD_URL:
      'https://uploads.sneepcut.example/api/upload/direct',
    UPLOAD_TOKEN_SECRET: 'replace-me-with-a-production-upload-secret',
    STRIPE_SECRET_KEY: 'sk_test_51QWERTYUIOPASDFGHJKLZXCVBNM'
  })
  assert.ok(issues.some((issue) => issue.includes('AUTH_TRUST_HOST')))
  assert.ok(
    issues.some((issue) => issue.includes('DATABASE_URL must enforce TLS'))
  )
  assert.ok(issues.some((issue) => issue.includes('BACKEND_URL origin')))
  assert.ok(issues.some((issue) => issue.includes('placeholder value')))
  assert.ok(issues.some((issue) => issue.includes('live Stripe secret key')))
})
