'use client'

import '@/components/clips/media-workbench.css'

import { ApiState } from '@/components/shared/api-state'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { PageHeader } from '@/components/ui/page-header'
import { useApiResource } from '@/hooks/use-api-resource'
import { Link } from '@/i18n/navigation'
import { type ApiClip, normalizeClip } from '@/types/api'
import { ArrowLeft } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useParams } from 'next/navigation'

import { ClipWorkspace } from '@/components/clip/clip-workspace'

export default function ClipDetailPage() {
  const locale = useLocale()
  const { id } = useParams<{ id: string }>()
  const common = useTranslations('common')
  const { data, error, reload } = useApiResource<ApiClip>(`/api/clips/${id}`)
  if (!data) return <ApiState error={error} retry={reload} />
  const clip = normalizeClip(data)
  const fileUrl = clip.fileUrl

  return (
    <div className="media-workbench dashboard-workspace">
      <PageHeader
        title={clip.title}
        description={`${Math.round(clip.duration)}s · ${clip.aspectRatio} · ${clip.resolution}`}
        actions={
          <Button asChild={true} variant="outline">
            <Link href="/dashboard/clips">
              <ArrowLeft className="size-4" />
              {locale === 'ro' ? 'Bibliotecă' : 'Library'}
            </Link>
          </Button>
        }
      />
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,.85fr)_minmax(0,1.15fr)]">
        <Card
          as="section"
          className="media-monitor block gap-0 overflow-hidden py-0 shadow-none xl:sticky xl:top-20"
        >
          <div className="media-monitor-label">
            <span>
              {locale === 'ro' ? 'Previzualizare' : 'Preview monitor'}
            </span>
            <span>
              {clip.resolution} / {clip.aspectRatio}
            </span>
          </div>
          <div className="mx-auto aspect-[9/16] max-h-[68dvh] w-full max-w-md overflow-hidden rounded-lg bg-black">
            {fileUrl ? (
              // biome-ignore lint/a11y/useMediaCaption: Generated clips can have burned-in captions; VTT export is tracked for launch.
              <video
                controls={true}
                src={fileUrl}
                className="h-full w-full object-contain"
              />
            ) : (
              <div className="flex h-full items-center justify-center text-xs text-white/60">
                {common('noVideoAvailable')}
              </div>
            )}
          </div>
        </Card>

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
            suggestedHashtags: clip.suggestedHashtags
          }}
        />
      </div>
    </div>
  )
}
