import type { StoryVersion } from './types'
import { customerReviewIssues, reviewTopic } from './story-review-model'
import { useStoryLanguage } from './use-story-language'

/** Raw reports stay in the authenticated project API for support diagnostics. */
export function StoryReview({
  version
}: {
  version: StoryVersion
}) {
  const text = useStoryLanguage()
  const issues = customerReviewIssues(version)
  if (!issues.length) {
    if (!version.accepted || version.report.status !== 'needs_review') return null
    return (
      <p
        role="status"
        className="rounded-md border bg-muted px-3 py-2 text-sm text-foreground"
        data-testid="story-review-notice"
      >
        {text(
          'Review the picture, sound and captions in this version before using it.',
          'Verifică imaginea, sunetul și subtitrările acestei versiuni înainte de a o folosi.'
        )}
      </p>
    )
  }
  const labels = {
    captions: text(
      'Check the captions at this moment.',
      'Verifică subtitrările în acest moment.'
    ),
    audio: text(
      'Check the sound at this moment.',
      'Verifică sunetul în acest moment.'
    ),
    visual: text(
      'Check the framing at this moment.',
      'Verifică încadrarea în acest moment.'
    ),
    story: text(
      'A requested moment may be missing. Review the selected clips.',
      'Poate lipsi un moment solicitat. Verifică filmările selectate.'
    ),
    file: text(
      'Playback or an edit needs attention. Review this moment.',
      'Redarea sau o tăietură necesită atenție. Verifică acest moment.'
    ),
    other: text(
      'A required clip is missing or unavailable. Check your footage.',
      'O filmare necesară lipsește sau nu este disponibilă. Verifică fișierele.'
    )
  }
  return (
    <ul
      className="space-y-2"
      aria-label={text('Video issues', 'Probleme video')}
    >
      {issues.map((issue) => (
        <li
          key={issue.id}
          className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm"
          data-testid="story-review-issue"
        >
          <span>
            {issue.type === 'caption_unavailable'
              ? text(
                  'Some captions could not be added. Open the video in Studio to review and edit them.',
                  'Unele subtitrări nu au putut fi adăugate. Deschide videoul în Studio pentru a le verifica și edita.'
                )
              : labels[reviewTopic(issue.type)]}
          </span>
        </li>
      ))}
    </ul>
  )
}
