'use client'

import { Layers, Link2, Sparkles, Upload, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useCallback, useMemo, useState } from 'react'

import {
  type AssistantAction,
  AssistantChat
} from '@/components/assistant/assistant-chat'
import { SourceBatch } from '@/components/create/source-batch'
import { SourceUpload } from '@/components/create/source-upload'
import { SourceYoutube } from '@/components/create/source-youtube'
import {
  type AspectRatio,
  type CreateSettings,
  SettingsPanel,
  type SubtitleStyle
} from '@/components/create/settings-panel'
import { SummaryCard } from '@/components/create/summary-card'
import { PageHeader } from '@/components/ui/page-header'
import { useToast } from '@/components/ui/toast'
import { useRouter } from '@/i18n/navigation'
import { extractApiError } from '@/lib/api-error'
import { extractYouTubeId } from '@/lib/youtube'

type SourceMode = 'youtube' | 'upload' | 'batch'

interface UploadedFile {
  name: string
  size: number
  duration: number | null
  filePath: string
}

const CREDITS_PER_CLIP = 10

export default function CreatePage() {
  const router = useRouter()
  const toast = useToast()
  const t = useTranslations('create')
  const tAssistant = useTranslations('assistant')

  const [mode, setMode] = useState<SourceMode>('youtube')
  const [uploaded, setUploaded] = useState<UploadedFile | null>(null)
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

  const handleAssistantActions = useCallback(
    (actions: AssistantAction[]) => {
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
    },
    []
  )

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
        ? Boolean(uploaded)
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
          t('batchQueued', { count: data.jobs?.length ?? validBatchUrls.length })
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
    <div className="animate-fade-in">
      <PageHeader title={t('title')} description={t('desc')} />

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_320px]">
        {/* Main content */}
        <div className="space-y-6">
          {/* Source selection */}
          <div className="animate-slide-up rounded-xl border border-border bg-card p-6">
            <div className="mb-4 flex items-center gap-2">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-[11px] font-bold text-primary">
                1
              </span>
              <h2 className="text-sm font-semibold text-foreground">
                {t('stepSource')}
              </h2>
            </div>
            <div className="flex gap-3">
              {(
                [
                  ['youtube', Link2],
                  ['upload', Upload],
                  ['batch', Layers]
                ] as const
              ).map(([item, Icon]) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setMode(item)}
                  className={`flex flex-1 items-center justify-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition-all duration-200 ${
                    mode === item
                      ? 'border-primary bg-primary text-primary-foreground shadow-sm shadow-primary/20'
                      : 'border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground'
                  }`}
                >
                  <Icon className="h-4 w-4" strokeWidth={1.75} />
                  <span className="hidden sm:inline">{t(item)}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Input area */}
          {mode === 'upload' ? (
            <SourceUpload
              uploaded={uploaded}
              onUploaded={(file) => {
                setUploaded(file)
                if (file) toast.add('success', t('videoUploaded'))
              }}
              onError={(message) => toast.add('error', message)}
            />
          ) : mode === 'batch' ? (
            <SourceBatch urls={batchUrls} onChange={setBatchUrls} />
          ) : (
            <SourceYoutube url={youtubeUrl} onChange={setYoutubeUrl} />
          )}

          {/* AI assistant */}
          <div
            className="animate-slide-up"
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
          </div>
        </div>

        {/* Settings sidebar */}
        <div
          className="animate-slide-up space-y-4"
          style={{ animationDelay: '100ms' }}
        >
          <div className="flex items-center gap-2">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-[11px] font-bold text-primary">
              2
            </span>
            <h2 className="text-sm font-semibold text-foreground">
              {t('stepStyle')}
            </h2>
          </div>
          <SettingsPanel settings={settings} onChange={setSettings} />

          {/* AI brief captured by the assistant, sent with the job */}
          {aiInstructions.trim() && (
            <div className="animate-scale-in rounded-xl border border-primary/30 bg-primary/5 p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <Sparkles
                    className="h-3.5 w-3.5 text-primary"
                    strokeWidth={1.75}
                  />
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-primary">
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
            </div>
          )}

          <div className="flex items-center gap-2 pt-2">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-[11px] font-bold text-primary">
              3
            </span>
            <h2 className="text-sm font-semibold text-foreground">
              {t('stepGenerate')}
            </h2>
          </div>
          <SummaryCard
            settings={settings}
            videoCount={videoCount}
            creditCost={creditCost}
            canGenerate={canGenerate}
            busy={busy}
            isBatch={mode === 'batch'}
            onGenerate={() => void createJob()}
          />
        </div>
      </div>
    </div>
  )
}
