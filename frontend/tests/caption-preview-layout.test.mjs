import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFile } from 'node:fs/promises'
import { stripTypeScriptTypes } from 'node:module'

const source = await readFile(new URL('../src/components/dashboard/brand/caption-preview-layout.ts', import.meta.url), 'utf8')
const { previewLayoutScale } = await import(`data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(source)).toString('base64')}`)

test('captions shrink to fit the frame and keep their size before the frame is laid out', () => {
  const caption = { maxWidth: 0.84, pad: 2, lineHeight: 20, lineCount: 2 }
  assert.equal(previewLayoutScale({ ...caption, frame: { w: 248, h: 440 }, blockWidth: 100 }), 1)
  assert.equal(previewLayoutScale({ ...caption, frame: { w: 248, h: 440 }, blockWidth: 400 }), (248 * 0.84) / 400)
  // A 0×0 frame used to give 0/0 → NaN font sizes.
  assert.equal(previewLayoutScale({ ...caption, frame: { w: 0, h: 0 }, blockWidth: 1, lineHeight: 0, lineCount: 0 }), 1)
})

const styleSource = await readFile(new URL('../src/components/dashboard/brand/caption-preview-style.ts', import.meta.url), 'utf8')
const { captionWordStyle } = await import(`data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(styleSource)).toString('base64')}`)
const { previewCaptionBlock, captionKeyAction } = await import(`data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(source)).toString('base64')}`)

test('the caption block follows the active word, halves for stacked and shows one word for word-by-word', () => {
  const words = ['Create', 'a', 'story', 'today']
  const measure = (text) => text.length * 10
  const base = { words, measure, maxWidth: 1000, maxLines: 2 }
  assert.deepEqual(previewCaptionBlock({ ...base, index: 1, preset: 'classic' }).lines.map((line) => line.map((word) => word.text)), [words])
  const stacked = previewCaptionBlock({ ...base, index: 1, preset: 'stacked' })
  assert.deepEqual(stacked.lines.map((line) => line.map((word) => word.text)), [['Create', 'a'], ['story', 'today']])
  const single = previewCaptionBlock({ ...base, index: 2, preset: 'word-by-word' })
  assert.deepEqual(single.lines, [[{ text: 'story', index: 2, width: 50 }]])
  assert.deepEqual([single.firstIndex, single.lastIndex, single.blockWidth], [0, 3, 50], 'Phrase timing spans the whole chunk')
})

test('caption keys resize with +/- and move with the arrows', () => {
  assert.deepEqual(captionKeyAction('=', false), { resize: 0.005 })
  assert.deepEqual(captionKeyAction('-', false), { resize: -0.005 })
  assert.deepEqual(captionKeyAction('ArrowLeft', true), { dx: -0.05, dy: 0 })
  assert.equal(captionKeyAction('a', false), null)
})

test('word styles: highlight colour, highlighted background, karaoke fill and word pop', () => {
  const style = { preset: 'active-color', highlight_color: '#FACC15', text_color: '#FFFFFF' }
  const effects = { activeWord: true, animation: 'none' }
  assert.deepEqual(captionWordStyle({ style, effects, wordIndex: 1, activeIndex: 1, time: 0.6 }), { color: '#FACC15' })
  assert.deepEqual(captionWordStyle({ style, effects, wordIndex: 0, activeIndex: 1, time: 0.6 }), {})
  assert.equal(captionWordStyle({ style: { ...style, preset: 'active-background' }, effects, wordIndex: 1, activeIndex: 1, time: 0.6 }).backgroundColor, '#FACC15')
  const karaoke = captionWordStyle({ style: { ...style, preset: 'karaoke' }, effects, wordIndex: 0, activeIndex: 1, time: 0.25 })
  assert.equal(karaoke.backgroundImage, 'linear-gradient(to right,#FACC15 50%,#FFFFFF 50%)')
  assert.equal(karaoke.color, 'transparent')
  const pop = captionWordStyle({ style, effects: { activeWord: false, animation: 'word-pop' }, wordIndex: 2, activeIndex: 0, time: 0 })
  assert.deepEqual(pop, { display: 'inline-block', opacity: 0, transform: 'scale(0.8)' })
})
