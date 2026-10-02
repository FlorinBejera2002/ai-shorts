import { Button } from '@/components/ui/button'
import { formatDuration } from '@/lib/youtube'
import type { StoryProject, StoryVersion } from './types'
import { groupReviewIssues, type ReviewTopic } from './story-review-model'
import { useStoryLanguage } from './use-story-language'

const topicCopy: Record<
  ReviewTopic,
  { title: [string, string]; action: [string, string] }
> = {
  captions: {
    title: ['Check the captions', 'Verifică subtitrările'],
    action: [
      'Compare the words on screen with what you hear, especially names and numbers.',
      'Compară cuvintele de pe ecran cu ce auzi, mai ales numele și numerele.'
    ]
  },
  audio: {
    title: ['Listen to the sound', 'Ascultă sunetul'],
    action: [
      'Listen for clear speech, changes in volume and the correct voice.',
      'Verifică dacă vorbirea este clară, volumul este potrivit și vocea este cea corectă.'
    ]
  },
  visual: {
    title: ['Watch the selected shots', 'Verifică imaginile alese'],
    action: [
      'Check that the shots fit your video and that the subject stays in frame. A shot without speech can still be useful.',
      'Verifică dacă imaginile se potrivesc videoului și subiectul rămâne în cadru. Un cadru fără vorbire poate fi util.'
    ]
  },
  story: {
    title: ['Check how the story flows', 'Verifică firul poveștii'],
    action: [
      'Watch for missing context, repeated moments or a change in meaning. You can try Smoother flow below.',
      'Verifică dacă lipsește contextul, se repetă momente sau se schimbă sensul. Poți încerca Montaj mai cursiv mai jos.'
    ]
  },
  file: {
    title: ['Check playback and cuts', 'Verifică redarea și tăieturile'],
    action: [
      'Play the video through and check for interruptions or abrupt cuts before using it.',
      'Redă videoul până la capăt și verifică întreruperile sau tăieturile bruște înainte de utilizare.'
    ]
  },
  other: {
    title: ['Review the marked moments', 'Verifică momentele marcate'],
    action: [
      'Watch these moments before publishing. Open the report for the original finding.',
      'Urmărește aceste momente înainte de publicare. Deschide raportul pentru observația originală.'
    ]
  }
}

