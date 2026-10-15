import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import * as jsx from 'react/jsx-runtime'
import ts from 'typescript'

const exports = {}
const icon = () => React.createElement('svg', { 'aria-hidden': true })
const modules = {
  react: React,
  'react/jsx-runtime': jsx,
  'lucide-react': new Proxy({}, { get: () => icon }),
  'next/navigation': { useRouter: () => ({ refresh() {} }) },
  '@/components/ui/badge': { Badge: ({ children }) => React.createElement('span', {}, children) },
  '@/components/ui/card': { Card: ({ children }) => React.createElement('article', {}, children) },
  '@/components/ui/loading-indicator': { LoadingIndicator: icon },
  '@/components/ui/toast': { useToast: () => ({ add() {} }) },
  '@/components/clips/clip-download-menu': {
    ClipDownloadMenu: ({ label, fallbackUrl }) => React.createElement('a', { href: fallbackUrl }, label)
  },
  '@/i18n/navigation': { Link: ({ children, ...props }) => React.createElement('a', props, children) },
  '@/lib/auth': { apiFetch: () => { throw new Error('Rendering a clip must not mutate it') } }
}
vm.runInNewContext(
  ts.transpileModule(
    readFileSync(new URL('../src/components/clips/clip-card.tsx', import.meta.url), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }
  ).outputText,
  { exports, require: name => {
    assert.ok(name in modules, `Unexpected dependency: ${name}`)
    return modules[name]
  }, Intl, Date, Map, encodeURIComponent }
)

const clip = {
  id: 'synthetic-clip', title: 'Generated clip', hookText: null, duration: 12,
  viralScore: 8, resolution: '1080x1920', aspectRatio: '9:16', hasSubtitles: true,
  thumbnailUrl: null, fileUrl: '/generated.mp4', createdAt: '2026-10-15T12:00:00Z'
}

function renderCard(id = clip.id) {
  return renderToStaticMarkup(React.createElement(exports.ClipCard, {
    clip: { ...clip, id }, locale: 'en', index: 0,
    labels: { open: 'Open in Studio', score: 'Score', subtitles: 'Subtitles' },
    actions: {
      edit: 'Open in Studio', publish: 'Publish', download: 'Download', delete: 'Delete',
      deleteConfirm: 'Delete?', deleteSuccess: 'Deleted', deleteError: 'Failed'
    }
  }))
}

test('thumbnail, title and edit action open the same authenticated Studio launcher', () => {
  const html = renderCard()
  const hrefs = [...html.matchAll(/href="([^"]*)"/g)].map(match => match[1])
  assert.deepEqual(hrefs, [
    '/dashboard/clips/synthetic-clip',
    '/dashboard/clips/synthetic-clip',
    '/dashboard/clips/synthetic-clip',
    '/dashboard/publish/new?clip=synthetic-clip',
    '/generated.mp4'
  ])
  assert.match(html, /aria-label="Open in Studio: Generated clip"/)
  assert.doesNotMatch(html, /\/edit|<iframe|<video/)
})

test('clip links encode identifiers instead of allowing extra path or query segments', () => {
  const html = renderCard('clip/with?query')
  assert.equal((html.match(/href="\/dashboard\/clips\/clip%2Fwith%3Fquery"/g) ?? []).length, 3)
  assert.match(html, /href="\/dashboard\/publish\/new\?clip=clip%2Fwith%3Fquery"/)
})
