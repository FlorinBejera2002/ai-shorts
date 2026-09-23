import { Card } from '@/components/ui/card'
import { formatDuration } from '@/lib/youtube'
import type { StoryProject, StoryVersion } from './types'
import { useStoryLanguage } from './use-story-language'

export function StoryReview({
  version,
  attempts = []
}: {
  version: StoryVersion
  attempts?: StoryProject['attempts']
}) {
  const text = useStoryLanguage()
  const coverage = version.report.coverage
  const checks = [
    [text('Story plan', 'Plan narativ'), coverage.plan],
    [text('File integrity', 'Integritatea fișierului'), coverage.file],
    [text('Audio', 'Audio'), coverage.audio],
    [text('Visuals', 'Imagine'), coverage.visual],
    [text('Captions', 'Subtitrări'), coverage.captions],
    [text('Meaning', 'Sens'), coverage.semantics],
    [text('Cut boundaries', 'Puncte de tăiere'), coverage.boundaries]
  ] as const
  const issues = version.report.issues ?? []
  return (
    <Card className="block space-y-4 p-5">
      <h2 className="font-semibold">{text('Quality review', 'Revizie de calitate')}</h2>
      <p className="text-sm text-muted-foreground">
        {version.report.status === 'ready'
          ? text(
              'Required checks completed for this version.',
              'Verificările obligatorii sunt finalizate pentru această versiune.'
            )
          : text(
              'This draft still needs review. Check incomplete checks and unresolved issues before using it.',
              'Acest draft necesită revizie. Verifică controalele incomplete și problemele nerezolvate înainte de utilizare.'
            )}
      </p>
      <ul className="grid gap-2 text-xs sm:grid-cols-2">
        {checks.map(([label, complete]) => (
          <li
            key={label}
            className="flex justify-between gap-3 rounded-sm bg-muted px-2 py-1.5"
          >
            <span>{label}</span>
            <span>
              {complete
                ? text('Checked', 'Verificat')
                : text('Incomplete', 'Incomplet')}
            </span>
          </li>
        ))}
      </ul>
      {(coverage.incomplete ?? []).map((reason, index) => (
        <p key={`${index}-${reason}`} className="text-sm text-muted-foreground">
          {reason}
        </p>
      ))}
      {issues.length > 0 && (
        <ul className="space-y-3">
          {issues.map((issue) => (
            <li key={issue.id} className="rounded-md border p-3">
              <div className="flex flex-wrap gap-2 text-xs">
                <span className="rounded-sm bg-muted px-1.5 py-0.5">
                  {issue.severity}
                </span>
                <span>
                  {formatDuration(issue.start)}–{formatDuration(issue.end)}
                </span>
                <span>
                  {issue.resolved
                    ? text('Resolved', 'Rezolvat')
                    : text('Unresolved', 'Nerezolvat')}
                </span>
              </div>
              <p className="mt-2 text-sm">{issue.evidence}</p>
              {issue.operation && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {text('Suggested repair', 'Reparație sugerată')}:{' '}
                  {issue.operation.replaceAll('_', ' ')}
                </p>
              )}
              {issue.repair_note && (
                <p className="mt-2 text-sm text-muted-foreground">
                  {issue.repair_note}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
      {attempts.length > 0 && (
        <details className="rounded-md border p-3">
          <summary className="cursor-pointer text-sm font-medium">
            {text(
              'Automatic improvement history',
              'Istoricul îmbunătățirilor automate'
            )}{' '}
            ({attempts.length})
          </summary>
          <ol className="mt-3 space-y-3">
            {attempts.map((attempt, index) => (
              <li
                key={`${attempt.issue_id}-${attempt.version}-${index}`}
                className="space-y-1 text-xs"
              >
                <p className="font-medium">
                  {text('Version', 'Versiunea')} {attempt.version} ·{' '}
                  {attempt.operation.replaceAll('_', ' ')} ·{' '}
                  {attempt.accepted
                    ? text('Accepted', 'Acceptată')
                    : text('Previous version kept', 'Versiunea anterioară păstrată')}
                </p>
                <p className="text-muted-foreground">{attempt.reason}</p>
              </li>
            ))}
          </ol>
        </details>
      )}
    </Card>
  )
}
