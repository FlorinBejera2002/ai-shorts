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
    },
    fileName: relativePath,
    reportDiagnostics: true
  })
  const errors = (transpiled.diagnostics ?? []).filter(
    (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error
  )
  assert.deepEqual(errors, [])
  return import(
    `data:text/javascript;base64,${Buffer.from(transpiled.outputText).toString('base64')}`
  )
}

const {
  fitsBcryptPasswordLimit,
  hasCurrentSessionVersion,
  hasRecentAuthentication,
  normalizeDisplayName,
  passwordPolicyIssues,
  validateAccountDeletionPayload,
  validatePasswordPayload,
  validateProfilePayload
} = await loadTypeScriptModule('../src/lib/account-settings.ts')

test('legacy or stale JWT session versions fail closed', () => {
  assert.equal(hasCurrentSessionVersion(undefined, 0), false)
  assert.equal(hasCurrentSessionVersion('0', 0), false)
  assert.equal(hasCurrentSessionVersion(0, 0), true)
  assert.equal(hasCurrentSessionVersion(0, 1), false)
  assert.equal(hasCurrentSessionVersion(1, 1), true)
})

test('normalizes and validates display names', () => {
  assert.equal(normalizeDisplayName('  Ada   Lovelace  '), 'Ada Lovelace')
  assert.deepEqual(validateProfilePayload({ name: '  Ada   Lovelace  ' }), {
    success: true,
    data: { name: 'Ada Lovelace' }
  })
  assert.equal(validateProfilePayload({ name: 'A' }).success, false)
  assert.equal(validateProfilePayload({ name: 'A'.repeat(81) }).success, false)
  assert.equal(
    validateProfilePayload({ name: 'Ada', role: 'admin' }).success,
    false
  )
})

test('enforces the complete password policy', () => {
  assert.equal(passwordPolicyIssues('StrongPass123!').length, 0)
  const fields = passwordPolicyIssues('weak').map((issue) => issue.field)
  assert.ok(fields.length >= 3)
  assert.equal(fitsBcryptPasswordLimit('a'.repeat(72)), true)
  assert.equal(fitsBcryptPasswordLimit('a'.repeat(73)), false)
  assert.equal(fitsBcryptPasswordLimit('é'.repeat(36)), true)
  assert.equal(fitsBcryptPasswordLimit('é'.repeat(37)), false)
  assert.ok(passwordPolicyIssues(`Aa1!${'x'.repeat(69)}`).length > 0)

  assert.equal(
    validatePasswordPayload({
      currentPassword: 'OldPass123!',
      newPassword: 'NewStrongPass123!',
      confirmPassword: 'NewStrongPass123!'
    }).success,
    true
  )
  assert.equal(
    validatePasswordPayload({
      currentPassword: 'SameStrongPass123!',
      newPassword: 'SameStrongPass123!',
      confirmPassword: 'different'
    }).success,
    false
  )
})

test('requires an exact case-insensitive account-email confirmation', () => {
  assert.equal(
    validateAccountDeletionPayload(
      { confirmation: ' Creator@Example.com ' },
      'creator@example.com'
    ).success,
    true
  )
  assert.equal(
    validateAccountDeletionPayload(
      { confirmation: 'DELETE' },
      'creator@example.com'
    ).success,
    false
  )
  assert.equal(
    validateAccountDeletionPayload(
      { confirmation: 'creator@example.com', force: true },
      'creator@example.com'
    ).success,
    false
  )
  assert.equal(
    validateAccountDeletionPayload(
      {
        confirmation: 'creator@example.com',
        currentPassword: 'CurrentPass123!'
      },
      'creator@example.com',
      true
    ).success,
    true
  )
  assert.equal(
    validateAccountDeletionPayload(
      { confirmation: 'creator@example.com' },
      'creator@example.com',
      true
    ).success,
    false
  )
})

test('accepts only a bounded recent provider authentication', () => {
  const now = 2_000_000
  assert.equal(hasRecentAuthentication(now - 60_000, now), true)
  assert.equal(hasRecentAuthentication(now - 10 * 60_000, now), true)
  assert.equal(hasRecentAuthentication(now - 10 * 60_000 - 1, now), false)
  assert.equal(hasRecentAuthentication(now + 1, now), false)
  assert.equal(hasRecentAuthentication(undefined, now), false)
})
