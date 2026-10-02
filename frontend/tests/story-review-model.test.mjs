import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

const exports = {}
const source = readFileSync(
  new URL('../src/components/story/story-review-model.ts', import.meta.url),
  'utf8'
)
vm.runInNewContext(
  ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022
    }
  }).outputText,
  { exports }
)
const issue = (id, type, severity = 'minor', resolved = false) => ({
  id,
  type,
  severity,
  resolved,
  start: 0,
  end: 2,
  evidence: 'Original finding'
})

test('repeated scene findings become one customer topic without dropping findings', () => {
  const findings = Array.from({ length: 17 }, (_, index) =>
    issue(`shot-${index}`, 'b_roll')
  )
  const snapshot = structuredClone(findings)
  const groups = exports.groupReviewIssues(findings)
  assert.equal(groups.length, 1)
  assert.equal(groups[0].topic, 'visual')
  assert.equal(groups[0].issues.length, 17)
  assert.deepEqual(findings, snapshot)
})

test('blocking findings remain prominent and resolved findings stay out of action groups', () => {
  const groups = exports.groupReviewIssues([
    issue('shot', 'b_roll'),
    issue('caption', 'caption_text', 'major'),
    issue('file', 'file', 'critical'),
    issue('fixed', 'caption_timing', 'critical', true)
  ])
  assert.equal(groups[0].topic, 'file')
  assert.equal(groups[0].severity, 'critical')
  assert.equal(groups[1].topic, 'captions')
  assert.equal(groups[1].issues.length, 1)
})

test('unknown findings remain reviewable and coverage limitations are not invented defects', () => {
  assert.equal(exports.groupReviewIssues([]).length, 0)
  const groups = exports.groupReviewIssues([
    issue('unknown', 'new_reviewer_finding', 'major')
  ])
  assert.equal(groups[0].topic, 'other')
  assert.equal(groups[0].severity, 'major')
})

test('plain findings remain visible while model internals stay in the original report', () => {
  const groups = exports.groupReviewIssues([
    {
      ...issue('clear', 'caption_text', 'major'),
      evidence: 'A spoken number is transcribed incorrectly.'
    },
    {
      ...issue('internal', 'caption_text', 'major'),
      evidence: 'Candidate x audio_score=0.192; text field empty'
    }
  ])
  assert.equal(groups[0].descriptions.length, 1)
  assert.equal(
    groups[0].descriptions[0],
    'A spoken number is transcribed incorrectly.'
  )
  assert.equal(groups[0].issues.length, 2)
})
