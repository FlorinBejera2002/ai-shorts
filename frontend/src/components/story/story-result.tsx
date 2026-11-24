'use client'

import { useState, type ReactNode } from 'react'
import { Link } from '@/i18n/navigation'
import { Button } from '@/components/ui/button'
import { OpenStudioButton } from '@/components/studio/open-studio-button'
import { formatDuration } from '@/lib/youtube'
import type { StoryProject, StoryVersion } from './types'
import { StoryResultDownload, StoryResultHeader, type ResultStat } from './story-result-header'
import { StoryResultPlayer } from './story-result-player'
import { StoryResultStrip } from './story-result-strip'
import { StoryReview } from './story-review'
import { StoryMusicCredits } from './story-music-credits'
import { StoryCaptionStatus } from './story-caption-status'
import {
  resultClips,
  selectClipPosition,
  totalDuration,
  type StoryResultClip
} from './story-result-outputs'
import { useStoryLanguage } from './use-story-language'
import './story-output.css'
import './story-result.css'
import './story-pill-actions.css'

/** The finished clip (or clips) of a version: preview, stats, download and the next steps. */
export function StoryResult({
  project,
  version,
  deleteControl
}: {
  project: StoryProject
  version: StoryVersion
  /** Project deletion, shown as the last step of the result card. */
  deleteControl?: ReactNode
}) {
  const text = useStoryLanguage()
  const clips = resultClips(version, project.options)
  const [selected, setSelected] = useState(0)
  const [measured, setMeasured] = useState<Record<string, number>>({})
  const position = selectClipPosition(selected, clips.length)
  const clip: StoryResultClip | undefined = clips[position]
  const multiple = clips.length > 1
  const ready = version.report.status === 'ready'

  if (!clip) {
    return (
      <section className="story-result" data-testid="story-result">
        <p role="status" className="story-result-unavailable">
          {text(
            'A browser preview is not available for this result.',
            'Nu este disponibilă o previzualizare în browser pentru acest rezultat.'
          )}
        </p>
        <Button asChild variant="outline" className="rounded-full">
          <Link href="/dashboard/clips">{text('All clips', 'Toate clipurile')}</Link>
        </Button>
        <p className="story-result-help">
          {text(
            'This result is not available in Studio. Your saved videos are in All clips.',
            'Acest rezultat nu este disponibil în Studio. Videourile salvate sunt în Toate clipurile.'
          )}
        </p>
      </section>
    )
  }

  const duration = measured[clip.videoUrl] ?? clip.durationSeconds
  const stats: ResultStat[] = multiple
    ? [
        { label: text('Clips', 'Clipuri'), value: String(clips.length) },
        { label: text('Duration', 'Durată'), value: formatDuration(totalDuration(clips)) },
        { label: text('Format', 'Format'), value: clip.aspectRatio }
      ]
    : [
        { label: text('Duration', 'Durată'), value: formatDuration(duration) },
        { label: text('Format', 'Format'), value: clip.aspectRatio },
        { label: text('Version', 'Versiune'), value: String(version.number) }
      ]

  return (
    <section className="story-result" data-testid="story-result">
      <div className="story-result-preview">
        <StoryResultPlayer
          key={clip.id}
          src={clip.videoUrl}
          poster={clip.posterUrl ?? undefined}
          onDuration={(seconds) =>
            setMeasured((current) => ({ ...current, [clip.videoUrl]: seconds }))
          }
        />
        {version.render_options?.dynamic_range === 'hdr' && (
          <p className="story-result-help">
            {text(
              'SDR browser preview. Download saves the original HDR video.',
              'Previzualizare SDR în browser. Descărcarea salvează videoul HDR original.'
            )}
          </p>
        )}
      </div>
      <div className="story-result-panel">
        <img
          className="story-result-done"
          src="/illustrations/create-done.webp"
          alt={text(
            'Ana and Radu clap, each with a clip on a phone',
            'Ana și Radu bat palma, fiecare cu un clip pe telefon'
          )}
          width={170}
          height={170}
        />
        <StoryResultHeader
          title={
            multiple
              ? text('Your clips are ready', 'Clipurile tale sunt gata')
              : text('Your clip is ready', 'Clipul tău e gata')
          }
          stats={stats}
        />
        {multiple && (
          <StoryResultStrip clips={clips} selected={position} onSelect={setSelected} />
        )}
        <StoryReview version={version} />
        <StoryCaptionStatus version={version} options={project.options} />
        <div className="story-result-actions">
          <StoryResultDownload href={clip.downloadUrl} ready={ready} />
          <div className="story-result-secondary">
            {clip.clipId && (
              <OpenStudioButton clipId={clip.clipId} className="story-result-studio creare-outline-pill" />
            )}
            <Button asChild variant="outline" className="story-result-library creare-outline-pill">
              <Link href="/dashboard/clips">{text('All clips', 'Toate clipurile')}</Link>
            </Button>
          </div>
        </div>
        {version.output?.music && (
          <details className="story-result-credits">
            <summary>{text('Music credits', 'Credite muzicale')}</summary>
            <StoryMusicCredits key={version.number} music={version.output.music} />
          </details>
        )}
        {deleteControl && <div className="story-result-footer">{deleteControl}</div>}
      </div>
    </section>
  )
}
