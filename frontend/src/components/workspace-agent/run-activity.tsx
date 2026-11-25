'use client'

import { useId, useState } from 'react'
import { Check, Pause, X } from 'lucide-react'
import type { AgentRun, AgentStatus } from './model'
import { ActionDetails, ActionTitle } from './action-details'
import styles from './run-card.module.css'

type StepState = 'done' | 'current' | 'todo' | 'failed' | 'paused'

/** The state of the run's current action, derived from the run status. */
const CURRENT_STEP_STATE: Partial<Record<AgentStatus, StepState>> = {
  planning: 'current', running: 'current', cancel_requested: 'current',
  waiting_for_confirmation: 'todo', waiting_for_resources: 'todo', cancelled: 'todo',
  paused: 'paused', failed: 'failed', completed: 'done'
}

/** Steps list: finished steps from `run.steps`, then the run's current action in its status state. `shimmer` animates the current step's title while the run works. */
export function RunSteps({ run, ro, shimmer = false }: { run: AgentRun; ro: boolean; shimmer?: boolean }) {
  const current = run.action ? CURRENT_STEP_STATE[run.status] ?? 'todo' : undefined
  const finished = run.steps ?? []
  if (!finished.length && !run.action) return null
  return <div className="flex flex-col gap-2">
    <ol className={styles.steps} aria-label={ro ? 'Pași' : 'Steps'}>
      {finished.map(step => <li key={`${step.action.name}-${JSON.stringify(step.action.input)}`} className={styles.step}>
        <StepMarker state="done" />
        <span className={styles.stepText}><ActionTitle action={step.action} ro={ro} /></span>
      </li>)}
      {run.action && current && <li className={styles.step} data-agent-operation={run.status}>
        <StepMarker state={current} />
        <span className={shimmer && current === 'current' ? `${styles.stepText} agent-shimmer` : styles.stepText}><ActionTitle action={run.action} ro={ro} /></span>
      </li>}
    </ol>
    <StepDetails run={run} ro={ro} />
  </div>
}

function StepMarker({ state }: { state: StepState }) {
  return <span className={styles.marker} data-state={state} aria-hidden="true">
    {state === 'done' && <Check />}
    {state === 'failed' && <X />}
    {state === 'paused' && <Pause />}
  </span>
}

/** Expandable input details for the run's action and step summaries. */
function StepDetails({ run, ro }: { run: AgentRun; ro: boolean }) {
  const [expanded, setExpanded] = useState(false)
  const detailsId = useId()
  const summaries = (run.steps ?? []).filter(step => step.result?.summary)
  if (!run.action && !summaries.length) return null
  return <div>
    <button type="button" className={styles.detailsToggle} aria-expanded={expanded} aria-controls={detailsId} onClick={() => setExpanded(value => !value)}>
      {expanded ? (ro ? 'Ascunde detaliile' : 'Hide details') : (ro ? 'Arată detaliile' : 'Show details')}
    </button>
    {expanded && <div id={detailsId} className={`${styles.details} mt-2`}>
      {summaries.map(step => <p key={step.result?.summary}>{step.result?.summary}</p>)}
      {run.action && <ActionDetails action={run.action} ro={ro} />}
    </div>}
  </div>
}
