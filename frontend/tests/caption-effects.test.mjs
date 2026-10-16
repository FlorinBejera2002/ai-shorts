import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import ts from 'typescript'

const compiled = ts.transpileModule(
  readFileSync(
    new URL(
      '../src/components/dashboard/brand/caption-style.ts',
      import.meta.url
    ),
    'utf8'
  ),
  {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022
    }
  }
)
const { captionEffects, DEFAULT_CAPTION_STYLE } = await import(
  `data:text/javascript;base64,${Buffer.from(compiled.outputText).toString('base64')}`
)

test('independent Off survives switching presets without erasing stored values', () => {
  const style = {
    ...DEFAULT_CAPTION_STYLE,
    outline: 5,
    background_opacity: 0.7,
    highlight_color: '#ABCDEF',
    outline_enabled: false,
    background_enabled: false,
    active_word_enabled: false
  }
  for (const preset of [
    'bold-outline',
    'contrast-box',
    'active-background',
    'karaoke'
  ]) {
    const result = captionEffects({ ...style, preset }, 720, 36)
    assert.equal(result.outline, 0)
    assert.equal(result.backgroundOpacity, 0)
    assert.equal(result.activeWord, false)
  }
  assert.equal(style.outline, 5)
  assert.equal(style.highlight_color, '#ABCDEF')
})
test('legacy presets retain their default effects and explicit animation Off wins', () => {
  assert.ok(
    captionEffects(
      { ...DEFAULT_CAPTION_STYLE, preset: 'bold-outline' },
      720,
      36
    ).outline > 0
  )
  assert.equal(
    captionEffects(
      { ...DEFAULT_CAPTION_STYLE, preset: 'contrast-box' },
      720,
      36
    ).backgroundOpacity,
    0.82
  )
  assert.equal(
    captionEffects({ ...DEFAULT_CAPTION_STYLE, preset: 'phrase-pop' }, 720, 36)
      .animation,
    'phrase-pop'
  )
  assert.equal(
    captionEffects(
      { ...DEFAULT_CAPTION_STYLE, preset: 'phrase-pop', animation: 'none' },
      720,
      36
    ).animation,
    'none'
  )
})
test('turning backgrounds on restores a visible background and minimal outline can be enabled', () => {
  assert.equal(
    captionEffects(
      { ...DEFAULT_CAPTION_STYLE, background_enabled: true },
      720,
      36
    ).backgroundOpacity,
    0.82
  )
  assert.ok(
    captionEffects(
      { ...DEFAULT_CAPTION_STYLE, preset: 'minimal', outline_enabled: true },
      720,
      36
    ).outline > 0
  )
})
