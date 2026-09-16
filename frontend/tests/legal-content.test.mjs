import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path) =>
  readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

const core = read('src/lib/legal-content.ts')
const additional = read('src/lib/additional-legal-content.ts')
const allLegalCopy = `${core}\n${additional}`

test('public legal copy identifies the operator in both languages', () => {
  for (const required of [
    'GENESIS PROCUREMENT S.R.L.',
    '54235600',
    'J2026016652004',
    'Str. Parcului nr. 25',
    '+40 748 398 317',
    'admin@sneepcut.com',
    'genesis.int.group@gmail.com'
  ]) {
    assert.ok(
      allLegalCopy.includes(required),
      `Missing legal identity: ${required}`
    )
  }
  assert.doesNotMatch(
    allLegalCopy,
    /No public (?:privacy|legal) address is configured/
  )
})

test('privacy and deletion notices cover the implemented social workflow', () => {
  for (const required of [
    'photographs, videos, carousels',
    'Instagram, a Facebook Page, TikTok, YouTube',
    'encrypted access or refresh tokens',
    'Dashboard → Settings → Data & Privacy',
    'Instagram currently requires you to remove an already published post directly in Instagram'
  ]) {
    assert.ok(core.includes(required), `Missing social disclosure: ${required}`)
  }
})

test('cookie inventory matches first-party storage used by the product', () => {
  for (const storageName of [
    'refreshToken',
    'goGoogleState',
    'social_oauth_<provider>',
    'NEXT_LOCALE',
    'sidebar_state',
    'Studio last-project preference'
  ]) {
    assert.ok(
      additional.includes(storageName),
      `Missing cookie or storage disclosure: ${storageName}`
    )
  }
})

test('consumer copy uses current Romanian ADR information', () => {
  assert.match(additional, /https:\/\/reclamatiisal\.anpc\.ro\//)
  assert.doesNotMatch(allLegalCopy, /ec\.europa\.eu\/consumers\/odr/i)
  assert.match(
    allLegalCopy,
    /former EU Online Dispute Resolution platform was discontinued in 2025/
  )
})

test('extended legal package includes processor and payment documents', () => {
  for (const exportName of [
    'LEGAL_NOTICE_COPY',
    'COOKIE_POLICY_COPY',
    'ACCEPTABLE_USE_COPY',
    'REFUND_POLICY_COPY',
    'SUBPROCESSORS_COPY',
    'DPA_COPY'
  ]) {
    assert.match(additional, new RegExp(`export const ${exportName}`))
  }
  assert.match(additional, /Article 28 GDPR requirements/)
  assert.match(additional, /14 days from concluding a distance service/)
})
