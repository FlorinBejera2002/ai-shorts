import { useState } from 'react'
import { Link } from '@/i18n/navigation'
import { Button } from '@/components/ui/button'
import { OpenStudioButton } from '@/components/studio/open-studio-button'
import type { StoryProject, StoryVersion } from './types'
import { StoryResultHeader } from './story-result-header'
import { StoryReview } from './story-review'
import { StoryMusicCredits } from './story-music-credits'
import { StoryCaptionStatus } from './story-caption-status'
import { useStoryLanguage } from './use-story-language'

export function StoryResult({
  project,
  version
}: {
  project: StoryProject
  version: StoryVersion
}) {
  const text = useStoryLanguage()
  const [media, setMedia] = useState<{ url: string; duration: number }>()
  const duration =
    media && media.url === version.preview_url
      ? media.duration
      : (version.output?.duration ??
        version.timeline.reduce(
          (end, entry) => Math.max(end, entry.output_out),
          0
        ))

  return (
    <section className="min-w-0 space-y-4" data-testid="story-result">
      <StoryResultHeader
        version={version}
        duration={duration}
        aspectRatio={
          version.render_options?.aspect_ratio ?? project.options.aspect_ratio
        }
      />
      <div className="flex flex-wrap items-center gap-3">
        {version.clip_id && <OpenStudioButton clipId={version.clip_id} />}
        <Button asChild variant="outline">
          <Link href="/dashboard/clips">{text('All clips', 'Toate clipurile')}</Link>
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        {version.clip_id
          ? text(
              'Your video is saved with your clips. Open it in Studio to make changes.',
              'Videoul este salvat alături de clipurile tale. Deschide-l în Studio pentru modificări.'
            )
          : text(
              'This result is not available in Studio. Open All clips to view your saved videos.',
              'Acest rezultat nu este disponibil în Studio. Deschide Toate clipurile pentru a vedea videourile salvate.'
            )}
      </p>
      {version.render_options?.dynamic_range === 'hdr' && (
        <p className="text-xs text-muted-foreground">
          {text(
            'SDR preview for browser compatibility. Download saves the original HDR video.',
            'Previzualizare SDR pentru compatibilitate cu browserul. Descărcarea salvează videoul HDR original.'
          )}
        </p>
      )}
      {version.preview_url ? (
        <div className="flex min-h-48 justify-center overflow-hidden rounded-md bg-muted">
          <video
            src={version.preview_url}
            poster={version.thumbnail_url}
            controls
            playsInline
            preload="metadata"
            onLoadedMetadata={(event) => {
              if (
                Number.isFinite(event.currentTarget.duration) &&
                version.preview_url
              )
                setMedia({
                  url: version.preview_url,
                  duration: event.currentTarget.duration
                })
            }}
            className="max-h-[min(65dvh,42rem)] min-h-48 w-full rounded-md bg-black object-contain"
            aria-label={text('Story preview', 'Previzualizare poveste')}
          />
        </div>
      ) : (
        <p role="status" className="rounded-md border p-3 text-sm">
          {text(
            'A browser preview is not available for this result.',
            'Nu este disponibilă o previzualizare în browser pentru acest rezultat.'
          )}
        </p>
      )}
      <StoryCaptionStatus version={version} options={project.options} />
      <StoryReview version={version} />
      {version.output?.music && (
        <StoryMusicCredits key={version.number} music={version.output.music} />
      )}
    </section>
  )
}
