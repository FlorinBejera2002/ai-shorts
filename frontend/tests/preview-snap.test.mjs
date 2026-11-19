import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFile } from 'node:fs/promises'
import { stripTypeScriptTypes } from 'node:module'

const source = await readFile(new URL('../src/components/dashboard/brand/preview-snap.ts', import.meta.url), 'utf8')
const { snapAxis, CAPTION_TARGETS, LOGO_TARGETS, SAFE_INSET } = await import(
  `data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(source)).toString('base64')}`
)

test('captions snap their centre to the middle and the thirds', () => {
  assert.deepEqual(snapAxis(0.508, 0, CAPTION_TARGETS.x), { value: 0.5, guide: 0.5 })
  assert.deepEqual(snapAxis(0.34, 0, CAPTION_TARGETS.y), { value: 1 / 3, guide: 1 / 3 })
  assert.deepEqual(snapAxis(0.6, 0, CAPTION_TARGETS.y), { value: 0.6, guide: null }, 'Away from a guide nothing snaps')
})

test('the logo snaps its edges to the safe zone and picks the nearest guide', () => {
  // A logo 0.2 wide whose left edge sits 0.01 inside the safe zone moves so the edge is on it.
  const left = snapAxis(SAFE_INSET + 0.01 + 0.1, 0.1, LOGO_TARGETS.x)
  assert.equal(left.guide, SAFE_INSET)
  assert.ok(Math.abs(left.value - (SAFE_INSET + 0.1)) < 1e-9)
  const right = snapAxis(1 - SAFE_INSET - 0.1 + 0.005, 0.1, LOGO_TARGETS.x)
  assert.equal(right.guide, 1 - SAFE_INSET)
  assert.ok(Math.abs(right.value - (1 - SAFE_INSET - 0.1)) < 1e-9)
  assert.deepEqual(snapAxis(0.505, 0.05, LOGO_TARGETS.y), { value: 0.5, guide: 0.5 })
})
