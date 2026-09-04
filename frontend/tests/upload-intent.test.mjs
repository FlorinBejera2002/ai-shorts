import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import ts from 'typescript'

const source = readFileSync(new URL('../src/lib/upload-intent.ts', import.meta.url), 'utf8')
const output = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 }
}).outputText
const module = await import(
  `data:text/javascript;base64,${Buffer.from(output).toString('base64')}`
)

test('accepts supported upload metadata and rejects unknown fields', () => {
  assert.deepEqual(
    module.validateUploadIntent({
      fileName: 'launch.mp4',
      fileSize: 1024,
      contentType: 'video/mp4'
    }),
    {
      success: true,
      data: {
        fileName: 'launch.mp4',
        fileSize: 1024,
        contentType: 'video/mp4'
      }
    }
  )
  assert.equal(
    module.validateUploadIntent({
      fileName: 'launch.mp4',
      fileSize: 1024,
      contentType: 'video/mp4',
      userId: 'other-user'
    }).success,
    false
  )
})

test('rejects unsupported and oversized files', () => {
  assert.equal(
    module.validateUploadIntent({
      fileName: 'payload.exe',
      fileSize: 1024,
      contentType: 'application/octet-stream'
    }).success,
    false
  )
  assert.equal(
    module.validateUploadIntent({
      fileName: 'video.mp4',
      fileSize: 2 * 1024 ** 3 + 1,
      contentType: 'video/mp4'
    }).success,
    false
  )
})

test('signs short-lived upload metadata without exposing the secret', () => {
  const signed = module.signUploadIntent({
    intent: { fileName: 'launch.mp4', fileSize: 1024, contentType: 'video/mp4' },
    userId: '16fd2706-8baf-433b-82eb-8c7fada847da',
    secret: 'a-dedicated-upload-secret-longer-than-thirty-two-characters',
    now: 1_000_000
  })
  assert.equal(signed.split('.').length, 2)
  assert.equal(signed.includes('dedicated-upload-secret'), false)
})

test('accepts only the raw direct-upload endpoint in production', () => {
  assert.equal(
    module.getDirectUploadUrl({
      APP_ENV: 'production',
      NEXT_PUBLIC_UPLOAD_URL: 'https://api.sneepcut.example/api/upload/direct'
    }),
    'https://api.sneepcut.example/api/upload/direct'
  )

  assert.throws(() =>
    module.getDirectUploadUrl({
      APP_ENV: 'production',
      NEXT_PUBLIC_UPLOAD_URL: 'https://api.sneepcut.example/api/upload'
    })
  )
  assert.throws(() =>
    module.getDirectUploadUrl({
      NODE_ENV: 'production',
      NEXT_PUBLIC_UPLOAD_URL: 'http://api.sneepcut.example/api/upload/direct'
    })
  )
})
