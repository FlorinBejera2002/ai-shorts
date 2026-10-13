import { useState } from 'react'
import { m as motion, useReducedMotion } from 'framer-motion'
import { Check, Copy, Undo2 } from 'lucide-react'
import { Link } from '@/i18n/navigation'
import { Button } from '@/components/ui/button'
import { safeAgentRoute, publishingConsentMissing } from './model'
import type { AgentCommand, AgentRun } from './model'
import type { AgentMessages } from './messages'
import { ActionDetails, ActionTitle } from './action-details'
import { ResultDetails } from './result-details'
import { ResultPreview } from './result-preview'
import { ApprovalPreview } from './approval-preview'
import { RunActivity } from './run-activity'

export function RunCard({ run, messages: m, busy, control, selectProject, uploading, connectionLost = false }: {
  run: AgentRun; messages: AgentMessages; busy: boolean; uploading: boolean; connectionLost?: boolean
  control: (run: AgentRun, command: AgentCommand) => void; selectProject: (id: string) => void
}) {
  const reducedMotion = useReducedMotion()
  const [copied, setCopied] = useState(false)
  const [copyError, setCopyError] = useState(false)
  const destination = safeAgentRoute(run.result?.route)
  const ro = m.send === 'Trimite'
  const active = ['planning', 'running', 'waiting_for_resources', 'paused'].includes(run.status)
  const finalStep = run.steps?.at(-1)
  const summary = run.result?.summary
  const response = run.reply || summary
  const completedResult = run.status === 'completed' ? run.result ?? finalStep?.result : undefined
  async function copyResponse() {
    try { await navigator.clipboard.writeText(response ?? ''); setCopied(true); setCopyError(false) }
    catch { setCopyError(true) }
  }

  return <motion.article initial={reducedMotion ? false : { opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reducedMotion ? 0 : 0.18 }} className="agent-message space-y-4 py-4" data-agent-run={run.id}>
    <p className="ml-5 whitespace-pre-wrap break-words rounded-md bg-muted px-3.5 py-3 text-sm leading-relaxed">{run.message}</p>
    <div className="space-y-3">
      <RunActivity run={run} messages={m} ro={ro} connectionLost={connectionLost} />
      {response && <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{response}</p>}
      {completedResult && <motion.div initial={reducedMotion ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: reducedMotion ? 0 : 0.18 }} className="space-y-3" data-agent-result>
        <ResultDetails action={run.action?.name ?? finalStep?.action.name} data={completedResult.data} ro={ro} />
        <ResultPreview run={run} ro={ro} />
      </motion.div>}
      {run.error && <p role="alert" className="text-sm text-destructive">{run.error}</p>}
      {run.status === 'waiting_for_confirmation' && <section className="space-y-3 rounded-md border p-3" aria-label={m.confirmation}>
        {run.approval_preview ? <ApprovalPreview value={run.approval_preview} ro={ro} /> : run.action && <div><p className="text-sm font-medium"><ActionTitle action={run.action} ro={ro} /></p><ActionDetails action={run.action} ro={ro} /></div>}
        {run.cost_credits > 0 && <p className="text-xs text-muted-foreground">{run.cost_credits} {m.credits}</p>}
        <div className="flex flex-wrap gap-2">
          <Button size="sm" disabled={busy || publishingConsentMissing(run.approval_preview) || (uploading && run.action?.name === 'stories.generate')} onClick={() => control(run, 'approve')}>{m.approve}</Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => control(run, 'reject')}>{m.reject}</Button>
        </div>
      </section>}
      {run.status === 'waiting_for_resources' && <ul className="space-y-2 text-xs">{run.missing_resources?.map((resource, index) => <li key={`${resource.kind}-${index}`}><p>{resource.label}</p>{resource.target_id && ['video', 'videos'].includes(resource.kind) && <Button size="sm" variant="outline" disabled={busy || uploading} onClick={() => selectProject(resource.target_id!)}>{ro ? 'Atașează filmări' : 'Attach recordings'}</Button>}</li>)}</ul>}
      {(active || destination) && <div className="flex flex-wrap gap-2">
        {active && <>
          {run.status !== 'waiting_for_resources' && <Button size="sm" variant="outline" disabled={busy} onClick={() => control(run, run.status === 'paused' ? 'resume' : 'pause')}>{run.status === 'paused' ? m.resume : m.pause}</Button>}
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => control(run, 'stop')}>{m.stop}</Button>
        </>}
        {destination && <Button size="sm" variant="outline" asChild><Link href={destination}>{m.result}</Link></Button>}
        {run.status === 'waiting_for_resources' && <Button size="sm" variant="outline" disabled={busy || uploading} onClick={() => control(run, 'resume')}>{ro ? 'Verifică și continuă' : 'Check and continue'}</Button>}
      </div>}
      {Boolean(response || run.result?.undo) && <div className="agent-message-actions flex min-h-8 items-center gap-1" aria-label={ro ? 'Acțiuni mesaj' : 'Message actions'}>
        {response && <Button size="icon" variant="ghost" className="size-8" onClick={() => void copyResponse()} aria-label={copied ? (ro ? 'Copiat' : 'Copied') : (ro ? 'Copiază răspunsul' : 'Copy response')} title={ro ? 'Copiază răspunsul' : 'Copy response'}>{copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}</Button>}
        {run.status === 'completed' && Boolean(run.result?.undo) && <Button size="sm" variant="ghost" disabled={busy} onClick={() => control(run, 'undo')}><Undo2 className="mr-1 size-3.5" />{ro ? 'Anulează modificarea' : 'Undo change'}</Button>}
        {copyError && <span role="alert" className="text-xs text-destructive">{ro ? 'Copierea a eșuat.' : 'Copy failed.'}</span>}
      </div>}
    </div>
  </motion.article>
}
