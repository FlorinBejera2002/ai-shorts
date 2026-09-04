import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import ts from 'typescript'

async function loadTypeScriptModule(relativePath) {
  const source = readFileSync(new URL(relativePath, import.meta.url), 'utf8')
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022
    }
  })
  return import(
    `data:text/javascript;base64,${Buffer.from(transpiled.outputText).toString('base64')}`
  )
}

const originalEnvironment = { ...process.env }
const site = await loadTypeScriptModule('../src/lib/site-config.ts')

test.afterEach(() => {
  process.env = { ...originalEnvironment }
})

test('uses unprefixed canonical URLs for the default locale', () => {
  process.env.NEXT_PUBLIC_APP_URL = 'https://app.example.test/base'
  assert.equal(site.localePath('en', '/pricing'), '/pricing')
  assert.equal(site.localePath('ro', '/pricing'), '/ro/pricing')
  assert.deepEqual(site.localizedUrls('/pricing'), {
    en: 'https://app.example.test/pricing',
    ro: 'https://app.example.test/ro/pricing',
    'x-default': 'https://app.example.test/pricing'
  })
  const entries = site.buildSitemapEntries()
  assert.equal(entries.length, 8)
  assert.equal(
    entries.some((entry) => new URL(entry.url).pathname.startsWith('/en')),
    false
  )
})

test('does not index localhost or expose an invalid contact address', () => {
  delete process.env.NEXT_PUBLIC_APP_URL
  delete process.env.APP_URL
  delete process.env.NEXTAUTH_URL
  process.env.NEXT_PUBLIC_CONTACT_EMAIL = 'not-an-email'
  assert.equal(site.isPublicProductionOrigin(), false)
  assert.equal(site.getContactEmail(), null)
  assert.equal(site.buildRobotsPolicy().rules.disallow, '/')
})

test('production robots policy blocks every private route', () => {
  const policy = site.buildRobotsPolicy(new URL('https://app.example.test'))
  assert.deepEqual(policy.rules.disallow, [...site.PRIVATE_ROUTES])
  assert.equal(policy.rules.disallow.includes('/dashboard'), true)
  assert.equal(policy.rules.disallow.includes('/ro/dashboard'), true)
})

test('accepts only a configured contact address', () => {
  process.env.NEXT_PUBLIC_CONTACT_EMAIL = 'privacy@example.test'
  assert.equal(site.getContactEmail(), 'privacy@example.test')
})
