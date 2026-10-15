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
  const shapes: Record<string, string> = {
    '9:16': text('Vertical', 'Vertical'),
    '16:9': text('Landscape', 'Orizontal'),
    '1:1': text('Square', 'Pătrat')
  }
  const shape = shapes[aspectRatio] ?? aspectRatio

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 className="font-semibold">
          {text('Video preview', 'Previzualizare video')}
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          {formatDuration(duration)} · {shape} · {text('Version', 'Versiunea')}{' '}
          {version.number}
        </p>
      </div>
      {version.preview_url && (
        <Button asChild variant="outline" size="sm">
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
      )}
    </div>
  )
}
