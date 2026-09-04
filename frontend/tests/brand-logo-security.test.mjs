import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

function source(relativePath) {
  return readFileSync(new URL(relativePath, import.meta.url), 'utf8')
}

const backendRoute = source('../../backend/app/api/brand.py')
const logoRoute = source('../src/app/api/user/brand/logo/route.ts')
const brandRoute = source('../src/app/api/user/brand/route.ts')
const brandLogoHelper = source('../src/lib/brand-logo.ts')
const brandPage = source('../src/app/[locale]/dashboard/brand/page.tsx')
const englishMessages = source('../messages/en.json')
const romanianMessages = source('../messages/ro.json')

test('watermark positions use translated labels in both locales', () => {
  const positions = brandPage.match(/const WATERMARK_POSITIONS = \[([\s\S]*?)\n\]/)?.[1]
  assert.ok(positions)
  const labels = [...positions.matchAll(/label: '([^']+)'/g)].map((match) => match[1])
  assert.equal(labels.length, 4)
  for (const messages of [englishMessages, romanianMessages]) {
    const brand = JSON.parse(messages).brand
    for (const label of labels) assert.equal(typeof brand[label], 'string')
  }
  assert.match(brandPage, /WATERMARK_POSITIONS\.map\(\(\{ value, label, icon: Icon \}\)/)
  assert.match(brandPage, /\{t\(label\)\}/)
})

test('backend accepts only fully parsed PNG, JPEG, and WebP logos', () => {
  const uploadExtensions = backendRoute.match(
    /ALLOWED_LOGO_EXTENSIONS = \{[^}]*\}/
  )?.[0]
  assert.ok(uploadExtensions)
  assert.match(uploadExtensions, /"\.png"/)
  assert.doesNotMatch(uploadExtensions, /"\.svg"/)
  assert.match(backendRoute, /Image\.open\(path\)/)
  assert.match(backendRoute, /image\.verify\(\)/)
  assert.match(backendRoute, /content_type_matches_extension/)
  assert.doesNotMatch(backendRoute, /"image\/svg\+xml"/)
})

test('upload persistence retains only a canonical user-scoped storage key', () => {
  assert.match(backendRoute, /logo_key = f"brand\/\{user\.id\}\//)
  assert.match(backendRoute, /return \{"logo_path": logo_key\}/)
  assert.match(logoRoute, /keyParts\[1\] !== session\.user\.id/)
  assert.match(
    logoRoute,
    /create: \{ userId: session\.user\.id, logoPath, logoUrl: null \}/
  )
  assert.match(logoRoute, /update: \{ logoPath, logoUrl: null \}/)
  assert.doesNotMatch(logoRoute, /logoUrl: logo_url/)
})

test('authenticated brand reads resolve a new URL without caching it', () => {
  assert.match(brandLogoHelper, /backendFetch\(/)
  assert.match(brandLogoHelper, /\/api\/brand\/logo\?logo_path=/)
  assert.match(brandRoute, /brandKit: await withFreshBrandLogo\(brandKit\)/)
  assert.match(logoRoute, /await withFreshBrandLogo\(storedBrandKit\)/)
  assert.match(brandRoute, /'Cache-Control': 'private, no-store'/)
  assert.match(logoRoute, /'Cache-Control': 'private, no-store'/)
})

test('brand UI no longer offers or advertises SVG uploads', () => {
  assert.match(brandPage, /image\/png,image\/jpeg,image\/webp/)
  assert.doesNotMatch(brandPage, /image\/svg\+xml/)
  assert.doesNotMatch(englishMessages, /PNG, JPG, WEBP or SVG/)
  assert.doesNotMatch(romanianMessages, /PNG, JPG, WEBP sau SVG/)
})
