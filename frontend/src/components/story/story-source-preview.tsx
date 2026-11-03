import { useState } from 'react'
import { FileVideo } from 'lucide-react'
import { formatDuration } from '@/lib/youtube'
import type { StoryAsset } from './types'
import { useStoryLanguage } from './use-story-language'

interface Props {
  assets: StoryAsset[]
}

export function StorySourcePreview({ assets }: Props) {
  const text = useStoryLanguage()
  const [selectedID, setSelectedID] = useState<string>()
  const selected = assets.find((asset) => asset.id === selectedID) ?? assets[0]
  return (
    <section
      className="story-source-preview"
      aria-label={text('Source preview', 'Previzualizarea sursei')}
    >
      <div className="story-source-preview-stage">
        {selected ? (
          <SourceFrame asset={selected} eager />
        ) : (
          <div className="story-source-preview-placeholder">
            <FileVideo className="size-8" aria-hidden="true" />
            <span>{text('No preview', 'Fără previzualizare')}</span>
          </div>
        )}
      </div>
      {selected && (
        <div className="mt-3 flex min-w-0 items-center justify-between gap-3 text-sm">
          <p className="truncate font-medium" title={selected.name}>
            {selected.name}
          </p>
          <span className="shrink-0 tabular-nums text-muted-foreground">
            {formatDuration(selected.duration)}
          </span>
        </div>
      )}
      {assets.length > 1 && (
        <div
          className="story-source-preview-strip"
          role="group"
          aria-label={text('Source clips', 'Filmările sursă')}
        >
          {assets.slice(0, 6).map((asset) => (
            <button
              key={asset.id}
              type="button"
              className="story-source-preview-choice"
              aria-label={`${text('Preview', 'Previzualizează')} ${asset.name}`}
              aria-pressed={asset.id === selected?.id}
              onClick={() => setSelectedID(asset.id)}
            >
              <SourceFrame asset={asset} />
              <span>{formatDuration(asset.duration)}</span>
            </button>
          ))}
        </div>
      )}
    </section>
  )
}

function SourceFrame({
  asset,
  eager = false
}: {
  asset: StoryAsset
  eager?: boolean
}) {
  const text = useStoryLanguage()
  const [failed, setFailed] = useState<string[]>([])
  const fail = (url: string) =>
    setFailed((previous) =>
      previous.includes(url) ? previous : [...previous, url]
    )
  const thumbnail = asset.thumbnail_url
  const source = asset.proxy_url || asset.source_url
  if (thumbnail && !failed.includes(thumbnail))
    return (
      <img
        src={thumbnail}
        alt=""
        loading="lazy"
        onError={() => fail(thumbnail)}
      />
    )
  if (source && !failed.includes(source))
    return (
      <video
        src={source}
        muted
        playsInline
        preload={eager ? 'metadata' : 'none'}
        aria-hidden="true"
        onError={() => fail(source)}
      />
    )
  return (
    <div className="story-source-preview-placeholder">
      <FileVideo className="size-6" aria-hidden="true" />
      <span>{text('No preview', 'Fără previzualizare')}</span>
    </div>
  )
}
