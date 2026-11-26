import assert from 'node:assert/strict'
import test from 'node:test'
import { loadTsModule } from './support/load-ts-module.mjs'

const stages = loadTsModule('src/components/create/processing-stages.ts')
const upload = loadTsModule('src/components/story/story-processing-model.ts', {
  '@/components/create/processing-stages': stages
})
const jobs = loadTsModule('src/components/jobs/job-processing-model.ts', {
  '@/components/create/processing-stages': stages
})

const uploadLabels = ['Upload', 'Analysis', 'Moments', 'Edit', 'Check'].map((label, index) => ({
  key: `k${index}`,
  label
}))
const jobLabels = ['Download', 'Transcription', 'Analysis', 'Editing', 'Done'].map((label, index) => ({
  key: `j${index}`,
  label
}))
const states = (list) => list.map((stage) => stage.state)

test('running stages mark earlier stages done, the current one in progress and later ones upcoming', () => {
  assert.deepEqual(states(stages.buildStageStates(uploadLabels, 2, 'running')), [
    'done',
    'done',
    'current',
    'upcoming',
    'upcoming'
  ])
})

test('failed stages keep earlier stages done and mark the failing stage red, leaving later stages upcoming', () => {
  assert.deepEqual(states(stages.buildStageStates(uploadLabels, 1, 'failed')), [
    'done',
    'failed',
    'upcoming',
    'upcoming',
    'upcoming'
  ])
})

test('complete mode marks every stage done', () => {
  assert.deepEqual([...new Set(states(stages.buildStageStates(jobLabels, 4, 'complete')))], ['done'])
})

test('progress values are whole percentages clamped to 0-100', () => {
  assert.equal(stages.clampProgress(-4), 0)
  assert.equal(stages.clampProgress(57.6), 58)
  assert.equal(stages.clampProgress(140), 100)
  assert.equal(stages.clampProgress(Number.NaN), 0)
})

test('backend checkpoints map onto the five upload stages with their titles progress and illustrations', () => {
  const expected = {
    pending: [0, 12, 'process-upload'],
    queued: [0, 12, 'process-upload'],
    analyzing: [1, 34, 'process-analysis'],
    music_analysis: [1, 34, 'process-analysis'],
    building_story: [2, 58, 'process-moments'],
    editing: [3, 78, 'process-edit'],
    rendering: [3, 78, 'process-edit'],
    improving: [3, 78, 'process-edit'],
    reviewing: [4, 94, 'process-check']
  }
  for (const [status, [stage, progress, illustration]] of Object.entries(expected)) {
    const view = upload.uploadProcessingView(uploadLabels, { status, stage: undefined }, false)
    assert.equal(view.stage, stage, status)
    assert.equal(view.progress, progress, status)
    assert.equal(view.illustration, illustration, status)
  }
})

test('a processing project reports the server checkpoint as its stage', () => {
  const view = upload.uploadProcessingView(uploadLabels, { status: 'processing', stage: 'building_story' }, false)
  assert.equal(view.stage, 2)
  assert.deepEqual(states(view.stages), ['done', 'done', 'current', 'upcoming', 'upcoming'])
})

test('a failed upload stops at the stage the server reported before failing', () => {
  const view = upload.uploadProcessingView(uploadLabels, { status: 'failed', stage: 'editing' }, true)
  assert.equal(view.stage, 3)
  assert.equal(view.stages[3].state, 'failed')
  assert.equal(view.stages[4].state, 'upcoming')
})

test('a failed upload without a reported checkpoint shows the first stage as failed', () => {
  const view = upload.uploadProcessingView(uploadLabels, { status: 'failed' }, true)
  assert.equal(view.stage, 0)
  assert.equal(view.stages[0].state, 'failed')
})

test('job statuses map onto the YouTube stages in order', () => {
  const expected = {
    pending: 0,
    downloading: 0,
    transcribing: 1,
    analyzing: 2,
    clipping: 3,
    rendering: 3
  }
  for (const [status, stage] of Object.entries(expected)) {
    assert.equal(jobs.jobProcessingView(jobLabels, status, 10).stage, stage, status)
  }
  const complete = jobs.jobProcessingView(jobLabels, 'completed', 100)
  assert.equal(complete.mode, 'complete')
  assert.equal(complete.illustration, 'create-done')
  assert.deepEqual([...new Set(states(complete.stages))], ['done'])
})

test('failed and cancelled jobs infer the stopped stage from progress', () => {
  assert.equal(jobs.stageFromProgress(5), 0)
  assert.equal(jobs.stageFromProgress(20), 1)
  assert.equal(jobs.stageFromProgress(49), 1)
  assert.equal(jobs.stageFromProgress(50), 2)
  assert.equal(jobs.stageFromProgress(56), 3)
  const failed = jobs.jobProcessingView(jobLabels, 'failed', 36)
  assert.equal(failed.mode, 'failed')
  assert.equal(failed.stages[1].state, 'failed')
  assert.equal(failed.illustration, 'youtube-transcribe')
})

test('duration errors are recognised and their minutes are reported in whole minutes', () => {
  const message = 'video duration 11100.4s exceeds max 7200s'
  assert.equal(jobs.isDurationExceeded(message), true)
  assert.deepEqual({ ...jobs.durationLimit(message) }, { actualMinutes: 186, maxMinutes: 120 })
  assert.equal(jobs.isDurationExceeded('network timeout'), false)
  assert.equal(jobs.durationLimit(null), null)
})

test('analysis progress advances with each analyzed source and names the running clip', () => {
  const assets = (done, total) =>
    Array.from({ length: total }, (_, index) => ({ id: `a${index}`, analysis_version: index < done ? 'v' : undefined }))
  const first = upload.uploadProcessingView(uploadLabels, { status: 'analyzing', assets: assets(0, 4) }, false)
  assert.equal(first.progress, 34)
  assert.equal(first.analysis.done, 0)
  assert.equal(first.analysis.total, 4)
  const half = upload.uploadProcessingView(uploadLabels, { status: 'analyzing', assets: assets(2, 4) }, false)
  assert.equal(half.progress, 43)
  const running = upload.uploadProcessingView(uploadLabels, { status: 'analyzing', assets: assets(0, 1) }, false, 600)
  assert.ok(running.progress > 50 && running.progress < 58, String(running.progress))
  const later = upload.uploadProcessingView(uploadLabels, { status: 'building_story', assets: assets(4, 4) }, false)
  assert.equal(later.progress, 58)
  assert.equal(later.analysis, undefined)
})

test('the running source estimate stays below a whole source', () => {
  assert.equal(upload.runningSourceShare(0), 0)
  assert.ok(upload.runningSourceShare(100000) <= 0.9)
})

test('after the last source the collection review keeps moving below the next stage', () => {
  const assets = Array.from({ length: 3 }, (_, index) => ({ id: `a${index}`, analysis_version: 'v' }))
  const start = upload.uploadProcessingView(uploadLabels, { status: 'analyzing', assets }, false, 0)
  const later = upload.uploadProcessingView(uploadLabels, { status: 'analyzing', assets }, false, 300)
  assert.equal(start.progress, 52)
  assert.ok(later.progress > start.progress && later.progress < 58, String(later.progress))
  assert.equal(upload.analysisReviewing(start.analysis), true)
  assert.equal(upload.analysisReviewing({ done: 2, total: 3 }), false)
})
