import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { validateCloudflareEnvironment } from '../scripts/validate-cloudflare-env.mjs'
const environment = { NEXT_PUBLIC_APP_URL: 'https://app.example.com', GO_API_URL: 'https://api.example.com', MEDIA_PROXY_HOST: 'https://media.example.com' }
test('validates frontend public transport configuration without backend credentials', () => { assert.deepEqual(validateCloudflareEnvironment(environment), []) })
test('rejects backend secrets in the frontend deployment environment', () => { assert.match(validateCloudflareEnvironment({ ...environment, DATABASE_URL: 'postgres://test', JWT_SECRET: 'fixture' }).join('\n'), /DATABASE_URL belongs only.*\nJWT_SECRET belongs only/) })
test('rejects private and insecure Cloudflare API origins', () => { assert.ok(validateCloudflareEnvironment({ ...environment, GO_API_URL: 'http://localhost:8080' }).some(issue => issue.startsWith('GO_API_URL'))) })
test('rejects transport URLs that would append API paths after a path, query, or fragment', () => {
  for (const key of ['NEXT_PUBLIC_APP_URL', 'GO_API_URL', 'MEDIA_PROXY_HOST', 'NEXT_PUBLIC_API_URL']) {
    for (const value of ['https://api.example.com/v1', 'https://api.example.com?route=old', 'https://api.example.com#old', 'https://localhost']) {
      assert.ok(validateCloudflareEnvironment({ ...environment, [key]: value }).some(issue => issue.startsWith(key)), `${key} accepted ${value}`)
    }
    assert.deepEqual(validateCloudflareEnvironment({ ...environment, [key]: 'https://api.example.com/' }), [])
  }
})
test('rejects mail and storage credentials from the frontend environment', () => {
  for (const key of ['RESEND_API_KEY', 'SMTP_PASSWORD', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_SESSION_TOKEN', 'UPLOAD_POST_API_KEY']) {
    assert.ok(validateCloudflareEnvironment({ ...environment, [key]: 'synthetic-value' }).some(issue => issue.startsWith(key)))
  }
})
test('Worker bundling preserves next-themes inline scripts', () => { const config = JSON.parse(readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8')); assert.equal(config.keep_names, false) })
test('production builds enable Next deployment skew protection', () => {
  const config = readFileSync(new URL('../next.config.ts', import.meta.url), 'utf8')
  assert.match(config, /NEXT_DEPLOYMENT_ID/)
  assert.match(config, /deploymentId:\s*resolveDeploymentId\(\)/)
})
