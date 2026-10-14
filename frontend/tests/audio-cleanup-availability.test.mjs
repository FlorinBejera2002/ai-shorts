import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

let result = {}
let definition
const exports = {}
vm.runInNewContext(
  ts.transpileModule(
    readFileSync(
      new URL(
        '../src/hooks/use-audio-cleanup-availability.ts',
        import.meta.url
      ),
      'utf8'
    ),
    { compilerOptions: { module: ts.ModuleKind.CommonJS } }
  ).outputText,
  {
    exports,
    require: (name) => {
      if (name === '@tanstack/react-query')
        return {
          useQuery: (options) => {
            definition = options
            return result
          }
        }
      if (name === '@/lib/auth')
        return { apiFetch: async () => ({ ok: false }) }
      throw new Error(name)
    }
  }
)

test('cleanup capability fails closed while missing, failed or malformed', () => {
  for (const value of [undefined, false, 'true', 1]) {
    result = { data: { audio_cleanup: { available: value } }, isPending: false }
    assert.equal(exports.useAudioCleanupAvailability().available, false)
  }
  result = { data: { audio_cleanup: { available: true } }, isError: true }
  assert.equal(
    exports.useAudioCleanupAvailability().available,
    false,
    'A failed refresh cannot retain stale permission'
  )
  result = { data: { audio_cleanup: { available: true } }, isError: false }
  assert.equal(exports.useAudioCleanupAvailability().available, true)
})
test('capability fetch errors cannot become available', async () => {
  exports.useAudioCleanupAvailability()
  await assert.rejects(definition.queryFn(), /Media capabilities unavailable/)
})
