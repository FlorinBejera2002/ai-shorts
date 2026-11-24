import assert from 'node:assert/strict'
import test from 'node:test'
import * as React from 'react'
import * as jsxRuntime from 'react/jsx-runtime'
import { renderToStaticMarkup } from 'react-dom/server'
import * as lucide from 'lucide-react'
import { loadTsModule } from './support/load-ts-module.mjs'

const { createElement: h } = React
const english = () => (en) => en
const Button = ({ asChild: _asChild, children, ...props }) => h('button', props, children)
const Link = ({ href, children }) => h('a', { href }, children)
const cssModule = { __esModule: true, default: new Proxy({}, { get: (_, key) => String(key) }) }

const stages = loadTsModule('src/components/create/processing-stages.ts')
const processingCard = loadTsModule('src/components/create/processing-card.tsx', {
  'react/jsx-runtime': jsxRuntime,
  'lucide-react': lucide,
  './processing-stages': stages,
  './processing-card.module.css': cssModule
})
const storyErrors = loadTsModule('src/components/story/story-error.ts')
const uploadModel = loadTsModule('src/components/story/story-processing-model.ts', {
  '@/components/create/processing-stages': stages
})
const storyProcessingCopy = loadTsModule('src/components/story/story-processing-copy.ts', {
  './story-processing-model': uploadModel
})
const storyProcessingStates = loadTsModule('src/components/story/story-processing-states.tsx', {
  'react/jsx-runtime': jsxRuntime,
  '@/components/create/processing-card': processingCard,
  '@/components/ui/button': { Button },
  './story-error': storyErrors,
  './story-processing-model': uploadModel,
  './story-processing-copy': storyProcessingCopy
})
const storyProcessing = loadTsModule('src/components/story/story-processing.tsx', {
  'react/jsx-runtime': jsxRuntime,
  './use-story-language': { useStoryLanguage: english },
  './story-error': storyErrors,
  './story-processing-model': uploadModel,
  './story-processing-states': storyProcessingStates,
  './story-processing-copy': storyProcessingCopy,
  './types': {}
})
const jobModel = loadTsModule('src/components/jobs/job-processing-model.ts', {
  '@/components/create/processing-stages': stages
})
const jobCopy = loadTsModule('src/components/jobs/job-processing-copy.ts')
let clipFixture = []
const jobClipsGrid = loadTsModule('src/components/jobs/job-clips-grid.tsx', {
  'react/jsx-runtime': jsxRuntime,
  './job-clips-grid.module.css': cssModule
})
const jobClipsHook = { useJobClips: () => clipFixture }
const jobComplete = loadTsModule('src/components/jobs/job-complete-card.tsx', {
  'react/jsx-runtime': jsxRuntime,
  'lucide-react': lucide,
  '@/components/create/processing-card': processingCard,
  '@/components/create/create-text': { useCreateText: english },
  '@/components/ui/button': { Button },
  '@/i18n/navigation': { Link },
  './job-clips-grid': jobClipsGrid,
  './use-job-clips': jobClipsHook,
  './job-complete-card.module.css': cssModule
})
const jobStates = loadTsModule('src/components/jobs/job-processing-states.tsx', {
  react: React,
  'react/jsx-runtime': jsxRuntime,
  'lucide-react': lucide,
  '@/components/create/processing-card': processingCard,
  '@/components/create/create-text': { useCreateText: english },
  '@/components/ui/button': { Button },
  '@/i18n/navigation': { Link },
  './job-processing-model': jobModel,
  './job-processing-copy': jobCopy
})
const jobPanel = loadTsModule('src/components/jobs/job-processing-panel.tsx', {
  'react/jsx-runtime': jsxRuntime,
  '@/components/create/create-text': { useCreateText: english },
  './job-processing-model': jobModel,
  './job-processing-states': jobStates,
  './job-complete-card': jobComplete,
  './job-processing-copy': jobCopy
})
const types = loadTsModule('src/components/story/types.ts')
const outputs = loadTsModule('src/components/story/story-result-outputs.ts', { './types': types })
const resultHeader = loadTsModule('src/components/story/story-result-header.tsx', {
  'react/jsx-runtime': jsxRuntime,
  'lucide-react': lucide,
  '@/components/ui/button': { Button },
  './use-story-language': { useStoryLanguage: english }
})
const resultStrip = loadTsModule('src/components/story/story-result-strip.tsx', {
  'react/jsx-runtime': jsxRuntime,
  '@/lib/youtube': { formatDuration: (seconds) => `${seconds}s` },
  './story-result-outputs': outputs,
  './use-story-language': { useStoryLanguage: english }
})
const storyResult = loadTsModule('src/components/story/story-result.tsx', {
  react: React,
  'react/jsx-runtime': jsxRuntime,
  '@/i18n/navigation': { Link },
  '@/components/ui/button': { Button },
  '@/components/studio/open-studio-button': {
    OpenStudioButton: ({ clipId }) => h('button', { 'data-clip-id': clipId }, 'Studio')
  },
  '@/lib/youtube': { formatDuration: (seconds) => `${seconds}s` },
  './types': types,
  './story-result-header': resultHeader,
  './story-result-strip': resultStrip,
  './story-result-player': { StoryResultPlayer: ({ src }) => h('video', { src }) },
  './story-review': { StoryReview: () => null },
  './story-music-credits': { StoryMusicCredits: () => null },
  './story-caption-status': { StoryCaptionStatus: () => null },
  './story-result-outputs': outputs,
  './use-story-language': { useStoryLanguage: english }
})

