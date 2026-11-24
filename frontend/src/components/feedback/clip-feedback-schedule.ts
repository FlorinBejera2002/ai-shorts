/**
 * When the clip rating prompt may appear, kept per browser so it never nags: once per job,
 * then a pause after an answer (2 days) and a longer one after "Not now" (7 days).
 * Storage can be missing (private windows); the prompt then simply shows once per page view.
 */
const STORAGE_KEY = 'sneepcut.clip-feedback'
const DAY_MS = 24 * 60 * 60 * 1000
export const ANSWERED_PAUSE_MS = 2 * DAY_MS
export const DISMISSED_PAUSE_MS = 7 * DAY_MS
const REMEMBERED_JOBS = 50

type ScheduleStorage = Pick<Storage, 'getItem' | 'setItem'>

interface Schedule {
  jobs: string[]
  pausedUntil: number
}

function browserStorage(): ScheduleStorage | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

function read(storage: ScheduleStorage | null): Schedule {
  try {
    const parsed = JSON.parse(storage?.getItem(STORAGE_KEY) ?? '{}') as Partial<Schedule>
    return {
      jobs: Array.isArray(parsed.jobs) ? parsed.jobs.filter((id) => typeof id === 'string') : [],
      pausedUntil: typeof parsed.pausedUntil === 'number' ? parsed.pausedUntil : 0
    }
  } catch {
    return { jobs: [], pausedUntil: 0 }
  }
}

export function shouldAskClipFeedback(jobId: string, now = Date.now(), storage = browserStorage()) {
  const schedule = read(storage)
  return !schedule.jobs.includes(jobId) && schedule.pausedUntil <= now
}

/** Records that this job was answered or dismissed and pauses the prompt. */
export function settleClipFeedback(
  jobId: string,
  outcome: 'answered' | 'dismissed',
  now = Date.now(),
  storage = browserStorage()
) {
  const schedule = read(storage)
  const next: Schedule = {
    jobs: [jobId, ...schedule.jobs.filter((id) => id !== jobId)].slice(0, REMEMBERED_JOBS),
    pausedUntil: now + (outcome === 'answered' ? ANSWERED_PAUSE_MS : DISMISSED_PAUSE_MS)
  }
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // Without storage the prompt is only asked again on a later visit.
  }
}
