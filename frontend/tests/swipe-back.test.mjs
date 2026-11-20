import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import ts from 'typescript'

async function loadTypeScriptModule(relativePath) {
  const source = readFileSync(new URL(relativePath, import.meta.url), 'utf8')
  const transpiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 }
  })
  return import(`data:text/javascript;base64,${Buffer.from(transpiled.outputText).toString('base64')}`)
}

const { classifySwipe, commitsSwipe, startsAtEdge, swipeProgress, SWIPE_BACK_DISTANCE, SWIPE_BACK_EDGE } = await loadTypeScriptModule('../src/lib/swipe-back.ts')

const at = (x, y, time = 0) => ({ x, y, time })

test('edge swipe back only starts at the left screen edge', () => {
  assert.equal(startsAtEdge(at(0, 400)), true)
  assert.equal(startsAtEdge(at(SWIPE_BACK_EDGE, 400)), true)
  assert.equal(startsAtEdge(at(SWIPE_BACK_EDGE + 1, 400)), false)
})

test('a rightward drag becomes a swipe; vertical or leftward movement cancels it', () => {
  const start = at(4, 400)
  assert.equal(classifySwipe(start, at(9, 403), 'tracking'), 'tracking', 'too small to decide')
  assert.equal(classifySwipe(start, at(40, 410), 'tracking'), 'swiping')
  assert.equal(classifySwipe(start, at(20, 460), 'tracking'), 'cancelled', 'scrolling vertically')
  assert.equal(classifySwipe(at(20, 400), at(2, 400), 'tracking'), 'cancelled', 'moving left')
  assert.equal(classifySwipe(start, at(4, 600), 'swiping'), 'swiping', 'a decided swipe stays decided')
})

test('progress fills from the edge to the commit distance', () => {
  const start = at(4, 400)
  assert.equal(swipeProgress(start, at(4, 400)), 0)
  assert.equal(swipeProgress(start, at(4 + SWIPE_BACK_DISTANCE / 2, 400)), 0.5)
  assert.equal(swipeProgress(start, at(300, 400)), 1)
})

test('release commits after the full distance or a quick flick, not a short slow drag', () => {
  const start = at(4, 400, 0)
  assert.equal(commitsSwipe(start, at(4 + SWIPE_BACK_DISTANCE, 410, 800)), true)
  assert.equal(commitsSwipe(start, at(60, 405, 80)), true)
  assert.equal(commitsSwipe(start, at(60, 405, 400)), false)
  assert.equal(commitsSwipe(start, at(30, 400, 20)), false)
})
