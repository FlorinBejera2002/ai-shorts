import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const nginx = readFileSync(new URL('../../nginx/nginx.conf', import.meta.url), 'utf8')
const mediaApi = readFileSync(
  new URL('../../backend/app/api/media.py', import.meta.url),
  'utf8'
)
const clipsApi = readFileSync(
  new URL('../../backend/app/api/clips.py', import.meta.url),
  'utf8'
)
const frontendClipApi = readFileSync(
  new URL('../src/app/api/clips/[id]/route.ts', import.meta.url),
  'utf8'
)

test('nginx protects media and keeps thumbnails out of the static proxy regex', () => {
  assert.match(nginx, /location \^~ \/media\/\s*\{[\s\S]*?auth_request \/_media_auth;/)
  assert.match(nginx, /location = \/_media_auth\s*\{[\s\S]*?\/api\/media\/verify-request/)
  assert.match(mediaApi, /verify_signature\(parsed\.path, expires\[0\], signatures\[0\]\)/)
})

test('clip media is deleted before its database row', () => {
  const storageDelete = clipsApi.indexOf('storage.delete_file(key)')
  const databaseDelete = clipsApi.indexOf('await db.delete(clip)')
  assert.ok(storageDelete > 0)
  assert.ok(databaseDelete > storageDelete)
})

test('clip detail signs every local media consumer, including editor source', () => {
  assert.match(frontendClipApi, /auth\(\)/)
  assert.match(frontendClipApi, /clip\.file_url = resolveMediaUrl\(/)
  assert.match(frontendClipApi, /clip\.thumbnail_url = resolveMediaUrl\(/)
  assert.match(frontendClipApi, /clip\.source_video_url = resolveMediaUrl\(/)
  assert.match(frontendClipApi, /clip\.file_storage_key/)
  assert.match(frontendClipApi, /clip\.thumbnail_storage_key/)
  assert.match(frontendClipApi, /clip\.source_storage_key/)
  assert.match(frontendClipApi, /Cache-Control': 'private, no-store'/)
})
