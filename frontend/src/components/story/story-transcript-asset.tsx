import { useState } from 'react'
import { Button } from '@/components/ui/button'
import type { StoryAsset, StoryTranscriptApproval, StoryWord } from './types'
import { StoryTranscriptPassage } from './story-transcript-passage'
import { transcriptApprovals } from './story-transcript-model'
import { useStoryLanguage } from './use-story-language'
import { useTranscriptPlayer } from './use-transcript-player'

export function StoryTranscriptAsset({
  asset,
  disabled,
  onApprove,
  onRenew
}: {
  asset: StoryAsset
  disabled: boolean
  onApprove: (
    reviews: StoryTranscriptApproval[]
  ) => Promise<boolean | undefined>
  /** Fetches the project again and returns this asset with a renewed playback URL. */
  onRenew?: (assetID: string) => Promise<StoryAsset | undefined>
}) {
  const text = useStoryLanguage()
  const [drafts, setDrafts] = useState<Record<string, string[]>>({})
  const [timingDrafts, setTimingDrafts] = useState<Record<string, StoryWord[]>>({})
  const [selected, setSelected] = useState<string[]>([])
  const selectedIDs = new Set(selected)
  const [error, setError] = useState('')
  const source = asset.proxy_url || asset.source_url || ''
  const {
    player,
    source: playbackSource,
    failed,
    playBlocked,
    seekAndPlay,
    loaded,
    retry,
    onError
  } = useTranscriptPlayer(source)
  const proposals = asset.transcript_proposals ?? []
  async function retryPlayback() {
    // Signed playback URLs expire; renew them from the project before reconnecting the player.
    const renewed = await onRenew?.(asset.id)
    retry(renewed ? (renewed.proxy_url || renewed.source_url || source) : source)
  }
  async function approve() {
    if (disabled || !selected.length) return
    setError('')
    let reviews: StoryTranscriptApproval[]
    try {
      reviews = transcriptApprovals(asset, selected, drafts, timingDrafts)
    } catch {
      setError(
        text(
          'Check every word and its timing before confirming the selected passages.',
          'Verifică fiecare cuvânt și timpii acestuia înainte de confirmarea pasajelor selectate.'
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
          <div className="space-y-2">
            <video
              ref={player}
              src={playbackSource}
              controls
              playsInline
              preload="none"
              className="max-h-64 w-full rounded-md bg-black object-contain"
              aria-label={`${text('Transcript source', 'Sursa transcrierii')}: ${asset.name}`}
              onLoadedMetadata={loaded}
              onError={onError}
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => seekAndPlay(0)}
            >
              {text('Play full recording', 'Redă înregistrarea completă')}
            </Button>
            {failed && (
              <div role="alert" className="space-y-2 text-sm">
                <p>{text(
                  'The recording could not load. Retry to reconnect to the video.',
                  'Înregistrarea nu s-a putut încărca. Reîncearcă pentru a reconecta videoul.'
                )}</p>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => void retryPlayback()}
                >
                  {text('Retry playback', 'Reîncearcă redarea')}
                </Button>
              </div>
            )}
            {playBlocked && !failed && (
              <p role="status" className="text-sm text-muted-foreground">
                {text(
                  'Press Play in the video controls to continue.',
                  'Apasă Redare în controalele videoului pentru a continua.'
                )}
              </p>
            )}
          </div>
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
            duration={asset.duration}
            timingWords={timingDrafts[proposal.id]}
            onTiming={(words) => {
              setTimingDrafts((current) => ({ ...current, [proposal.id]: words }))
              setSelected((current) => current.filter((id) => id !== proposal.id))
            }}
            words={
              drafts[proposal.id] ?? proposal.words.map((word) => word.text)
            }
            selected={selectedIDs.has(proposal.id)}
            disabled={disabled}
            canListen={Boolean(source)}
            onListen={seekAndPlay}
            playbackTime={() => player.current?.currentTime ?? 0}
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
          {text('Confirm selected passages', 'Confirmă pasajele selectate')}
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
