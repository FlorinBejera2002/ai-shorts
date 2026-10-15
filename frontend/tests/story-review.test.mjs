import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'
import * as jsxRuntime from 'react/jsx-runtime'

function load(file, imports = {}) {
  const exports = {}
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX }
  }).outputText, { exports, require: (name) => {
    if (!(name in imports)) throw Error(`Unexpected import ${name}`)
    return imports[name]
  } })
  return exports
}
const model = load('../src/components/story/story-review-model.ts')
function reviewComponent(locale = 'en') {
  return load('../src/components/story/story-review.tsx', {
    '@/components/ui/button': { Button: 'button' },
    '@/lib/youtube': { formatDuration: String },
    './story-review-model': model,
    './use-story-language': { useStoryLanguage: () => (english, romanian) => locale === 'ro' ? romanian : english },
    'react/jsx-runtime': jsxRuntime
  }).StoryReview
}
const version = {
  accepted: true,
  report: {
    status: 'needs_review',
    issues: [],
    coverage: {
      file: true, audio: true, visual: true, captions: true,
      semantics: false, boundaries: true,
      incomplete: ['Manual Studio edits were preserved; automated review is incomplete.']
    }
  }
}

test('accepted drafts with incomplete review show a neutral localized review notice', () => {
  for (const locale of ['en', 'ro']) {
    const node = reviewComponent(locale)({ version })
    assert.equal(node.type, 'p')
    assert.equal(node.props.role, 'status')
    assert.equal(node.props['data-testid'], 'story-review-notice')
    assert.match(node.props.children, locale === 'ro' ? /imaginea, sunetul și subtitrările/ : /picture, sound and captions/)
    assert.doesNotMatch(node.props.children, /automated|incomplete|Manual Studio/)
    assert.match(node.props.className, /bg-muted/)
  }
})

test('ready and rejected versions do not display the neutral review notice', () => {
  const StoryReview = reviewComponent()
  assert.equal(StoryReview({ version: { ...version, accepted: false } }), null)
  assert.equal(StoryReview({ version: { ...version, report: { ...version.report, status: 'ready' } } }), null)
})

test('concrete media issues retain their existing issue presentation', () => {
  const node = reviewComponent()({ version: {
    ...version,
    report: { ...version.report, issues: [{ id: 'missing-audio', type: 'missing_audio', severity: 'major', start: 1, resolved: false }] }
  } })
  assert.equal(node.type, 'ul')
  assert.equal(node.props['aria-label'], 'Video issues')
  assert.equal(node.props.children[0].props['data-testid'], 'story-review-issue')
})
