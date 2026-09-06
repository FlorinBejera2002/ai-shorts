'use client'

import { Card } from '@/components/ui/card'

import { Layers, Link2, Sparkles, Upload, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useSearchParams } from 'next/navigation'
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'

import {
  type AssistantAction,
  AssistantChat
} from '@/components/assistant/assistant-chat'
import {
  type AspectRatio,
  type CreateSettings,
  SettingsPanel,
  type SubtitleStyle
} from '@/components/create/settings-panel'
import { SourceBatch } from '@/components/create/source-batch'
import { SourceUpload } from '@/components/create/source-upload'
import { SourceYoutube } from '@/components/create/source-youtube'
import { SummaryCard } from '@/components/create/summary-card'
import { PageHeader } from '@/components/ui/page-header'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useToast } from '@/components/ui/toast'
import { useRouter } from '@/i18n/navigation'
import { extractApiError } from '@/lib/api-error'
import { extractYouTubeId } from '@/lib/youtube'

type SourceMode = 'youtube' | 'upload' | 'batch'

const SOURCE_MODES = [
  { id: 'youtube', icon: Link2 },
  { id: 'upload', icon: Upload },
  { id: 'batch', icon: Layers }
] as const

function isSourceMode(value: string | null): value is SourceMode {
  return value === 'youtube' || value === 'upload' || value === 'batch'
}

interface UploadedFile {
  name: string
  size: number
  duration: number | null
  filePath: string
}

const CREDITS_PER_CLIP = 10

export default function CreatePage() {
  const t = useTranslations('create')

  return (
    <div className="animate-fade-in">
      <PageHeader title={t('title')} description={t('desc')} />
      <Suspense fallback={<CreateWorkflowFallback />}>
        <CreateWorkflow />
      </Suspense>
    </div>
  )
}

function CreateWorkflowFallback() {
  return (
    <div
      className="mt-6 grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_23rem]"
      aria-busy="true"
    >
      <div className="skeleton h-[28rem] w-full" />
      <div className="skeleton h-[36rem] w-full" />
    </div>
  )
}

function StepHeading({ number, title }: { number: number; title: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-[11px] font-bold tabular-nums text-primary ring-1 ring-primary/15">
        {number}
      </span>
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
    </div>
  )
}

