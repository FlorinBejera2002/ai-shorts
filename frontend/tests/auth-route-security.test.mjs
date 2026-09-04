import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

function source(relativePath) {
  return readFileSync(new URL(relativePath, import.meta.url), 'utf8')
}

const registerRoute = source('../src/app/api/auth/register/route.ts')
const forgotRoute = source('../src/app/api/auth/forgot-password/route.ts')
const resetRoute = source('../src/app/api/auth/reset-password/route.ts')
const authLibrary = source('../src/lib/auth.ts')

test('credential entry points enforce bounded JSON and bcrypt byte limits', () => {
  for (const route of [registerRoute, forgotRoute, resetRoute]) {
    assert.match(route, /readBoundedJson\(/)
    assert.match(route, /Content-Type must be application\/json/)
    assert.match(route, /Cache-Control': 'private, no-store'/)
  }
  assert.match(authLibrary, /fitsBcryptPasswordLimit\(password\)/)
})

test('password reset tokens are digested, single-use, and revoke sessions', () => {
  assert.match(forgotRoute, /createHash\('sha256'\)/)
  assert.match(forgotRoute, /token: tokenDigest/)
  assert.doesNotMatch(forgotRoute, /data: \{ identifier, token, expires \}/)

  assert.match(resetRoute, /createHash\('sha256'\)/)
  assert.match(resetRoute, /await prisma\.\$transaction\(async \(tx\)/)
  assert.match(resetRoute, /tx\.verificationToken\.deleteMany/)
  assert.match(resetRoute, /if \(consumed\.count !== 1\)/)
  assert.match(resetRoute, /sessionVersion: \{ increment: 1 \}/)
  assert.match(resetRoute, /tx\.session\.deleteMany/)
})
