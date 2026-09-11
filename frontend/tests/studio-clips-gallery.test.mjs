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

test('studio route retains the clip gallery and legacy clip deep links', () => {
  assert.match(studioPage, /<StudioClipsGallery\s*\/>/)
  assert.match(studioPage, /clip \? <StudioProjects initialClipId=\{clip\}/)
  assert.doesNotMatch(studioPage, /iframe/)
  assert.match(gallery, /\/api\/clips\/library\?\$\{query\}/)
  assert.doesNotMatch(gallery, /<iframe/)
})

test('every gallery card passes its selected clip to the direct Studio action', () => {
  assert.match(
    gallery,
    /<OpenStudioButton clipId=\{clip\.id\}/
  )
  assert.match(gallery, /data\.clips\.map/)
  assert.doesNotMatch(gallery, /\/dashboard\/studio\?clip=/)
})
