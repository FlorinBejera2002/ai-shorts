'use client'

import { useMonthlyUsage } from '@/components/dashboard/sidebar-usage'
import { orderKits } from '@/components/dashboard/brand/kits/kit-model'
import { useBrandKits } from '@/components/dashboard/brand/kits/use-brand-kits'
import { storyCaptionMode, type StoryAsset, type StoryOptions } from './types'
import type { StoryStep } from './story-wizard'
import { useStoryLanguage } from './use-story-language'
import { StoryMusicSummary } from './story-music-summary'
import { StoryReviewPhone } from './story-review-phone'
import { StoryReviewAside } from './story-review-aside'
import { clipCountOf, noiseReducedFootage } from './story-create-review-model'
import { BriefText, Chip, FootageThumbs, ReviewBackButton, ReviewRow } from './story-review-rows'
import './story-create-review.css'

interface Props {
  options: StoryOptions
  videos: StoryAsset[]
  narration?: StoryAsset

  ready: boolean
  busy: boolean
  pendingCount: number

  onEdit: (step: StoryStep) => void
  onCreate: () => void
  onBack: () => void
}

/** Step 3 of the upload flow: a summary of footage, result, description and sound, with the create action. */
export function StoryCreateReview({
  options,
  videos,
  narration,

  ready,
  busy,
  pendingCount,

  onEdit,
  onCreate,
  onBack
}: Props) {
  const text = useStoryLanguage()
  const usage = useMonthlyUsage().data ?? null
  const { kits } = useBrandKits()
  const brandName = options.use_brand_kit && kits ? orderKits(kits)[0]?.name : undefined
  const included = videos.filter((asset) => asset.include !== 'excluded')
  const rowProps = { options, videos, busy, onEdit }
  const createLabel = busy
    ? text('Submitting…', 'Se trimite…')
    : text('Create clips', 'Creează clipurile')

  return (
    <div className="creare-review">
      <section className="creare-review-card" aria-label={text('Verify and create', 'Verifică și creează')}>
        <h2 className="creare-review-title">{text('Verify and create', 'Verifică și creează')}</h2>
        <ReviewFootageRow {...rowProps} />
        <ReviewResultRow {...rowProps} />
        <ReviewDescriptionRow {...rowProps} />
        <ReviewSoundRow
          {...rowProps}
          narrationRecorded={Boolean(narration)}
          brandName={brandName}
        />
        <ReviewBlockingNotice includedCount={included.length} pendingCount={pendingCount} />
        {options.music && <StoryMusicSummary music={options.music} narration={options.narration} />}
      </section>
      <StoryReviewAside
        preview={<StoryReviewPhone asset={included[0]} />}
        usage={usage}
        usageLabel={text('Monthly usage', 'Utilizare lunară')}
        ctaLabel={createLabel}
        ready={ready}
        busy={busy}
        onCreate={onCreate}
      />
      <ReviewBackButton label={text('Back', 'Înapoi')} disabled={busy} onClick={onBack} />
    </div>
  )
}

/** Shared inputs of every review row. Each row's "Change" action jumps to the step that edits it. */
export interface ReviewRowProps {
  options: StoryOptions
  videos: StoryAsset[]
  busy: boolean
  onEdit: (step: 0 | 1) => void
}

/** Footage row: the included clips numbered by footage order. */
export function ReviewFootageRow({ videos, busy, onEdit }: ReviewRowProps) {
  const text = useStoryLanguage()
  const included = videos.filter((asset) => asset.include !== 'excluded')
  return (
    <ReviewRow
      label={text('Footage', 'Filmări')}
      changeLabel={text('Change', 'Schimbă')}
      disabled={busy}
      onChange={() => onEdit(0)}
    >
      <FootageThumbs assets={included} videos={videos} />
    </ReviewRow>
  )
}

