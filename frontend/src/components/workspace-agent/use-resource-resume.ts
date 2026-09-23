import { useEffect, useRef } from 'react'
import type { AgentRun, AgentResource } from './model'
import type { PendingUpload } from '@/components/story/use-story-uploads'

export function useResourceResume({ runs, projectId, items, uploading, resources, completedBatch, pending, busy, resume }: {
  runs: AgentRun[]; projectId?: string; items: PendingUpload[]; uploading: boolean; resources: AgentResource[]; completedBatch: number; pending: boolean; busy: boolean; resume: (run: AgentRun) => void
}) {
  const batch = useRef<{ project?: string; key: string } | null>(null)
  const attachmentRevision = useRef(completedBatch)
  const attempted = useRef(new Set<string>())
  useEffect(() => {
    const key = items.map(item => item.id).join('|')
    if (uploading) { batch.current = { project: projectId, key }; return }
    const videosFinished = Boolean(batch.current && batch.current.project === projectId && batch.current.key === key && items.length > 0 && items.every(item => item.status === 'complete'))
    const attachmentsFinished = completedBatch > attachmentRevision.current
    if (pending || busy) return
    attachmentRevision.current = completedBatch
    batch.current = null
    if (!videosFinished && !attachmentsFinished) return
    const candidates = runs.filter(run => run.status === 'waiting_for_resources' && Boolean(run.missing_resources?.length) && run.missing_resources!.every(need => {
      if (['videos', 'video'].includes(need.kind)) return need.target_id === projectId && items.length > 0 && items.every(item => item.status === 'complete')
      return resources.some(resource => resource.kind === need.kind && (!resource.project_id || resource.project_id === run.context.project_id))
    }))
    if (candidates.length !== 1) return
    const run = candidates[0]; const attempt = `${run.id}:${run.revision}`
    if (attempted.current.has(attempt)) return
    attempted.current.add(attempt); resume(run)
  }, [runs, projectId, items, uploading, resources, completedBatch, pending, busy, resume])
}
