'use client'

import { useCallback, useMemo, useState } from 'react'
import { useRouter } from '@/i18n/navigation'
import { Upload, Link2, Loader2, Linkedin, Smartphone, Youtube, Plus, X, Layers } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useToast } from '@/components/ui/toast'

const platformPresets = [
  {
    id: 'tiktok',
    label: 'TikTok',
    icon: Smartphone,
    clips: 8,
    aspectRatio: '9:16',
    subtitleStyle: 'bold',
  },
  {
    id: 'reels',
    label: 'Reels',
    icon: Smartphone,
    clips: 6,
    aspectRatio: '9:16',
    subtitleStyle: 'caption-box',
  },
  {
    id: 'shorts',
    label: 'Shorts',
    icon: Youtube,
    clips: 5,
    aspectRatio: '9:16',
    subtitleStyle: 'clean',
  },
  {
    id: 'linkedin',
    label: 'LinkedIn',
    icon: Linkedin,
    clips: 3,
    aspectRatio: '1:1',
    subtitleStyle: 'clean',
  },
] as const

export default function CreatePage() {
  const router = useRouter()
  const toast = useToast()
  const t = useTranslations('create')
  const [mode, setMode] = useState<'upload' | 'youtube' | 'batch'>('youtube')
  const [filePath, setFilePath] = useState('')
  const [youtubeUrl, setYoutubeUrl] = useState('')
  const [batchUrls, setBatchUrls] = useState<string[]>([''])
  const [clips, setClips] = useState(5)
  const [aspectRatio, setAspectRatio] = useState('9:16')
  const [subtitleStyle, setSubtitleStyle] = useState('clean')
  const [includeBrand, setIncludeBrand] = useState(false)
  const [platform, setPlatform] = useState('shorts')
  const [busy, setBusy] = useState(false)

  const extractError = useCallback((data: Record<string, unknown>, fallback: string): string => {
    if (typeof data.error === 'string') return data.error
    if (typeof data.detail === 'string') return data.detail
    if (Array.isArray(data.detail) && data.detail.length > 0) {
      return data.detail.map((e: { msg?: string }) => e.msg ?? '').filter(Boolean).join('; ') || fallback
    }
    return fallback
  }, [])

  const creditCost = useMemo(() => {
    const count = mode === 'batch' ? batchUrls.filter(u => u.trim()).length : 1
    return clips * 10 * count
  }, [clips, mode, batchUrls])

  async function uploadFile(file: File) {
    setBusy(true)
    const formData = new FormData()
    formData.set('file', file)
    try {
      const res = await fetch('/api/upload', { method: 'POST', body: formData })
      const data = await res.json()
      if (!res.ok) {
        toast.add('error', extractError(data, t('uploadFailed')))
        return
      }
      setFilePath(data.file_path)
      toast.add('success', t('videoUploaded'))
    } catch {
      toast.add('error', t('uploadFailed'))
    } finally {
      setBusy(false)
    }
  }

  async function createJob() {
    setBusy(true)

    if (mode === 'batch') {
      const urls = batchUrls.map(u => u.trim()).filter(Boolean)
      if (urls.length === 0) {
        toast.add('error', t('addOneUrl'))
        setBusy(false)
        return
      }
      try {
        const res = await fetch('/api/jobs/batch', {
          method: 'POST',
          body: JSON.stringify({
            source_urls: urls,
            num_clips_requested: clips,
            aspect_ratio: aspectRatio,
            subtitle_style: subtitleStyle,
            include_brand: includeBrand,
            burn_subtitles: subtitleStyle !== 'none',
            smart_crop: aspectRatio === '9:16',
          }),
        })
        const data = await res.json()
        if (!res.ok) {
          toast.add('error', extractError(data, t('addOneUrl')))
          setBusy(false)
          return
        }
        toast.add('success', t('batchQueued', { count: data.jobs?.length ?? urls.length }))
        router.push('/dashboard/history')
      } catch {
        toast.add('error', t('addOneUrl'))
        setBusy(false)
      }
      return
    }

    const payload =
      mode === 'youtube'
        ? { source_type: 'youtube', source_url: youtubeUrl }
        : { source_type: 'upload', source_file_path: filePath }

    try {
      const res = await fetch('/api/jobs', {
        method: 'POST',
        body: JSON.stringify({
          ...payload,
          num_clips_requested: clips,
          aspect_ratio: aspectRatio,
          subtitle_style: subtitleStyle,
          include_brand: includeBrand,
          burn_subtitles: subtitleStyle !== 'none',
          smart_crop: aspectRatio === '9:16',
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.add('error', extractError(data, t('addOneUrl')))
        setBusy(false)
        return
      }
      toast.add('success', t('jobQueued'))
      router.push(`/dashboard/jobs/${data.id}`)
    } catch {
      toast.add('error', t('addOneUrl'))
      setBusy(false)
    }
  }

  const canGenerate =
    mode === 'youtube'
      ? youtubeUrl
      : mode === 'upload'
        ? filePath
        : batchUrls.some(u => u.trim())

  function applyPreset(preset: (typeof platformPresets)[number]) {
    setPlatform(preset.id)
    setClips(preset.clips)
    setAspectRatio(preset.aspectRatio)
    setSubtitleStyle(preset.subtitleStyle)
  }

  function addBatchUrl() {
    if (batchUrls.length < 20) {
      setBatchUrls([...batchUrls, ''])
    }
  }

  function removeBatchUrl(index: number) {
    setBatchUrls(batchUrls.filter((_, i) => i !== index))
  }

  function updateBatchUrl(index: number, value: string) {
    const updated = [...batchUrls]
    updated[index] = value
    setBatchUrls(updated)
  }

  return (
    <div className="animate-fade-in">
      <h1 className="text-lg font-semibold tracking-tight">{t('title')}</h1>
      <p className="mt-0.5 text-xs text-muted-foreground">
        {t('desc')}
      </p>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-4">
          <div className="flex rounded-lg bg-muted p-1 animate-slide-up">
            {(['youtube', 'upload', 'batch'] as const).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setMode(item)}
                className={`flex items-center justify-center gap-1.5 flex-1 rounded-md px-3 py-1.5 text-[13px] font-medium transition-all duration-200 ${
                  mode === item
                    ? 'bg-card text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {item === 'youtube' ? (
                  <Link2 className="w-3.5 h-3.5" />
                ) : item === 'upload' ? (
                  <Upload className="w-3.5 h-3.5" />
                ) : (
                  <Layers className="w-3.5 h-3.5" />
                )}
                {t(item)}
              </button>
            ))}
          </div>

          {mode === 'upload' ? (
            <label className="flex min-h-56 cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card/50 p-6 text-center transition-colors hover:border-primary/50 hover:bg-primary/5 animate-scale-in">
              <input
                type="file"
                accept="video/mp4,video/quicktime,video/x-msvideo,video/x-matroska,video/webm"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) void uploadFile(file)
                }}
              />
              <Upload className="w-8 h-8 text-muted-foreground mb-3" strokeWidth={1.5} />
              <span className="text-[13px] font-medium">
                {t('dropOrChoose')}
              </span>
              <span className="mt-1 text-xs text-muted-foreground">
                {t('fileTypes')}
              </span>
              {filePath && (
                <span className="mt-3 rounded-md bg-primary/10 px-2.5 py-1 text-xs text-primary font-medium">
                  {filePath}
                </span>
              )}
            </label>
          ) : mode === 'batch' ? (
            <div className="animate-scale-in space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-muted-foreground">
                  {t('batchUrls', { count: batchUrls.filter(u => u.trim()).length })}
                </label>
                <button
                  type="button"
                  onClick={addBatchUrl}
                  disabled={batchUrls.length >= 20}
                  className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline disabled:opacity-40"
                >
                  <Plus className="w-3 h-3" />
                  {t('addUrl')}
                </button>
              </div>
              <div className="space-y-1.5 max-h-80 overflow-y-auto pr-1">
                {batchUrls.map((url, index) => (
                  <div key={index} className="flex gap-1.5">
                    <input
                      value={url}
                      onChange={(e) => updateBatchUrl(index, e.target.value)}
                      placeholder={`https://youtube.com/watch?v=... (${index + 1})`}
                      className="flex-1 rounded-lg border border-input bg-card px-3 py-2 text-[13px] placeholder:text-muted-foreground/50 focus:border-primary focus:ring-1 focus:ring-primary/20 transition-all"
                    />
                    {batchUrls.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeBatchUrl(index)}
                        className="shrink-0 rounded-lg border border-border p-2 text-muted-foreground hover:text-destructive hover:border-destructive/30 transition-colors"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="animate-scale-in">
              <label
                className="text-xs font-medium text-muted-foreground"
                htmlFor="youtube-url"
              >
                {t('youtubeUrl')}
              </label>
              <input
                id="youtube-url"
                value={youtubeUrl}
                onChange={(e) => setYoutubeUrl(e.target.value)}
                placeholder={t('youtubeUrlPlaceholder')}
                className="mt-1.5 w-full rounded-lg border border-input bg-card px-3 py-2 text-[13px] placeholder:text-muted-foreground/50 focus:border-primary focus:ring-1 focus:ring-primary/20 transition-all"
              />
            </div>
          )}
        </div>

        <div className="space-y-4 animate-slide-up" style={{ animationDelay: '100ms' }}>
          <div className="rounded-xl bg-card border border-border p-4 space-y-4">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t('settings')}
            </h2>

            <div>
              <span className="text-[13px] font-medium">{t('platformPreset')}</span>
              <div className="mt-2 grid grid-cols-2 gap-1.5">
                {platformPresets.map((preset) => {
                  const Icon = preset.icon
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => applyPreset(preset)}
                      className={`flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-all ${
                        platform === preset.id
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      {preset.label}
                    </button>
                  )
                })}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between text-[13px]">
                <span className="font-medium">{t('clipsPerVideo')}</span>
                <span className="tabular-nums text-muted-foreground">{clips}</span>
              </div>
              <input
                type="range"
                min={1}
                max={15}
                value={clips}
                onChange={(e) => setClips(Number(e.target.value))}
                className="mt-2 w-full"
              />
            </div>

            <div>
              <span className="text-[13px] font-medium">{t('aspectRatio')}</span>
              <div className="mt-2 grid grid-cols-3 gap-1.5">
                {['9:16', '1:1', '16:9'].map((ratio) => (
                  <button
                    key={ratio}
                    type="button"
                    onClick={() => setAspectRatio(ratio)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                      aspectRatio === ratio
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {ratio}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label
                className="text-[13px] font-medium"
                htmlFor="subtitle-style"
              >
                {t('subtitles')}
              </label>
              <select
                id="subtitle-style"
                value={subtitleStyle}
                onChange={(e) => setSubtitleStyle(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-input bg-card px-3 py-2 text-[13px]"
              >
                <option value="clean">{t('subtitleClean')}</option>
                <option value="bold">{t('subtitleBold')}</option>
                <option value="caption-box">{t('subtitleCaptionBox')}</option>
                <option value="none">{t('subtitleNone')}</option>
              </select>
            </div>

            <label className="flex items-center justify-between text-[13px] font-medium">
              {t('brandKit')}
              <input
                type="checkbox"
                checked={includeBrand}
                onChange={(e) => setIncludeBrand(e.target.checked)}
              />
            </label>
          </div>

          <div className="flex items-center justify-between rounded-xl bg-muted/80 px-4 py-3">
            <span className="text-xs text-muted-foreground">
              {mode === 'batch' ? t('costBatch', { count: batchUrls.filter(u => u.trim()).length }) : t('cost')}
            </span>
            <span className="text-[15px] font-semibold tabular-nums">
              {creditCost}{' '}
              <span className="text-xs font-normal text-muted-foreground">
                {t('creditsUnit')}
              </span>
            </span>
          </div>

          <button
            type="button"
            disabled={!canGenerate || busy}
            onClick={() => void createJob()}
            className="w-full rounded-lg bg-primary px-4 py-2.5 text-[13px] font-semibold text-primary-foreground transition-all hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40 flex items-center justify-center gap-2"
          >
            {busy ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                {t('processing')}
              </>
            ) : mode === 'batch' ? (
              t('processVideos', { count: batchUrls.filter(u => u.trim()).length })
            ) : (
              t('generateClips', { count: clips })
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
