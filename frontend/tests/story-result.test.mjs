import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'
import * as React from 'react'
import * as jsxRuntime from 'react/jsx-runtime'
import { renderToStaticMarkup } from 'react-dom/server'
import { loadTsModule } from './support/load-ts-module.mjs'

const resultOutputs = loadTsModule('src/components/story/story-result-outputs.ts', {
  './types': loadTsModule('src/components/story/types.ts')
})

function renderResult(version, locale = 'en', deleteControl) {
  const exports = {}
  const imports = {
    react: React,
    'react/jsx-runtime': jsxRuntime,
    '@/i18n/navigation': { Link: ({ href, children }) => React.createElement('a', { href }, children) },
    '@/components/ui/button': { Button: ({ children }) => children },
    '@/components/studio/open-studio-button': {
      OpenStudioButton: ({ clipId }) => React.createElement('button', { 'data-clip-id': clipId }, 'Open in Studio')
    },
    './story-result-header': {
      StoryResultHeader: () => null,
      StoryResultDownload: () => null
    },
    './story-review': { StoryReview: () => null },
    './story-music-credits': { StoryMusicCredits: () => null },
    './story-caption-status': { StoryCaptionStatus: () => null },
    './story-output.css': {},
    './story-result.css': {},
    './story-pill-actions.css': {},
    './story-result-strip': { StoryResultStrip: () => null },
    './story-result-player': {
      StoryResultPlayer: ({ src }) => React.createElement('video', { src })
    },
    '@/lib/youtube': { formatDuration: (seconds) => `${seconds}s` },
    './story-result-outputs': resultOutputs,
    './use-story-language': { useStoryLanguage: () => (en, ro) => locale === 'ro' ? ro : en }
  }
  vm.runInNewContext(ts.transpileModule(
    readFileSync(new URL('../src/components/story/story-result.tsx', import.meta.url), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }
  ).outputText, { exports, require: (name) => {
    if (!(name in imports)) throw new Error(`Unexpected import ${name}`)
    return imports[name]
  } })
  return renderToStaticMarkup(React.createElement(exports.StoryResult, {
    project: { options: { aspect_ratio: '9:16' } },
    version: { number: 1, timeline: [], report: { status: 'ready' }, ...version },
    deleteControl
  }))
}

test('published results open the exact saved clip in Studio and link to the shared library', () => {
  const output = renderResult({ clip_id: 'clip-id', preview_url: '/preview.mp4' })
  assert.match(output, /data-clip-id="clip-id"/)
  assert.match(output, /href="\/dashboard\/clips"/)
  assert.match(output, /Open in Studio/)
  assert.match(output, /src="\/preview.mp4"/)
})

test('results without a published clip keep the library link without claiming a save or offering unavailable editing', () => {
  for (const locale of ['en', 'ro']) {
    const output = renderResult({}, locale)
    assert.match(output, /href="\/dashboard\/clips"/)
    assert.doesNotMatch(output, /<button|saved with your clips|salvat alături de clipurile tale|Open it in Studio|Deschide-l în Studio/)
    assert.match(output, locale === 'ro' ? /nu este disponibil în Studio/ : /not available in Studio/)
    assert.match(output, locale === 'ro' ? /Nu este disponibilă o previzualizare/ : /A browser preview is not available/)
  }
})

test('the result shows the done illustration, no settings disclosure, and project deletion as the last step', () => {
  const output = renderResult({ clip_id: 'clip-id', preview_url: '/preview.mp4' }, 'en', React.createElement('button', null, 'DELETE_CONTROL'))
  assert.match(output, /src="\/illustrations\/create-done\.webp"/)
  assert.doesNotMatch(output, /Original files and settings|Fișiere originale/)
  assert.match(output, /class="story-result-footer"[^]*DELETE_CONTROL/)
  assert.ok(output.indexOf('Open in Studio') < output.indexOf('DELETE_CONTROL'))
})