const render = (element) => renderToStaticMarkup(element)

const baseProject = {
  id: 'p',
  options: types.defaultOptions,
  assets: [],
  versions: [],
  current_version: 0,
  limits: types.defaultLimits
}

test('upload processing shows the stage title, the animated card and one cancel action', () => {
  const markup = render(
    h(storyProcessing.StoryProcessing, {
      project: { ...baseProject, status: 'processing', stage: 'building_story' },
      active: true,
      busy: false,
      onCancel() {}
    })
  )
  assert.match(markup, /Choosing moments/)
  assert.match(markup, /data-animated="true"/)
  assert.match(markup, /Cancel processing/)
  assert.match(markup, /aria-valuenow="58"/)
  assert.match(markup, /data-state="current"/)
  assert.match(markup, /\/illustrations\/process-moments\.webp/)
  assert.equal((markup.match(/<button/g) ?? []).length, 1)
})

test('a failed upload shows the still variant, the failing stage in red and a retry action', () => {
  const markup = render(
    h(storyProcessing.StoryProcessing, {
      project: {
        ...baseProject,
        status: 'failed',
        stage: 'editing',
        error: 'source analysis could not establish visual content'
      },
      active: false,
      busy: false,
      onCancel() {},
      onRetry() {}
    })
  )
  assert.match(markup, /role="alert"/)
  assert.match(markup, /Processing failed/)
  assert.match(markup, /data-state="failed"/)
  assert.doesNotMatch(markup, /data-animated/)
  assert.match(markup, /Try again/)
  assert.doesNotMatch(markup, /Cancel processing/)
  assert.match(markup, /create-failed\.webp/)
})

