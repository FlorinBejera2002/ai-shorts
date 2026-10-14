import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'
import * as jsxRuntime from 'react/jsx-runtime'

const exports = {}
const icon = () => null
const problemExports = {}
vm.runInNewContext(
  ts.transpileModule(
    readFileSync(
      new URL('../src/components/story/story-error.ts', import.meta.url),
      'utf8'
    ),
    { compilerOptions: { module: ts.ModuleKind.CommonJS } }
  ).outputText,
  { exports: problemExports }
)
const imports = {
  './story-error': problemExports,
  'react/jsx-runtime': jsxRuntime,
  'lucide-react': Object.fromEntries(
    [
      'AudioLines',
      'Check',
      'CircleAlert',
      'Clock3',
      'Film',
      'ListVideo',
      'Pause',
      'SearchCheck',
      'Sparkles'
    ].map((name) => [name, icon])
  ),
  '@/components/jobs/processing-pipeline': { ProcessingPipeline: () => null },
  '@/components/ui/button': { Button: 'button' },
  './use-story-language': { useStoryLanguage: () => (english) => english },
  './story-processing.css': {}
}
const source = readFileSync(
  new URL('../src/components/story/story-processing.tsx', import.meta.url),
  'utf8'
)
vm.runInNewContext(
  ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX
    }
  }).outputText,
  {
    exports,
    require: (name) => {
      if (!(name in imports)) throw Error(`Unexpected import ${name}`)
      return imports[name]
    }
  }
)

function model(status, extra = {}, active = true) {
  return exports.StoryProcessing({
    project: { status, message: 'Exact server evidence', ...extra },
    active,
    busy: false,
    onCancel: () => {}
  }).props
}
const checkpoints = [
  'pending',
  'analyzing',
  'building_story',
  'editing',
  'reviewing'
]

test('ordinary Story phases mark only preceding checkpoints complete and never invent percentages', () => {
  for (const [index, phase] of checkpoints.entries()) {
    const props = model(phase)
    assert.equal(props.stage.key, phase)
    assert.equal(
      props.message,
      '',
      'Internal worker evidence is not shown to customers'
    )
    assert.equal(props.running, true)
    assert.equal(props.progress.value, undefined)
    assert.equal(
      props.stages.filter((stage) => stage.state === 'done').length,
      index
    )
    assert.equal(
      props.stages.find((stage) => stage.state === 'active').key,
      phase
    )
  }
})

test('both repair locations remain nonordinal and cannot imply a rendered or approved result', () => {
  for (const current_version of [0, 3]) {
    const props = model('improving', { current_version })
    assert.equal(props.stage.key, 'improving')
    assert.equal(props.stageLabel, undefined)
    assert.equal(props.countLabel, undefined)
    assert.equal(props.progress.value, undefined)
    assert.equal(
      props.stages.filter((stage) => stage.state === 'done').length,
      2
    )
    for (const key of ['building_story', 'editing', 'reviewing'])
      assert.equal(
        props.stages.find((stage) => stage.key === key).state,
        'waiting'
      )
  }
})

test('only Ready completes all checks; Needs review, failure, and cancellation stay honest', () => {
  const ready = model('ready', {}, false)
  assert.equal(ready.tone, 'success')
  assert.equal(ready.progress, undefined)
  assert.equal(ready.running, false)
  assert.equal(
    ready.stages.every((stage) => stage.state === 'done'),
    true
  )
  const review = model('needs_review', {}, false)
  assert.notEqual(review.tone, 'success')
  assert.equal(review.progress, undefined)
  assert.equal(
    review.stages.find((stage) => stage.key === 'reviewing').state,
    'attention'
  )
  for (const status of [
    'failed',
    'cancelled',
    'cancelling',
    'deleting',
    'unknown_phase'
  ]) {
    const props = model(status)
    assert.equal(props.running, false)
    assert.equal(props.progress, undefined)
    assert.equal(
      props.stages.every((stage) => stage.state === 'waiting'),
      true
    )
  }
})

test('legacy worker aliases preserve known stage evidence without guessing unknown stages', () => {
  assert.equal(model('queued').stage.key, 'pending')
  assert.equal(model('rendering').stage.key, 'editing')
  assert.equal(
    model('processing', { stage: 'reviewing' }).stage.key,
    'reviewing'
  )
  const unknown = model('processing', { stage: 'unrecognized_worker_phase' })
  assert.equal(unknown.running, false)
  assert.equal(unknown.progress, undefined)
  assert.equal(
    unknown.stages.every((stage) => stage.state === 'waiting'),
    true
  )
})
