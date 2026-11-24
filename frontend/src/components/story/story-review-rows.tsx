import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import type { StoryAsset } from './types'
import { briefSegments, footageNumber } from './story-create-review-model'

/** Segments keyed by their content and its occurrence, so React keys never depend on list position. */
function keyedBriefSegments(brief: string) {
  const seen = new Map<string, number>()
  return briefSegments(brief).map((segment) => {
    const content = segment.type === 'text' ? segment.value : segment.assetId
    const identity = `${segment.type}:${content}`
    const occurrence = seen.get(identity) ?? 0
    seen.set(identity, occurrence + 1)
    return { key: `${identity}:${occurrence}`, segment }
  })
}

/** One labelled row of the review: its content on the left, a "Change" action on the right. */
export function ReviewRow({
  label,
  changeLabel,
  disabled,
  onChange,
  children
}: {
  label: string
  changeLabel: string
  disabled: boolean
  onChange: () => void
  children: ReactNode
}) {
  return (
    <div className="creare-review-row">
      <span className="creare-review-label">{label}</span>
      <div className="creare-review-value">{children}</div>
      <Button
        variant="outline"
        size="sm"
        className="creare-review-change creare-outline-pill"
        disabled={disabled}
        onClick={onChange}
      >
        {changeLabel}
      </Button>
    </div>
  )
}

/** Outline pill that returns to the previous step; it sits under the review card, outside the grid cards. */
export function ReviewBackButton({
  label,
  disabled,
  onClick
}: {
  label: string
  disabled: boolean
  onClick: () => void
}) {
  return (
    <Button
      type="button"
      variant="outline"
      className="creare-review-back creare-outline-pill"
      disabled={disabled}
      onClick={onClick}
    >
      {label}
    </Button>
  )
}

/** Clip thumbnails numbered by footage order, the numbers the description tags refer to. */
export function FootageThumbs({ assets, videos }: { assets: StoryAsset[]; videos: StoryAsset[] }) {
  return (
    <ol className="creare-review-thumbs">
      {assets.map((asset) => (
        <li key={asset.id} className="creare-review-thumb">
          {asset.thumbnail_url ? <img src={asset.thumbnail_url} alt="" /> : null}
          <span>{footageNumber(videos, asset.id)}</span>
        </li>
      ))}
    </ol>
  )
}

export function Chip({ children }: { children: ReactNode }) {
  return <span className="creare-review-chip">{children}</span>
}

/** Brief text with its footage references shown as "Filmarea N" tags. */
export function BriefText({
  brief,
  videos,
  footageLabel
}: {
  brief: string
  videos: StoryAsset[]
  footageLabel: (number: number) => string
}) {
  return (
    <p className="creare-review-brief">
      {keyedBriefSegments(brief).map(({ key, segment }) => {
        if (segment.type === 'text') return <span key={key}>{segment.value}</span>
        const number = footageNumber(videos, segment.assetId)
        return number ? (
          <span key={key} className="creare-review-tag">
            {footageLabel(number)}
          </span>
        ) : null
      })}
    </p>
  )
}