/** Result row: caption mode, aspect ratio, and the clip count with its duration. */
export function ReviewResultRow({ options, busy, onEdit }: ReviewRowProps) {
  const text = useStoryLanguage()
  const captionLabels = {
    all: text('All dialogue', 'Tot dialogul'),
    selective: text('Only hard-to-hear speech', 'Doar unde e greu'),
    off: text('No captions', 'Fără subtitrări')
  }
  const clipCount = clipCountOf(options)
  const clipLabel =
    clipCount === 0 ? text('Auto', 'Auto') : `${clipCount} ${text('clips', 'clipuri')}`
  const duration = options.narration
    ? text('Full narration', 'Narațiunea completă')
    : `≈ ${options.target_seconds} s`
  return (
    <ReviewRow
      label={text('Result', 'Rezultat')}
      changeLabel={text('Change', 'Schimbă')}
      disabled={busy}
      onChange={() => onEdit(1)}
    >
      <Chip>{captionLabels[storyCaptionMode(options)]}</Chip>
      <Chip>{options.aspect_ratio}</Chip>
      <Chip>{`${clipLabel} · ${duration}`}</Chip>
    </ReviewRow>
  )
}

/** Description row: the brief with footage tags, or the natural-edit fallback. */
export function ReviewDescriptionRow({ options, videos, busy, onEdit }: ReviewRowProps) {
  const text = useStoryLanguage()
  const footageLabel = (number: number) => `${text('Footage', 'Filmarea')} ${number}`
  return (
    <ReviewRow
      label={text('Description', 'Descriere')}
      changeLabel={text('Change', 'Schimbă')}
      disabled={busy}
      onChange={() => onEdit(1)}
    >
      {options.brief.trim() ? (
        <BriefText brief={options.brief} videos={videos} footageLabel={footageLabel} />
      ) : (
        <p className="creare-review-brief">{text('Natural edit', 'Montaj natural')}</p>
      )}
    </ReviewRow>
  )
}

interface SoundRowProps extends ReviewRowProps {
  /** True when a narration recording is attached to the project. */
  narrationRecorded: boolean
  /** Name of the brand kit used by the project, when it is known. */
  brandName?: string
}

/** Sound and brand row: voice or original sound, noise reduction, music and brand kit. */
export function ReviewSoundRow({
  options,
  videos,
  busy,
  onEdit,
  narrationRecorded,
  brandName
}: SoundRowProps) {
  const text = useStoryLanguage()
  const reducedCount = options.audio_cleanup?.enabled
    ? noiseReducedFootage(options, videos).length
    : 0
  return (
    <ReviewRow
      label={text('Sound and brand', 'Sunet și brand')}
      changeLabel={text('Change', 'Schimbă')}
      disabled={busy}
      onChange={() => onEdit(1)}
    >
      <Chip>
        {options.narration && narrationRecorded
          ? text('Your voice', 'Vocea mea')
          : text('Original sound', 'Sunet original')}
      </Chip>
      {reducedCount > 0 && <Chip>{noiseReducedLabel(reducedCount, text)}</Chip>}
      <Chip>
        {options.music
          ? (options.music.title ?? text('Music', 'Muzică'))
          : text('No music', 'Fără muzică')}
      </Chip>
      {options.use_brand_kit && (
        <Chip>{brandName ?? text('Brand kit', 'Kit de brand')}</Chip>
      )}
    </ReviewRow>
  )
}

function noiseReducedLabel(
  count: number,
  text: ReturnType<typeof useStoryLanguage>
) {
  return text(
    `Noise reduced · ${count} footage`,
    `Zgomot redus · ${count} ${count === 1 ? 'filmare' : 'filmări'}`,
    `Ruido reducido · ${count} ${count === 1 ? 'grabación' : 'grabaciones'}`
  )
}

/** Notice shown while uploads are pending or no clip is included. */
export function ReviewBlockingNotice({
  includedCount,
  pendingCount
}: {
  includedCount: number
  pendingCount: number
}) {
  const text = useStoryLanguage()
  if (pendingCount === 0 && includedCount > 0) return null
  return (
    <p role="status" className="creare-review-notice">
      {pendingCount > 0
        ? text(
            'Finish or retry the remaining uploads to continue.',
            'Finalizează sau reîncearcă încărcările rămase pentru a continua.'
          )
        : text(
            'Include at least one clip to continue.',
            'Include cel puțin o filmare pentru a continua.'
          )}
    </p>
  )
}
