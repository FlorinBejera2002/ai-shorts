import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFile } from 'node:fs/promises'
import { stripTypeScriptTypes } from 'node:module'
const source = await readFile(
  new URL(
    '../src/components/dashboard/brand/preview-gesture.ts',
    import.meta.url
  ),
  'utf8'
)
const { previewPointerGeometry, transformPreviewGesture, clampPreviewCenter } =
  await import(
    `data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(source)).toString('base64')}`
  )

test('pinch scales text while drag follows normalized frame coordinates', () => {
  const start = {
    transform: { x: 0.5, y: 0.6, size: 0.05 },
    ...previewPointerGeometry([
      { x: 100, y: 200 },
      { x: 200, y: 200 }
    ])
  }
  assert.deepEqual(
    transformPreviewGesture(
      start,
      [
        { x: 90, y: 220 },
        { x: 290, y: 220 }
      ],
      { width: 400, height: 800 },
      { min: 0.025, max: 0.12 }
    ),
    { x: 0.6, y: 0.625, size: 0.1 }
  )
})
test('pinch has useful bounds and stays within the visible frame', () => {
  const start = {
    transform: { x: 0.5, y: 0.5, size: 0.2 },
    center: { x: 0, y: 0 },
    distance: 10
  }
  assert.equal(
    transformPreviewGesture(
      start,
      [
        { x: -100, y: 0 },
        { x: 100, y: 0 }
      ],
      { width: 400, height: 800 },
      { min: 0.01, max: 0.5 }
    ).size,
    0.5
  )
  assert.equal(clampPreviewCenter(-1, 0.4), 0.2)
  assert.equal(clampPreviewCenter(2, 0.4), 0.8)
  assert.equal(clampPreviewCenter(0.9, 1.5), 0.5)
})
