import { useState } from 'react'
import { Link } from '@/i18n/navigation'
import { Button } from '@/components/ui/button'
import { OpenStudioButton } from '@/components/studio/open-studio-button'
import type { StoryProject, StoryVersion } from './types'
import { StoryResultDownload, StoryResultHeader } from './story-result-header'
import { StoryReview } from './story-review'
import { StoryMusicCredits } from './story-music-credits'
import { StoryCaptionStatus } from './story-caption-status'
import { useStoryLanguage } from './use-story-language'
import './story-output.css'

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
    <section className="story-result" data-testid="story-result">
      <div className="story-result-inspector">
        <StoryResultHeader
          version={version}
          duration={duration}
          aspectRatio={
            version.render_options?.aspect_ratio ?? project.options.aspect_ratio
          }
        />
        <StoryReview version={version} />
      </div>
      <div className="story-result-workarea">
        {version.preview_url ? (
          <div className="story-result-stage">
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
              className="story-result-video"
              aria-label={text('Clip preview', 'Previzualizare clip')}
            />
          </div>
        ) : (
          <p role="status" className="story-result-unavailable">
            {text(
              'A browser preview is not available for this result.',
              'Nu este disponibilă o previzualizare în browser pentru acest rezultat.'
            )}
          </p>
        )}
        {version.render_options?.dynamic_range === 'hdr' && (
          <p className="story-result-help">
            {text(
              'SDR browser preview. Download saves the original HDR video.',
              'Previzualizare SDR în browser. Descărcarea salvează videoul HDR original.'
            )}
          </p>
        )}
        <StoryCaptionStatus version={version} options={project.options} />
        {version.output?.music && (
          <details className="story-result-credits">
            <summary>{text('Music credits', 'Credite muzicale')}</summary>
            <StoryMusicCredits key={version.number} music={version.output.music} />
          </details>
        )}
      </div>
      <div className="story-result-actions">
        <StoryResultDownload version={version} />
        {version.clip_id && (
          <OpenStudioButton
            clipId={version.clip_id}
            className="story-result-studio"
          />
        )}
        <Button asChild variant="ghost" className="story-result-library">
          <Link href="/dashboard/clips">{text('All clips', 'Toate clipurile')}</Link>
        </Button>
        <p className="story-result-help">
          {version.clip_id
            ? text(
                'Your video is saved with your clips. Edit it in Studio.',
                'Videoul este salvat alături de clipurile tale. Editează-l în Studio.'
              )
            : text(
                'This result is not available in Studio. Your saved videos are in All clips.',
                'Acest rezultat nu este disponibil în Studio. Videourile salvate sunt în Toate clipurile.'
              )}
        </p>
      </div>
    </section>
  )
}