export function StoryReview({
  version,
  attempts = [],
  onSeek
}: {
  version: StoryVersion
  attempts?: StoryProject['attempts']
  onSeek?: (seconds: number) => void
}) {
  const text = useStoryLanguage()
  const coverage = version.report.coverage
  const issues = version.report.issues ?? []
  const groups = groupReviewIssues(issues)
  const checks = [
    [text('Story plan', 'Plan narativ'), coverage.plan],
    [text('File integrity', 'Integritatea fișierului'), coverage.file],
    [text('Audio', 'Audio'), coverage.audio],
    [text('Visuals', 'Imagine'), coverage.visual],
    [text('Captions', 'Subtitrări'), coverage.captions],
    [text('Meaning', 'Sens'), coverage.semantics],
    [text('Cut boundaries', 'Puncte de tăiere'), coverage.boundaries]
  ] as const
  const incomplete = checks.filter(([, complete]) => !complete)
  const needsReview = version.report.status !== 'ready' || groups.length > 0
  return (
    <section
      className="story-result-surface space-y-4 rounded-md bg-card p-5"
      aria-label={text('Before you publish', 'Înainte de publicare')}
    >
      <div>
        <h2 className="text-sm font-semibold">
          {needsReview
            ? text('Before you publish', 'Înainte de publicare')
            : text(
                'Automatic checks completed',
                'Verificări automate finalizate'
              )}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {needsReview
            ? text(
                'Watch your video and review the notes below before publishing.',
                'Urmărește videoul și verifică observațiile de mai jos înainte de publicare.'
              )
            : text(
                'Watch the result to make sure it is how you want it.',
                'Urmărește rezultatul ca să te asiguri că este așa cum îți dorești.'
              )}
        </p>
      </div>
      {(incomplete.length > 0 || (coverage.incomplete ?? []).length > 0) && (
        <div
          className="space-y-1 text-sm"
          data-testid="story-review-limitations"
        >
          <p className="font-medium">
            {text(
              'Some automatic checks could not be completed',
              'Unele verificări automate nu au putut fi finalizate'
            )}
          </p>
          {incomplete.length > 0 && (
            <p className="mt-1">
              {incomplete.map(([label]) => label).join(' · ')}
            </p>
          )}
          <p className="mt-1 text-muted-foreground">
            {text(
              'This does not confirm a problem with your video. Listen to the sound, watch the framing and check any captions yourself.',
              'Acest lucru nu confirmă o problemă a videoului. Ascultă sunetul, urmărește încadrarea și verifică subtitrările, dacă există.'
            )}
          </p>
        </div>
      )}
      {groups.length > 0 && (
        <ul>
          {groups.map((group) => (
            <li
              key={group.topic}
              className="min-w-0 space-y-2 py-3 first:pt-0 last:pb-0"
              data-testid="story-review-topic"
            >
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-medium">
                  {text(...topicCopy[group.topic].title)}
                </h3>
                <span className="rounded-sm bg-muted px-2 py-0.5 text-xs">
                  {group.severity === 'critical'
                    ? text('Must fix', 'Necesită corectare')
                    : group.severity === 'major'
                      ? text('Needs attention', 'De verificat')
                      : text('Suggestion', 'Sugestie')}
                </span>
              </div>
              <p className="text-sm text-muted-foreground">
                {text(...topicCopy[group.topic].action)}
              </p>
              {group.descriptions.map((description) => (
                <p key={description} className="text-sm">
                  {description}
                </p>
              ))}
              <details>
                <summary className="cursor-pointer text-xs font-medium">
                  {text('View marked moments', 'Vezi momentele marcate')} (
                  {group.issues.length})
                </summary>
                <ul className="mt-2 flex flex-wrap gap-2">
                  {group.issues.map((issue) => (
                    <li key={issue.id}>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!onSeek || !version.preview_url}
                        onClick={() => onSeek?.(issue.start)}
                        aria-label={`${text('Review moment', 'Verifică momentul')} ${formatDuration(issue.start)}–${formatDuration(issue.end)}`}
                      >
                        {formatDuration(issue.start)}–
                        {formatDuration(issue.end)}
                      </Button>
                    </li>
                  ))}
                </ul>
              </details>
            </li>
          ))}
        </ul>
      )}
      <details className="text-xs">
        <summary className="cursor-pointer font-medium text-muted-foreground">
          {text('Technical report', 'Raport tehnic')}
        </summary>
        <div className="mt-3 space-y-3 break-words">
          <ul className="grid gap-2 sm:grid-cols-2">
            {checks.map(([label, complete]) => (
              <li key={label}>
                {label}:{' '}
                {complete
                  ? text('Checked', 'Verificat')
                  : text('Incomplete', 'Incomplet')}
              </li>
            ))}
          </ul>
          {[...new Set(coverage.incomplete ?? [])].map((reason) => (
            <p key={reason}>{reason}</p>
          ))}
          <ul className="space-y-3">
            {issues.map((issue) => (
              <li key={issue.id} className="space-y-1 pt-2">
                <p>
                  {formatDuration(issue.start)}–{formatDuration(issue.end)} ·{' '}
                  {issue.resolved
                    ? text('Resolved', 'Rezolvat')
                    : text('Unresolved', 'Nerezolvat')}
                </p>
                <p>{issue.evidence}</p>
                {issue.operation && (
                  <p>
                    {text('Suggested repair', 'Reparație sugerată')}:{' '}
                    {issue.operation.replaceAll('_', ' ')}
                  </p>
                )}
                {issue.repair_note && <p>{issue.repair_note}</p>}
              </li>
            ))}
          </ul>
          {attempts.length > 0 && (
            <details>
              <summary className="cursor-pointer">
                {text(
                  'Automatic improvement history',
                  'Istoricul îmbunătățirilor automate'
                )}{' '}
                ({attempts.length})
              </summary>
              <ol className="mt-2 space-y-2">
                {attempts.map((attempt) => (
                  <li
                    key={`${attempt.issue_id}-${attempt.version}-${attempt.operation}-${attempt.accepted}-${attempt.reason}`}
                  >
                    <p>
                      {text('Version', 'Versiunea')} {attempt.version} ·{' '}
                      {attempt.operation.replaceAll('_', ' ')} ·{' '}
                      {attempt.accepted
                        ? text('Accepted', 'Acceptată')
                        : text(
                            'Previous version kept',
                            'Versiunea anterioară păstrată'
                          )}
                    </p>
                    <p>{attempt.reason}</p>
                  </li>
                ))}
              </ol>
            </details>
          )}
        </div>
      </details>
    </section>
  )
}
