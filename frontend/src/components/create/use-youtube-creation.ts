'use client'

import { useCallback, useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'

import type { AssistantAction } from '@/components/assistant/assistant-chat'
import type { CreateSettings } from '@/components/create/settings-panel'
import { useToast } from '@/components/ui/toast'
import { useRouter } from '@/i18n/navigation'
import { extractApiError } from '@/lib/api-error'
import { apiFetch } from '@/lib/auth'
import { extractYouTubeId } from '@/lib/youtube'

const CREDITS_PER_CLIP = 10

function applyAssistantSettings(
  previous: CreateSettings,
  values: Record<string, unknown>
): CreateSettings {
  const next = { ...previous }
  if (typeof values.clips === 'number' && Number.isFinite(values.clips)) {
    next.clips = Math.max(1, Math.min(15, Math.round(values.clips)))
  }
  if (
    values.aspect_ratio === '9:16' ||
    values.aspect_ratio === '1:1' ||
    values.aspect_ratio === '16:9'
  ) {
    next.aspectRatio = values.aspect_ratio
  }
  if (
    values.subtitle_style === 'clean' ||
    values.subtitle_style === 'bold' ||
    values.subtitle_style === 'caption-box' ||
    values.subtitle_style === 'none'
  ) {
    next.subtitleStyle = values.subtitle_style
  }
  if (typeof values.include_brand === 'boolean') {
    next.includeBrand = values.include_brand
  }
  if (typeof values.smart_crop === 'boolean') {
    next.smartCrop = values.smart_crop
  }
  if ('language' in values) {
    next.language = typeof values.language === 'string' ? values.language : ''
  }
  return next
}

export function useYoutubeCreation(initialBatch: boolean) {
  const router = useRouter()
  const toast = useToast()
  const t = useTranslations('create')
  const [urls, setUrls] = useState<string[]>(() =>
    initialBatch ? ['', ''] : ['']
  )
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

  const handleAssistantActions = useCallback((actions: AssistantAction[]) => {
    for (const action of actions) {
      if (
        action.type === 'update_settings' &&
        typeof action.settings === 'object' &&
        action.settings !== null
      ) {
        const values = action.settings as Record<string, unknown>
        setSettings((previous) => applyAssistantSettings(previous, values))
      } else if (
        action.type === 'set_instructions' &&
        typeof action.instructions === 'string'
      ) {
        setAiInstructions(action.instructions)
      }
    }
  }, [])

  const validUrls = useMemo(() => {
    const unique: string[] = []
    const seen = new Set<string>()
    for (const url of urls) {
      const id = extractYouTubeId(url)
      if (id && !seen.has(id)) {
        seen.add(id)
        unique.push(url.trim())
      }
    }
    return unique
  }, [urls])

  const isBatch = initialBatch || urls.length > 1
  const videoCount = isBatch ? validUrls.length : 1
  const creditCost = settings.clips * CREDITS_PER_CLIP * Math.max(videoCount, 1)
  const canGenerate = validUrls.length > 0

  const jobOptions = useMemo(
    () => ({
      num_clips_requested: settings.clips,
      aspect_ratio: settings.aspectRatio,
      subtitle_style: settings.subtitleStyle,
      include_brand: settings.includeBrand,
      burn_subtitles: settings.subtitleStyle !== 'none',
      smart_crop: settings.smartCrop,
      audio_cleanup: { enabled: settings.reduceBackgroundNoise ?? false },
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
    try {
      const source = isBatch
        ? { source_urls: validUrls }
        : { source_type: 'youtube', source_url: validUrls[0] }
      const res = await apiFetch(isBatch ? '/api/jobs/batch' : '/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...source, ...jobOptions })
      })
      const data = await res.json()
      if (!res.ok) {
        toast.add('error', extractApiError(data, t('jobFailed')))
        setBusy(false)
        return
      }
      toast.add(
        'success',
        isBatch
          ? t('batchQueued', { count: data.jobs?.length ?? validUrls.length })
          : t('jobQueued')
      )
      router.push(isBatch ? '/dashboard/clips' : `/dashboard/jobs/${data.id}`)
    } catch {
      toast.add('error', t('jobFailed'))
      setBusy(false)
    }
  }

  return {
    urls,
    setUrls,
    settings,
    setSettings,
    aiInstructions,
    setAiInstructions,
    busy,
    isBatch,
    videoCount,
    creditCost,
    canGenerate,
    createJob,
    handleAssistantActions
  }
}