test('job processing maps running, completed and failed states onto the card', () => {
  const source = { title: 'Interviu cu Mara, episodul 13', meta: 'Auto · 9:16 · Bold' }
  const panel = (status, extra = {}) =>
    render(
      h(jobPanel.JobProcessingPanel, {
        jobId: 'job-1',
        status,
        progress: 36,
        errorMessage: null,
        source,
        connected: true,
        busy: false,
        onCancel() {},
        onRetry() {},
        ...extra
      })
    )

  const running = panel('transcribing')
  assert.match(running, /Transcribing speech/)
  assert.match(running, /Cancel processing/)
  assert.match(running, /youtube-transcribe\.webp/)
  assert.match(running, /Interviu cu Mara, episodul 13/)
  assert.match(running, /Auto · 9:16 · Bold/)

  clipFixture = []
  const done = panel('completed', { progress: 100 })
  assert.match(done, /All clips are ready!/)
  assert.match(done, /href="\/dashboard\/clips"/)
  assert.match(done, /Interviu cu Mara, episodul 13/)
  assert.doesNotMatch(done, /Cancel processing/)
  assert.doesNotMatch(done, /data-testid="job-clips"/)

  clipFixture = [
    { id: 'c1', title: 'Primul clip', duration: 38, aspectRatio: '9:16', thumbnailUrl: null, hasSubtitles: true },
    { id: 'c2', title: 'Al doilea', duration: 64, aspectRatio: '9:16', thumbnailUrl: null, hasSubtitles: false }
  ]
  const withClips = panel('completed', { progress: 100 })
  clipFixture = []
  assert.match(withClips, /data-testid="job-clips"/)
  assert.match(withClips, /2 clips ready/)
  assert.match(withClips, /0:38/)
  assert.match(withClips, />CC</)

  const failed = panel('failed', { progress: 36, errorMessage: 'ffmpeg exited 1' })
  assert.match(failed, /Processing failed/)
  assert.match(failed, /Try again/)
  assert.match(failed, /Technical details/)
})

test('a too-long video explains the limit and links to choose another video', () => {
  const markup = render(
    h(jobPanel.JobProcessingPanel, {
      status: 'failed',
      progress: 0,
      errorMessage: 'video duration 11100.4s exceeds max 7200s',
      connected: true,
      busy: false,
      onCancel() {},
      onRetry() {}
    })
  )
  assert.match(markup, /The video is too long/)
  assert.match(markup, /186 min · maximum 120 min/)
  assert.match(markup, /href="\/dashboard\/create\?mode=youtube"/)
  assert.match(markup, /youtube-too-long\.webp/)
  assert.doesNotMatch(markup, /data-animated/)
})

const version = (extra = {}) => ({
  number: 1,
  parent: 0,
  accepted: true,
  plan: { title: '', summary: '', blocks: [] },
  timeline: [],
  report: {
    status: 'ready',
    coverage: {
      plan: true,
      file: true,
      audio: true,
      visual: true,
      captions: true,
      semantics: true,
      boundaries: true
    }
  },
  ...extra
})
const resultProject = { options: { ...types.defaultOptions, aspect_ratio: '9:16' } }

test('a single result is titled as ready with its stats and a download action', () => {
  const markup = render(
    h(storyResult.StoryResult, {
      project: resultProject,
      version: version({ preview_url: '/p.mp4', clip_id: 'clip-1' })
    })
  )
  assert.match(markup, /Your clip is ready/)
  assert.match(markup, /data-clip-id="clip-1"/)
  assert.match(markup, /href="\/p\.mp4"/)
  assert.match(markup, /Version/)
  assert.doesNotMatch(markup, /story-result-strip"/)
})

test('a multi-clip result lists every clip, counts them and downloads the selected clip', () => {
  const markup = render(
    h(storyResult.StoryResult, {
      project: resultProject,
      version: version({
        outputs: [
          {
            id: 'o1',
            index: 1,
            video_url: '/2.mp4',
            poster_url: null,
            duration_seconds: 40,
            aspect_ratio: '9:16',
            clip_id: null
          },
          {
            id: 'o0',
            index: 0,
            video_url: '/1.mp4',
            poster_url: null,
            duration_seconds: 45,
            aspect_ratio: '9:16',
            clip_id: 'c1'
          }
        ]
      })
    })
  )
  assert.match(markup, /Your clips are ready/)
  assert.match(markup, /Clip 1/)
  assert.match(markup, /Clip 2/)
  assert.match(markup, /aria-pressed="true"/)
  assert.match(markup, /href="\/1\.mp4"/)
  assert.match(markup, /Clips/)
  assert.match(markup, /data-clip-id="c1"/)
  assert.match(markup, /href="\/dashboard\/clips"/)
})

test('a result without any playable clip explains that the preview is unavailable', () => {
  const markup = render(h(storyResult.StoryResult, { project: resultProject, version: version() }))
  assert.match(markup, /A browser preview is not available for this result/)
  assert.match(markup, /href="\/dashboard\/clips"/)
})
