'use client'

import '@/components/clips/media-workbench.css'

import { ClipWorkspace } from '@/components/clip/clip-workspace'
import { ApiState } from '@/components/shared/api-state'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/ui/page-header'
import { useApiResource } from '@/hooks/use-api-resource'
import { Link } from '@/i18n/navigation'
import { type ApiClip, normalizeClip } from '@/types/api'
import { ArrowLeft, Play } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useParams } from 'next/navigation'

export default function ClipDetailPage() {
  const locale = useLocale()
  const { id } = useParams<{ id: string }>()
  const common = useTranslations('common')
  const { data, error, reload } = useApiResource<ApiClip>(`/api/clips/${id}`)
  if (!data) return <ApiState error={error} retry={reload} />
  const clip = normalizeClip(data)
  const fileUrl = clip.fileUrl
  const [aspectWidth = 0, aspectHeight = 0] = clip.aspectRatio
    .split(':')
    .map(Number)
  const hasValidAspect =
    Number.isFinite(aspectWidth) &&
    Number.isFinite(aspectHeight) &&
    aspectWidth > 0 &&
    aspectHeight > 0
  const previewAspectRatio = hasValidAspect
    ? `${aspectWidth} / ${aspectHeight}`
    : '9 / 16'
  const previewOrientation =
    hasValidAspect && aspectWidth > aspectHeight ? 'landscape' : 'portrait'

  return (
    <div className="clip-editor-page dashboard-workspace">
      <PageHeader
        title={clip.title}
        description={`${Math.round(clip.duration)}s · ${clip.aspectRatio} · ${clip.resolution}`}
        actions={
          <Button
            asChild={true}
            variant="default"
            className="clips-create-action clip-back-action"
          >
            <Link href="/dashboard/clips">
              <ArrowLeft className="size-4" />
              {locale === 'ro' ? 'Clipuri' : 'Clips'}
            </Link>
          </Button>
        }
      />

      <div className="clip-editor-grid">
        <ClipWorkspace
          clip={{
            id: clip.id,
            title: clip.title,
            hookText: clip.hookText,
            viralScore: clip.viralScore,
            scoreReason: clip.scoreReason,
            duration: clip.duration,
            resolution: clip.resolution,
            aspectRatio: clip.aspectRatio,
            hasSubtitles: clip.hasSubtitles,
            transcriptText: clip.transcriptText,
            fileUrl,
            createdAt: clip.createdAt,
            captionTiktok: clip.captionTiktok,
            captionInstagram: clip.captionInstagram,
            captionYoutube: clip.captionYoutube,
            suggestedHashtags: clip.suggestedHashtags,
            variants: clip.variants
          }}
        />

        <section
          className="clip-preview-stage"
          data-orientation={previewOrientation}
        >
          <div className="clip-preview-label">
            <span>
              <Play className="size-3" fill="currentColor" />
              {locale === 'ro' ? 'Previzualizare' : 'Preview'}
            </span>
            <span>{clip.resolution}</span>
          </div>
          <div
            className="clip-preview-frame"
            style={{ aspectRatio: previewAspectRatio }}
          >
            {fileUrl ? (
              // biome-ignore lint/a11y/useMediaCaption: Generated clips can have burned-in captions; VTT export is tracked for launch.
              <video
                controls={true}
                playsInline={true}
                preload="metadata"
                src={fileUrl}
                className="block h-full w-full object-contain"
              />
            ) : (
              <div className="flex h-full items-center justify-center text-xs text-white/60">
                {common('noVideoAvailable')}
              </div>
            )}
          </div>
          <p className="clip-preview-hint">
            {locale === 'ro'
              ? 'Modificările apar după salvare.'
              : 'Changes appear after saving.'}
          </p>
        </section>
      </div>
    </div>
  )
}
