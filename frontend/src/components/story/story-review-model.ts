import type { StoryIssue, StoryVersion } from './types'

export type ReviewTopic =
  | 'captions'
  | 'audio'
  | 'visual'
  | 'story'
  | 'file'
  | 'other'

export function reviewTopic(type: string): ReviewTopic {
  if (/caption|transcript/.test(type)) return 'captions'
  if (/audio|speaker|narration|lip_sync/.test(type)) return 'audio'
  if (/visual|crop|framing|b_roll/.test(type)) return 'visual'
  if (/context|meaning|hook|repetition|chronology|material|semantic/.test(type))
    return 'story'
  if (/file|duration|boundary|boundaries|cut|transition/.test(type))
    return 'file'
  return 'other'
}

const severityRank: Record<string, number> = {
  critical: 3,
  major: 2,
  minor: 1
}

function readableEvidence(evidence: string) {
  const value = evidence.trim()
  const technical =
    /audio_score|lexical|probability|candidate|b_roll|source_id|retained phrase|['"](?:text|reason|role)['"]|[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}/i
  return value.length <= 280 && !technical.test(value) ? value : ''
}

// Keep the original findings intact for diagnostics. Group only the customer
// presentation, without treating missing coverage as proof of a media defect.
export function groupReviewIssues(issues: StoryIssue[]) {
  const groups = new Map<ReviewTopic, StoryIssue[]>()
  for (const issue of issues) {
    if (issue.resolved) continue
    const topic = reviewTopic(issue.type)
    groups.set(topic, [...(groups.get(topic) ?? []), issue])
  }
  return [...groups]
    .map(([topic, findings]) => ({
      topic,
      issues: findings,
      descriptions: [
        ...new Set(
          findings
            .map((issue) => readableEvidence(issue.evidence))
            .filter(Boolean)
        )
      ].slice(0, 3),
      severity: findings.reduce(
        (highest, issue) =>
          (severityRank[issue.severity] ?? 0) > (severityRank[highest] ?? 0)
            ? issue.severity
            : highest,
        'minor'
      )
    }))
    .sort(
      (a, b) =>
        (severityRank[b.severity] ?? 0) - (severityRank[a.severity] ?? 0)
    )
}

/** Missing model coverage is diagnostic information, not proof of a defect. */
export function customerReviewIssues(version: StoryVersion) {
  const coverage = version.report.coverage
  const seen = new Set<string>()
  const warnings: StoryIssue[] = version.output?.caption_warnings?.length
    ? [
        {
          id: 'caption-unavailable',
          type: 'caption_unavailable',
          severity: 'major',
          start: 0,
          end: 0,
          evidence: '',
          resolved: false
        }
      ]
    : []
  return [...warnings, ...(version.report.issues ?? [])].filter((issue) => {
    if (issue.resolved || !['major', 'critical'].includes(issue.severity))
      return false
    const topic = reviewTopic(issue.type)
    const concrete =
      /^(caption_unavailable|required_source|source|empty|file|file_integrity|duration|missing_audio|missing_asset)$/.test(
        issue.type
      )
    const verified = /^(transition|boundary|boundaries)$/.test(issue.type)
      ? coverage.boundaries
      : topic === 'captions'
        ? coverage.captions
        : topic === 'audio'
          ? coverage.audio
          : topic === 'visual'
            ? coverage.visual
            : topic === 'story'
              ? coverage.semantics
              : topic === 'file'
                ? coverage.file
                : false
    if ((!concrete && !verified) || seen.has(topic)) return false
    seen.add(topic)
    return true
  })
}
