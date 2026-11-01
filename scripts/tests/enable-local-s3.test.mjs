import assert from 'node:assert/strict'
import test from 'node:test'
import { parseEnv } from 'node:util'
import { localS3Settings, updateEnvironment } from '../enable-local-s3.mjs'

test('local settings keep native and signed container/browser endpoints distinct', () => {
  const { values, nativeEndpoint } = localS3Settings({ SEAWEEDFS_PORT: '8334', SEAWEEDFS_BUCKET: 'local-media' })
  assert.equal(nativeEndpoint, 'http://127.0.0.1:8334')
  assert.equal(values.AWS_ENDPOINT_URL, 'http://s3.localhost:8334')
  assert.equal(values.SNEEPCUT_MEDIA_S3_ORIGIN, values.AWS_ENDPOINT_URL)
  assert.equal(values.AWS_PUBLIC_BASE_URL, 'http://s3.localhost:8334/local-media')
  assert.equal(values.STORAGE_TYPE, 's3')
  assert.equal(values.AWS_SESSION_TOKEN, '')
  assert.deepEqual(localS3Settings({ ...values, SEAWEEDFS_PORT: '8334', SEAWEEDFS_BUCKET: 'local-media' }).values, values)
})

test('refuses production configuration, existing provider settings and invalid destinations', () => {
  for (const settings of [{ APP_ENV: 'production' }, { AWS_SECRET_ACCESS_KEY: 'another-provider' },
    { AWS_ENDPOINT_URL: 'https://storage.example.com' }, { SEAWEEDFS_PORT: '0' }, { SEAWEEDFS_BUCKET: '../bucket' }])
    assert.throws(() => localS3Settings(settings))
})

test('environment update preserves unrelated settings, handles duplicates and quotes spaces', () => {
  const original = '# Existing settings\r\nSTORAGE_TYPE=local\r\nUNRELATED="keep $this"\r\nSTORAGE_TYPE=local\r\n'
  const next = updateEnvironment(original, { STORAGE_TYPE: 's3', AWS_SECRET_ACCESS_KEY: 'local $literal spaces' })
  const parsed = parseEnv(next)
  assert.equal(parsed.STORAGE_TYPE, 's3')
  assert.equal(parsed.UNRELATED, 'keep $this')
  assert.equal(parsed.AWS_SECRET_ACCESS_KEY, 'local $literal spaces')
  assert.equal((next.match(/STORAGE_TYPE='s3'/g) || []).length, 2)
  assert.throws(() => updateEnvironment(original, { AWS_SECRET_ACCESS_KEY: 'line\nbreak' }), /Unsupported/)
})
