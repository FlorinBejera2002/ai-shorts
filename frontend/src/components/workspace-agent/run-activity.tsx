import { useId, useState } from 'react'
import { AnimatePresence, m as motion, useReducedMotion } from 'framer-motion'
import { Check, ChevronDown, Circle, CircleAlert } from 'lucide-react'
import type { AgentRun } from './model'
import type { AgentMessages } from './messages'
import { ActionDetails, ActionTitle } from './action-details'

export function RunActivity({ run, messages: m, ro, connectionLost = false }: { run: AgentRun; messages: AgentMessages; ro: boolean; connectionLost?: boolean }) {
  const [expanded, setExpanded] = useState(false)
  const reducedMotion = useReducedMotion()
  const detailsId = useId()
  const running = ['planning', 'running', 'cancel_requested'].includes(run.status)
  const hasDetails = Boolean(run.action || run.steps?.length)
  const Icon = run.status === 'completed' ? Check : run.status === 'failed' ? CircleAlert : Circle
  const state = connectionLost && running ? (ro ? 'Se reconectează' : 'Reconnecting') : m.statuses[run.status]
  if (!hasDetails && !running && run.status === 'completed') return null
  return <div className="text-xs" data-agent-operation={run.status}>
    <button type="button" disabled={!hasDetails} onClick={() => setExpanded(value => !value)} aria-expanded={hasDetails ? expanded : undefined} aria-controls={hasDetails ? detailsId : undefined} className="flex min-h-8 w-full items-center gap-2 rounded-md py-1 text-left text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default">
      <Icon className="size-3.5 shrink-0" aria-hidden="true" />
      <span className={running && !connectionLost && !reducedMotion ? 'agent-shimmer min-w-0 flex-1 truncate' : 'min-w-0 flex-1 truncate'} role="status" aria-live="polite">
        {running && run.action ? <ActionTitle action={run.action} ro={ro} /> : state}
        {running && connectionLost && run.action && ` · ${state}`}
        {!running && run.steps && run.steps.length > 1 && ` · ${run.steps.length} ${ro ? 'pași' : 'steps'}`}
      </span>
      {hasDetails && <ChevronDown className={`size-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`} aria-hidden="true" />}
    </button>
    <AnimatePresence initial={false}>
      {expanded && <motion.div id={detailsId} initial={{ height: reducedMotion ? 'auto' : 0, opacity: reducedMotion ? 1 : 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: reducedMotion ? 'auto' : 0, opacity: reducedMotion ? 1 : 0 }} transition={{ duration: reducedMotion ? 0 : 0.16 }} className="overflow-hidden">
        <ol className="my-2 space-y-3 border-l pl-3">
          {run.steps?.map((step, index) => <li key={`${index}-${step.action.name}`} className="space-y-1"><p className="font-medium"><ActionTitle action={step.action} ro={ro} /></p>{step.result?.summary && <p className="text-muted-foreground">{step.result.summary}</p>}</li>)}
          {run.action && <li><p className="font-medium"><ActionTitle action={run.action} ro={ro} /></p><ActionDetails action={run.action} ro={ro} /></li>}
        </ol>
        {run.cost_credits > 0 && <p className="pb-2 text-muted-foreground">{run.cost_credits} {m.credits}</p>}
      </motion.div>}
    </AnimatePresence>
  </div>
}
