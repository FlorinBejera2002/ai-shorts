import { Link } from '@/i18n/navigation'
import { Button } from '@/components/ui/button'
import { safeAgentRoute, publishingConsentMissing } from './model'
import type { AgentCommand, AgentRun } from './model'
import type { AgentMessages } from './messages'
import { ActionDetails, ActionTitle } from './action-details'
import { ResultDetails } from './result-details'
import { ResultPreview } from './result-preview'
import { ApprovalPreview } from './approval-preview'

export function RunCard({ run, messages: m, busy, control, selectProject, uploading }: {
  run: AgentRun; messages: AgentMessages; busy: boolean; uploading: boolean; control: (run: AgentRun, command: AgentCommand) => void; selectProject: (id: string) => void
}) {
  const destination = safeAgentRoute(run.result?.route)
  const ro = m.send === 'Trimite'
  const active = ['planning', 'running', 'waiting_for_resources', 'paused'].includes(run.status)
  const projectId = run.action?.name === 'stories.create' ? run.result?.data?.id : run.steps?.find(step => step.action.name === 'stories.create')?.result?.data?.id
  return <article className="space-y-3 border-b py-5" data-agent-run={run.id}>
    <p className="whitespace-pre-wrap break-words rounded-md bg-muted p-3 text-sm">{run.message}</p>
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs font-medium">Workspace Agent</span>
      <span className="rounded-sm bg-muted px-2 py-1 text-[11px]" role="status">{m.statuses[run.status]}</span>
    </div>
    {run.reply && <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{run.reply}</p>}
    {run.steps?.map((step, index) => <div key={`${index}-${step.action.name}`} className="space-y-2 rounded-md border p-3 text-xs"><p className="font-medium"><ActionTitle action={step.action} ro={ro} /></p>{step.result?.summary && <p className="mt-1 text-muted-foreground">{step.result.summary}</p>}<ResultDetails action={step.action.name} data={step.result?.data} ro={ro} /></div>)}
    {run.action && <details className="rounded-md border p-3 text-xs" open={run.status === 'waiting_for_confirmation'}>
      <summary className="cursor-pointer font-medium"><ActionTitle action={run.action} ro={ro} /></summary>
      <ActionDetails action={run.action} ro={ro} />
      <p className="mt-2">{run.cost_credits} {m.credits}</p>
    </details>}
    {run.result?.summary && <p className="text-sm">{run.result.summary}</p>}
    <ResultDetails action={run.action?.name} data={run.result?.data} ro={ro} />
    <ResultPreview run={run} ro={ro} />
    {run.error && <p role="alert" className="text-sm text-destructive">{run.error}</p>}
    {run.status === 'waiting_for_confirmation' && <div className="space-y-2 rounded-md border p-3">
      {run.approval_preview && <ApprovalPreview value={run.approval_preview} ro={ro} />}
      <p className="text-xs text-muted-foreground">{m.confirmation}</p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={busy || publishingConsentMissing(run.approval_preview) || (uploading && run.action?.name === 'stories.generate')} onClick={() => control(run, 'approve')}>{m.approve}</Button>
        <Button size="sm" variant="outline" disabled={busy} onClick={() => control(run, 'reject')}>{m.reject}</Button>
      </div>
    </div>}
    <div className="flex flex-wrap gap-2">
      {active && <>
        {run.status !== 'waiting_for_resources' && <Button size="sm" variant="outline" disabled={busy} onClick={() => control(run, run.status === 'paused' ? 'resume' : 'pause')}>{run.status === 'paused' ? m.resume : m.pause}</Button>}
        <Button size="sm" variant="outline" disabled={busy} onClick={() => control(run, 'stop')}>{m.stop}</Button>
      </>}
      {destination && <Button size="sm" variant="outline" asChild><Link href={destination}>{m.result}</Link></Button>}
      {run.status === 'completed' && Boolean(run.result?.undo) && <Button size="sm" variant="outline" disabled={busy} onClick={() => control(run, 'undo')}>{ro ? 'Anulează ultima modificare' : 'Undo last change'}</Button>}
      {typeof projectId === 'string' && <Button size="sm" variant="outline" disabled={busy || uploading} onClick={() => selectProject(projectId)}>{ro ? 'Atașează filmări' : 'Attach recordings'}</Button>}
      {run.status === 'waiting_for_resources' && <Button size="sm" variant="outline" disabled={busy || uploading} onClick={() => control(run, 'resume')}>{ro ? 'Verifică resursele și continuă' : 'Check resources and continue'}</Button>}
    </div>
    {run.status === 'waiting_for_resources' && <ul className="space-y-2 text-xs">{run.missing_resources?.map((resource, index) => <li key={`${resource.kind}-${index}`}><p>{resource.label}</p>{resource.target_id && ['video', 'videos'].includes(resource.kind) && <Button size="sm" variant="outline" disabled={busy || uploading} onClick={() => selectProject(resource.target_id!)}>{ro ? 'Atașează filmări' : 'Attach recordings'}</Button>}</li>)}</ul>}
  </article>
}