function CreateWorkflow() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const toast = useToast()
  const t = useTranslations('create')
  const tAssistant = useTranslations('assistant')

  const requestedMode = searchParams.get('mode')
  const [mode, setMode] = useState<SourceMode>(() =>
    isSourceMode(requestedMode) ? requestedMode : 'youtube'
  )
  const [uploaded, setUploaded] = useState<UploadedFile | null>(null)
  const [uploadBusy, setUploadBusy] = useState(false)
  const [youtubeUrl, setYoutubeUrl] = useState('')
  const [batchUrls, setBatchUrls] = useState<string[]>([''])
  const [busy, setBusy] = useState(false)
  const [aiInstructions, setAiInstructions] = useState('')
  const [settings, setSettings] = useState<CreateSettings>({
    clips: 5,
    aspectRatio: '9:16',
    subtitleStyle: 'clean',
    includeBrand: false,
    language: '',
    smartCrop: true
  })

  useEffect(() => {
    if (isSourceMode(requestedMode)) setMode(requestedMode)
  }, [requestedMode])

  const handleAssistantActions = useCallback((actions: AssistantAction[]) => {
    for (const action of actions) {
      if (
        action.type === 'update_settings' &&
        typeof action.settings === 'object' &&
        action.settings !== null
      ) {
        const s = action.settings as Record<string, unknown>
        setSettings((prev) => ({
          ...prev,
          ...(typeof s.clips === 'number' ? { clips: s.clips } : {}),
          ...(typeof s.aspect_ratio === 'string'
            ? { aspectRatio: s.aspect_ratio as AspectRatio }
            : {}),
          ...(typeof s.subtitle_style === 'string'
            ? { subtitleStyle: s.subtitle_style as SubtitleStyle }
            : {}),
          ...(typeof s.include_brand === 'boolean'
            ? { includeBrand: s.include_brand }
            : {}),
          ...(typeof s.smart_crop === 'boolean'
            ? { smartCrop: s.smart_crop }
            : {}),
          ...('language' in s
            ? { language: typeof s.language === 'string' ? s.language : '' }
            : {})
        }))
      } else if (
        action.type === 'set_instructions' &&
        typeof action.instructions === 'string'
      ) {
        setAiInstructions(action.instructions)
      }
    }
  }, [])

  const validBatchUrls = useMemo(() => {
    const unique: string[] = []
    const seen = new Set<string>()
    for (const url of batchUrls) {
      const id = extractYouTubeId(url)
      if (id && !seen.has(id)) {
        seen.add(id)
        unique.push(url.trim())
      }
    }
    return unique
  }, [batchUrls])

  const videoCount = mode === 'batch' ? validBatchUrls.length : 1
  const creditCost = settings.clips * CREDITS_PER_CLIP * Math.max(videoCount, 1)

  const canGenerate =
    mode === 'youtube'
      ? Boolean(extractYouTubeId(youtubeUrl))
      : mode === 'upload'
        ? Boolean(uploaded) && !uploadBusy
        : validBatchUrls.length > 0

  const jobOptions = useMemo(
    () => ({
      num_clips_requested: settings.clips,
      aspect_ratio: settings.aspectRatio,
      subtitle_style: settings.subtitleStyle,
      include_brand: settings.includeBrand,
      burn_subtitles: settings.subtitleStyle !== 'none',
      smart_crop: settings.smartCrop,
      ...(settings.language ? { language: settings.language } : {}),
      ...(aiInstructions.trim()
        ? { user_instructions: aiInstructions.trim() }
        : {})
    }),
    [settings, aiInstructions]
  )

  async function createJob() {
    if (busy || !canGenerate) return
    setBusy(true)

    if (mode === 'batch') {
      try {
        const res = await fetch('/api/jobs/batch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ source_urls: validBatchUrls, ...jobOptions })
        })
        const data = await res.json()
        if (!res.ok) {
          toast.add('error', extractApiError(data, t('jobFailed')))
          setBusy(false)
          return
        }
        toast.add(
          'success',
          t('batchQueued', {
            count: data.jobs?.length ?? validBatchUrls.length
          })
        )
        router.push('/dashboard/history')
      } catch {
        toast.add('error', t('jobFailed'))
        setBusy(false)
      }
      return
    }

    const payload =
      mode === 'youtube'
        ? { source_type: 'youtube', source_url: youtubeUrl.trim() }
        : { source_type: 'upload', source_file_path: uploaded?.filePath }

    try {
      const res = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, ...jobOptions })
      })
      const data = await res.json()
      if (!res.ok) {
        toast.add('error', extractApiError(data, t('jobFailed')))
        setBusy(false)
        return
      }
      toast.add('success', t('jobQueued'))
      router.push(`/dashboard/jobs/${data.id}`)
    } catch {
      toast.add('error', t('jobFailed'))
      setBusy(false)
    }
  }

  return (
    <div className="mt-6 grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_23rem] xl:grid-rows-[auto_1fr]">
      <Card
        as="section"
        className="block gap-0 py-0 animate-slide-up overflow-hidden xl:col-start-1 xl:row-start-1"
      >
        <div className="border-b border-border bg-muted/35 px-4 py-4 sm:px-5">
          <StepHeading number={1} title={t('stepSource')} />
        </div>
        <Tabs
          value={mode}
          onValueChange={(value) => {
            if (isSourceMode(value)) setMode(value)
          }}
          className="p-4 sm:p-6"
        >
          <TabsList
            aria-label={t('stepSource')}
            className="grid w-full grid-cols-3"
          >
            {SOURCE_MODES.map(({ id, icon: Icon }) => (
              <TabsTrigger
                key={id}
                value={id}
                className="min-h-11 px-2 text-xs sm:text-sm"
              >
                <Icon className="h-4 w-4" strokeWidth={1.75} />
                <span>{t(id)}</span>
              </TabsTrigger>
            ))}
          </TabsList>
          <TabsContent value="upload">
            <SourceUpload
              onBusyChange={setUploadBusy}
              uploaded={uploaded}
              onUploaded={(file) => {
                setUploaded(file)
                if (file) toast.add('success', t('videoUploaded'))
              }}
              onError={(message) => toast.add('error', message)}
            />
          </TabsContent>
          <TabsContent value="batch">
            <SourceBatch urls={batchUrls} onChange={setBatchUrls} />
          </TabsContent>
          <TabsContent value="youtube">
            <SourceYoutube url={youtubeUrl} onChange={setYoutubeUrl} />
          </TabsContent>
        </Tabs>
      </Card>

      <aside
        className="animate-slide-up space-y-5 xl:sticky xl:top-6 xl:col-start-2 xl:row-span-2 xl:row-start-1"
        style={{ animationDelay: '100ms' }}
      >
        <section className="space-y-3">
          <StepHeading number={2} title={t('stepStyle')} />
          <SettingsPanel settings={settings} onChange={setSettings} />
        </section>

        {/* AI brief captured by the assistant, sent with the job */}
        {aiInstructions.trim() && (
          <Card className="block gap-0 py-0 animate-scale-in border-primary/25 bg-primary/5 p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <Sparkles
                  className="h-3.5 w-3.5 text-primary"
                  strokeWidth={1.75}
                />
                <h3 className="section-label text-primary">
                  {tAssistant('briefTitle')}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setAiInstructions('')}
                title={tAssistant('briefRemove')}
                className="rounded p-0.5 text-muted-foreground transition-colors hover:text-destructive"
              >
                <X className="h-3.5 w-3.5" strokeWidth={1.75} />
              </button>
            </div>
            <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-foreground/90">
              {aiInstructions}
            </p>
          </Card>
        )}

        <section className="space-y-3">
          <StepHeading number={3} title={t('stepGenerate')} />
          <SummaryCard
            settings={settings}
            videoCount={videoCount}
            creditCost={creditCost}
            canGenerate={canGenerate}
            busy={busy}
            isBatch={mode === 'batch'}
            onGenerate={() => void createJob()}
          />
        </section>
      </aside>

      <section
        className="animate-slide-up xl:col-start-1 xl:row-start-2"
        style={{ animationDelay: '150ms' }}
      >
        <AssistantChat
          context="create"
          getState={() => ({
            clips: settings.clips,
            aspect_ratio: settings.aspectRatio,
            subtitle_style: settings.subtitleStyle,
            include_brand: settings.includeBrand,
            language: settings.language || null,
            smart_crop: settings.smartCrop,
            instructions: aiInstructions.trim() || null
          })}
          onActions={handleAssistantActions}
          suggestions={[
            tAssistant('suggestCreate1'),
            tAssistant('suggestCreate2'),
            tAssistant('suggestCreate3')
          ]}
        />
      </section>
    </div>
  )
}
