import type { StoryIssue } from './types'

export type ReviewTopic =
  'captions' | 'audio' | 'visual' | 'story' | 'file' | 'other'

export function reviewTopic(type: string): ReviewTopic {
  if (/caption|transcript/.test(type)) return 'captions'
  if (/audio|speaker|narration/.test(type)) return 'audio'
  if (/visual|crop|framing|b_roll/.test(type)) return 'visual'
  if (/context|meaning|hook|repetition|chronology|material|semantic/.test(type))
    return 'story'
  if (/file|duration|boundary|boundaries|cut/.test(type)) return 'file'
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
