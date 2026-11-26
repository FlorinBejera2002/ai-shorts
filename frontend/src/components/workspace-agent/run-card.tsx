'use client'

import type { ReactNode } from 'react'
import { m as motion, useReducedMotion } from 'framer-motion'
import { ArrowRight, Check, Paperclip, Play, RotateCw, Sparkles, TriangleAlert } from 'lucide-react'
import type { SiteLocale } from '@/lib/site-config'
import { Link } from '@/i18n/navigation'
import { useIsMobile } from '@/hooks/use-mobile'
import { AgentAvatar, AgentIllustration, AgentStatusBadge } from './agent-persona'
import { STATUS_SCENE, type AgentScene } from './agent-scenes'
import { AgentPill } from './agent-pill'
import { agentPillClass } from './agent-pill-class'
import { AgentReply, UserMessage } from './agent-message'
import { ActionTitle } from './action-details'
import { ApprovalPreview } from './approval-preview'
import { isDeleteApproval } from './approval-kinds'
import { ResultDetails } from './result-details'
import { ResultPreview } from './result-preview'
import { RunSteps } from './run-activity'
import { publishingConsentMissing, safeAgentRoute, type Localized } from './model'
import type { AgentCommand, AgentRun } from './model'
import type { AgentMessages } from './messages'
import styles from './run-card.module.css'

type RunResult = NonNullable<AgentRun['result']>

const DELETE_LABELS: Record<string, Localized> = {
  'folders.delete': { en: 'Delete folder', ro: 'Șterge folderul', es: 'Eliminar carpeta' },
  'calendar.delete': { en: 'Delete draft', ro: 'Șterge ciorna', es: 'Eliminar borrador' },
  'studio.renders.delete': { en: 'Delete export', ro: 'Șterge exportul', es: 'Eliminar exportación' },
}

/** Scene for the card's state. Delete approvals show their illustration inside the preview instead. */
function runScene(run: AgentRun, hasResultDetails: boolean): AgentScene | undefined {
  if (run.status === 'completed') {
    if (run.action?.name === 'workspace.open') return 'navigate'
    if (run.context.help_topic) return 'help'
    if (!hasResultDetails && run.result?.undo) return 'done'
    return undefined
  }
  if (run.status === 'waiting_for_confirmation' && isDeleteApproval(run.approval_preview)) return undefined
  return STATUS_SCENE[run.status]
}

/** Deletes and disconnects are danger actions; their label names the target. */
function isDangerApproval(run: AgentRun): boolean {
  return isDeleteApproval(run.approval_preview) || run.action?.name === 'publishing.disconnect'
}

function approveLabel(run: AgentRun, locale: SiteLocale): string {
  const name = run.action?.name ?? ''
  if (name === 'publishing.disconnect') return { en: 'Disconnect', ro: 'Deconectează', es: 'Desconectar' }[locale]
  if (isDeleteApproval(run.approval_preview)) return DELETE_LABELS[name]?.[locale] ?? { en: 'Delete permanently', ro: 'Șterge definitiv', es: 'Eliminar de forma permanente' }[locale]
  return { en: 'Approve action', ro: 'Aprobă acțiunea', es: 'Aprobar acción' }[locale]
}

export function RunCard({ run, messages: m, locale, busy, control, selectProject, uploading, connectionLost = false, onRetry }: {
  run: AgentRun; messages: AgentMessages; locale: SiteLocale; busy: boolean; uploading: boolean; connectionLost?: boolean
  control: (run: AgentRun, command: AgentCommand) => void; selectProject: (id: string) => void
  onRetry: (run: AgentRun) => void
}) {
  const reducedMotion = useReducedMotion()
  const finalStep = run.steps?.at(-1)
  const completedResult = run.status === 'completed' ? run.result ?? finalStep?.result : undefined
  // A failure before any step still gets the card, so it shows the failed scene and Retry.
  const hasOperation = Boolean(run.action || run.steps?.length || run.approval_preview) || run.status === 'failed'
  const response = run.reply || run.result?.summary

  return <motion.div initial={reducedMotion ? false : { opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reducedMotion ? 0 : 0.18 }} className="flex flex-col gap-4 py-2" data-agent-run={run.id}>
    <UserMessage text={run.message} />
    {hasOperation && <OperationCard run={run} messages={m} locale={locale} busy={busy} uploading={uploading} connectionLost={connectionLost} completedResult={completedResult} control={control} selectProject={selectProject} onRetry={onRetry} />}
    {run.error && !hasOperation && <p role="alert" className="text-xs text-destructive">{run.error}</p>}
    {response && <AgentReply text={response} locale={locale} undoBusy={busy} onUndo={run.status === 'completed' && run.result?.undo ? () => control(run, 'undo') : undefined} />}
  </motion.div>
}

type OperationProps = {
  run: AgentRun; messages: AgentMessages; locale: SiteLocale; busy: boolean; uploading: boolean; connectionLost: boolean
  completedResult: RunResult | undefined; control: (run: AgentRun, command: AgentCommand) => void
  selectProject: (id: string) => void; onRetry: (run: AgentRun) => void
}

