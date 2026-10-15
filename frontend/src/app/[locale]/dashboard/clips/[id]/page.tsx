'use client'

import '@/components/clips/media-workbench.css'

import { ClipWorkspace } from '@/components/clip/clip-workspace'
import { ClipPreview } from '@/components/clip/clip-preview'
import { ApiState } from '@/components/shared/api-state'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/ui/page-header'
import { useApiResource } from '@/hooks/use-api-resource'
import { Link } from '@/i18n/navigation'
import { type ApiClip, normalizeClip } from '@/types/api'
import { ArrowLeft } from 'lucide-react'
import { useLocale } from 'next-intl'
import { useParams } from 'next/navigation'

export default function ClipDetailPage() {
  const locale = useLocale()
  const { id } = useParams<{ id: string }>()
  const { data, error, reload } = useApiResource<ApiClip>(`/api/clips/${id}`)
  if (!data) return <ApiState error={error} retry={reload} />
  const clip = normalizeClip(data)
  const fileUrl = clip.fileUrl

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

        <ClipPreview clip={clip} originalApiClip={data} />
      </div>
    </div>
  )
}
