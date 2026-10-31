import { Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatDuration } from '@/lib/youtube'
import type { StoryVersion } from './types'
import { useStoryLanguage } from './use-story-language'

interface Props {
  version: StoryVersion
  duration: number
  aspectRatio: string
}

export function StoryResultHeader({ version, duration, aspectRatio }: Props) {
  const text = useStoryLanguage()
  const ready = version.report.status === 'ready'

  return (
    <div className="story-result-header">
      <div className="story-result-heading">
        <h2>
          {text('Video preview', 'Previzualizare video')}
        </h2>
        <span className="story-result-status" role="status">
          <span aria-hidden="true" />
          {ready ? text('Ready', 'Gata') : text('Needs review', 'Necesită verificare')}
        </span>
      </div>
      <dl className="story-result-metadata">
        <div>
          <dt>{text('Duration', 'Durată')}</dt>
          <dd>{formatDuration(duration)}</dd>
        </div>
        <div>
          <dt>{text('Format', 'Format')}</dt>
          <dd>{aspectRatio}</dd>
        </div>
        <div>
          <dt>{text('Version', 'Versiunea')}</dt>
          <dd>{version.number}</dd>
        </div>
      </dl>
    </div>
  )
}

export function StoryResultDownload({ version }: { version: StoryVersion }) {
  const text = useStoryLanguage()
  if (!version.preview_url) return null
  return (
    <Button asChild className="story-result-download">
      <a
        href={version.export_url ?? version.preview_url}
        download
        target="_blank"
        rel="noreferrer"
      >
        <Download className="size-4" aria-hidden="true" />
        {version.report.status === 'ready'
          ? text('Download video', 'Descarcă video')
          : text('Download draft', 'Descarcă versiunea preliminară')}
      </a>
    </Button>
  )
}