function OperationCard({ run, messages: m, locale, busy, uploading, connectionLost, completedResult, control, selectProject, onRetry }: OperationProps) {
  const running = ['planning', 'running', 'cancel_requested'].includes(run.status)
  const resultAction = run.action?.name ?? run.steps?.at(-1)?.action.name

  return <article className={styles.card} data-agent-operation={run.status}>
    <OperationHeader run={run} messages={m} locale={locale} reconnecting={connectionLost && running} />
    <OperationScene run={run} hasResult={Boolean(completedResult?.data)} />
    <RunSteps run={run} locale={locale} shimmer={running && !connectionLost} />
    {run.error && <p role="alert" className={styles.warning}><TriangleAlert aria-hidden="true" />{run.error}</p>}
    {run.status === 'waiting_for_confirmation' && run.approval_preview && <ApprovalPreview value={run.approval_preview} locale={locale} />}
    {run.status === 'waiting_for_resources' && <MissingResources run={run} locale={locale} disabled={busy || uploading} selectProject={selectProject} />}
    {completedResult && <div className={styles.result} data-agent-result>
      <ResultDetails action={resultAction} data={completedResult.data} locale={locale} />
      <ResultPreview run={run} locale={locale} />
    </div>}
    {run.cost_credits > 0 && <span className={styles.credits}><Sparkles aria-hidden="true" />{run.cost_credits} {m.credits}</span>}
    <RunControls run={run} locale={locale} busy={busy} uploading={uploading} control={control} onRetry={onRetry} messages={m} />
  </article>
}

function OperationHeader({ run, messages: m, locale, reconnecting }: { run: AgentRun; messages: AgentMessages; locale: SiteLocale; reconnecting: boolean }) {
  const statusLabel = reconnecting ? { en: 'Reconnecting', ro: 'Se reconectează', es: 'Reconectando' }[locale] : m.statuses[run.status]
  return <div className={styles.header}>
    <AgentAvatar size={24} typing={run.status === 'planning'} />
    <h3 className={styles.title}>{run.action ? <ActionTitle action={run.action} locale={locale} /> : m.title}</h3>
    <AgentStatusBadge status={run.status} label={statusLabel} />
  </div>
}

function OperationScene({ run, hasResult }: { run: AgentRun; hasResult: boolean }) {
  const isMobile = useIsMobile()
  const scene = runScene(run, hasResult)
  return scene ? <div className="flex justify-center"><AgentIllustration scene={scene} size={isMobile ? 96 : 88} /></div> : null
}

function MissingResources({ run, locale, disabled, selectProject }: { run: AgentRun; locale: SiteLocale; disabled: boolean; selectProject: (id: string) => void }) {
  return <ul className="flex flex-col gap-2">
    {run.missing_resources?.map(resource => <li key={`${resource.kind}:${resource.target_id ?? ''}:${resource.label}`} className={styles.missingRow}>
      <Paperclip aria-hidden="true" />
      <span className={styles.missingLabel}>{resource.label}</span>
      {resource.target_id && ['video', 'videos'].includes(resource.kind) && <AgentPill variant="secondary" disabled={disabled} onClick={() => selectProject(resource.target_id!)}>{{ en: 'Attach recordings', ro: 'Atașează filmări', es: 'Adjuntar grabaciones' }[locale]}</AgentPill>}
    </li>)}
  </ul>
}

function RunControls({ run, locale, busy, uploading, control, onRetry, messages: m }: {
  run: AgentRun; locale: SiteLocale; busy: boolean; uploading: boolean
  control: (run: AgentRun, command: AgentCommand) => void; onRetry: (run: AgentRun) => void; messages: AgentMessages
}) {
  // An intermediate step's route is not the outcome; link to it only once the run stops working.
  const working = ['planning', 'running', 'cancel_requested'].includes(run.status)
  const destination = working ? undefined : safeAgentRoute(run.result?.route)
  const stop = <AgentPill variant="ghost" fill disabled={busy} onClick={() => control(run, 'stop')}>{m.stop}</AgentPill>
  const approvalDisabled = busy || publishingConsentMissing(run.approval_preview) || (uploading && run.action?.name === 'stories.generate')
  const buttons: ReactNode = (() => {
    switch (run.status) {
      case 'waiting_for_confirmation': {
        const danger = isDangerApproval(run)
        return <>
          <AgentPill variant="secondary" fill disabled={busy} onClick={() => control(run, 'reject')}>{m.reject}</AgentPill>
          <AgentPill variant={danger ? 'danger' : 'primary'} fill disabled={approvalDisabled} onClick={() => control(run, 'approve')}>{!danger && <Check aria-hidden="true" />}{approveLabel(run, locale)}</AgentPill>
        </>
      }
      case 'planning':
      case 'running':
        return <><AgentPill variant="secondary" fill disabled={busy} onClick={() => control(run, 'pause')}>{m.pause}</AgentPill>{stop}</>
      case 'paused':
        return <><AgentPill variant="primary" fill disabled={busy} onClick={() => control(run, 'resume')}><Play aria-hidden="true" />{m.resume}</AgentPill>{stop}</>
      case 'waiting_for_resources':
        return <><AgentPill variant="primary" fill disabled={busy || uploading} onClick={() => control(run, 'resume')}>{{ en: 'Check and continue', ro: 'Verifică și continuă', es: 'Revisar y continuar' }[locale]}</AgentPill>{stop}</>
      case 'failed':
        return <AgentPill variant="primary" fill disabled={busy} onClick={() => onRetry(run)}><RotateCw aria-hidden="true" />{{ en: 'Retry', ro: 'Reîncearcă', es: 'Reintentar' }[locale]}</AgentPill>
      default:
        return null
    }
  })()
  if (!buttons && !destination) return null
  return <div className={styles.buttons}>
    {buttons}
    {destination && <Link href={destination} className={agentPillClass('primary', true)}>{m.result}<ArrowRight aria-hidden="true" /></Link>}
  </div>
}
