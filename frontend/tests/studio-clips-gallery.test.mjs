import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const studioPage = readFileSync(
  new URL('../src/app/[locale]/dashboard/studio/page.tsx', import.meta.url),
  'utf8'
)
const gallery = readFileSync(
  new URL(
    '../src/components/studio/studio-clips-gallery.tsx',
    import.meta.url
  ),
  'utf8'
)

test('studio route renders the native clip gallery instead of the embedded studio', () => {
  assert.match(studioPage, /<StudioClipsGallery\s*\/>/)
  assert.doesNotMatch(studioPage, /StudioProjects|iframe/)
  assert.match(gallery, /\/api\/clips\/library\?\$\{query\}/)
  assert.doesNotMatch(gallery, /<iframe/)
})

test('every studio clip card links to its native editor', () => {
  assert.match(
    gallery,
    /href=\{`\/dashboard\/clips\/\$\{clip\.id\}\/edit`\}/
  )
  assert.match(gallery, /data\.clips\.map/)
})
