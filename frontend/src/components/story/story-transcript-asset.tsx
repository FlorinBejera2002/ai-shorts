import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import type { StoryAsset, StoryTranscriptApproval } from './types'
import { StoryTranscriptPassage } from './story-transcript-passage'
import { transcriptApprovals } from './story-transcript-model'
import { useStoryLanguage } from './use-story-language'

export function StoryTranscriptAsset({
  asset,
  disabled,
  onApprove
}: {
  asset: StoryAsset
  disabled: boolean
  onApprove: (
    reviews: StoryTranscriptApproval[]
  ) => Promise<boolean | undefined>
}) {
  const text = useStoryLanguage()
  const [drafts, setDrafts] = useState<Record<string, string[]>>({})
  const [selected, setSelected] = useState<string[]>([])
  const selectedIDs = new Set(selected)
  const [error, setError] = useState('')
  const player = useRef<HTMLVideoElement>(null)
  const pendingSeek = useRef<number | null>(null)
  const source = asset.proxy_url ?? asset.source_url
  const proposals = asset.transcript_proposals ?? []
  function listen(start: number) {
    const video = player.current
    if (!video) return
    pendingSeek.current = start
    if (video.readyState < 1) {
      video.load()
      return
    }
    video.currentTime = Math.min(
      start,
      Number.isFinite(video.duration) ? video.duration : start
    )
    pendingSeek.current = null
    void video
      .play()
      .catch(() =>
        setError(
          text(
            'The recording could not play. Try the playback controls.',
            'Înregistrarea nu a putut fi redată. Încearcă butoanele de redare.'
          )
        )
      )
  }
  async function approve() {
    if (disabled || !selected.length) return
    setError('')
    let reviews: StoryTranscriptApproval[]
    try {
      reviews = transcriptApprovals(asset, selected, drafts)
    } catch {
      setError(
        text(
          'Fill in every word and select only passages with verified timing.',
          'Completează fiecare cuvânt și selectează doar pasaje cu timpi verificați.'
        )
      )
      return
    }
    if (await onApprove(reviews)) setSelected([])
  }
  return (
    <details className="rounded-md border p-3" data-testid="transcript-asset">
      <summary className="cursor-pointer break-words text-sm font-medium">
        {asset.name} · {proposals.length} {text('passages', 'pasaje')}
      </summary>
      <div className="mt-3 space-y-3">
        {source ? (
          <video
            ref={player}
            src={source}
            controls
            playsInline
            preload="none"
            className="max-h-64 w-full rounded-md bg-black object-contain"
            aria-label={`${text('Transcript source', 'Sursa transcrierii')}: ${asset.name}`}
            onLoadedMetadata={() => {
              if (pendingSeek.current !== null) listen(pendingSeek.current)
            }}
          />
        ) : (
          <p className="text-sm text-muted-foreground">
            {text(
              'The source recording is currently unavailable.',
              'Înregistrarea originală nu este disponibilă momentan.'
            )}
          </p>
        )}
        {proposals.map((proposal) => (
          <StoryTranscriptPassage
            key={proposal.id}
            proposal={proposal}
            words={
              drafts[proposal.id] ?? proposal.words.map((word) => word.text)
            }
            selected={selectedIDs.has(proposal.id)}
            disabled={disabled}
            canListen={Boolean(source)}
            onListen={() => listen(proposal.in)}
            onSelect={(checked) =>
              setSelected((current) =>
                checked
                  ? [...current.filter((id) => id !== proposal.id), proposal.id]
                  : current.filter((id) => id !== proposal.id)
              )
            }
            onWord={(index, value) => {
              setDrafts((current) => ({
                ...current,
                [proposal.id]: (
                  current[proposal.id] ??
                  proposal.words.map((word) => word.text)
                ).map((word, wordIndex) => (wordIndex === index ? value : word))
              }))
              setSelected((current) =>
                current.filter((id) => id !== proposal.id)
              )
            }}
          />
        ))}
        <Button
          type="button"
          className="h-auto whitespace-normal text-center"
          disabled={disabled || !selected.length || !source}
          onClick={() => void approve()}
        >
          {text(
            'Approve selected and rebuild captions',
            'Confirmă selecția și regenerează subtitrările'
          )}
        </Button>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </div>
    </details>
  )
}
