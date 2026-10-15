import { Play } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Link } from '@/i18n/navigation'
import type { ApiClip, FullClip } from '@/types/api'
import { ImproveTransitions } from './improve-transitions'

interface ClipPreviewProps {
  clip: Pick<FullClip, 'id' | 'aspectRatio' | 'resolution' | 'fileUrl' | 'previewUrl'>
  originalApiClip: ApiClip
}

function previewGeometry(aspectRatio: string) {
  const [width = 0, height = 0] = aspectRatio.split(':').map(Number)
  const valid = Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0
  return {
    aspectRatio: valid ? `${width} / ${height}` : '9 / 16',
    orientation: valid && width > height ? 'landscape' : 'portrait'
  }
}

export function ClipPreview({ clip, originalApiClip }: ClipPreviewProps) {
  const locale = useLocale()
  const common = useTranslations('common')
  const previewUrl = clip.previewUrl ?? clip.fileUrl
  const geometry = previewGeometry(clip.aspectRatio)
  const storyID = typeof originalApiClip.story_project_id === 'string'
    ? originalApiClip.story_project_id
    : ''

  return (
    <section className="clip-preview-stage" data-orientation={geometry.orientation}>
      <div className="clip-preview-label">
        <span>
          <Play className="size-3" fill="currentColor" />
          {locale === 'ro' ? 'Previzualizare' : 'Preview'}
        </span>
        <span>{clip.resolution}</span>
      </div>
      <div className="clip-preview-frame" style={{ aspectRatio: geometry.aspectRatio }}>
        {previewUrl ? (
          // biome-ignore lint/a11y/useMediaCaption: Generated clips can have burned-in captions; VTT export is tracked for launch.
          <video
            controls={true}
            playsInline={true}
            preload="metadata"
            src={previewUrl}
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
      {storyID ? (
        <Button asChild={true}>
          <Link href={`/dashboard/create?story=${encodeURIComponent(storyID)}`}>
            {locale === 'ro' ? 'Editează povestea și revizia' : 'Edit story and review'}
          </Link>
        </Button>
      ) : (
        <ImproveTransitions key={clip.id} clipId={clip.id} initialClip={originalApiClip} />
      )}
    </section>
  )
}
