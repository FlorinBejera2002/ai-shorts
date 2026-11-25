import { useState } from 'react'
import { toast } from '@/lib/toast'
import { ActionDetails } from './action-details'
import { agentApi } from './api'
import { AgentPill } from './agent-pill'
import type { AgentMessages } from './messages'
import type { Suggestion } from './model'
import styles from './suggestion-card.module.css'

export function SuggestionCard({ original, messages: m, disabled, onAccept, onDismiss }: {
  original: Suggestion; messages: AgentMessages; disabled: boolean
  onAccept: (suggestion: Suggestion) => void; onDismiss: (id: string) => void
}) {
  const [revised, setRevised] = useState<Suggestion>()
  const [explained, setExplained] = useState(false)
  const [editing, setEditing] = useState(false)
  const [instruction, setInstruction] = useState('')
  const [pending, setPending] = useState(false)
  const suggestion = revised ?? original
  const ro = m.send === 'Trimite'
  async function revise() {
    if (pending || !instruction.trim()) return
    setPending(true)
    try { setRevised(await agentApi.revise(suggestion.id, instruction.trim())); setEditing(false); setInstruction('') }
    catch (cause) { toast.error(cause instanceof Error ? cause.message : m.error) }
    finally { setPending(false) }
  }
  return <article className={styles.card}>
    <div className={styles.header}>
      <h4 className={styles.title}>{suggestion.title}</h4>
      {suggestion.cost_credits > 0 && <span className={styles.credits}>{suggestion.cost_credits} {m.credits}</span>}
    </div>
    {explained && <div className={styles.details}>
      <p>{suggestion.description}</p>
      {suggestion.missing_resources.length > 0 && <p>{m.missing}: {suggestion.missing_resources.join(', ')}</p>}
      <ActionDetails action={suggestion.action} ro={ro} />
    </div>}
    {editing && <div className={styles.revise}>
      <label className={styles.label} htmlFor={`${suggestion.id}-revise`}>{ro ? 'Ce vrei să schimbi?' : 'What would you change?'}</label>
      <textarea id={`${suggestion.id}-revise`} value={instruction} onChange={event => setInstruction(event.target.value)} rows={2} maxLength={2000} className={styles.textarea} />
      <AgentPill variant="secondary" disabled={pending || !instruction.trim()} onClick={() => void revise()}>{ro ? 'Revizuiește sugestia' : 'Revise suggestion'}</AgentPill>
    </div>}
    <div className={styles.actions}>
      <AgentPill variant="primary" fill disabled={disabled || pending || editing} onClick={() => onAccept(suggestion)}>{m.doIt}</AgentPill>
      <AgentPill variant="ghost" disabled={pending} aria-expanded={explained} onClick={() => setExplained(value => !value)}>{m.explain}</AgentPill>
      <AgentPill variant="secondary" disabled={pending} aria-expanded={editing} onClick={() => setEditing(value => !value)}>{ro ? 'Modifică' : 'Edit'}</AgentPill>
      <AgentPill variant="ghost" disabled={pending} onClick={() => onDismiss(suggestion.id)}>{m.dismiss}</AgentPill>
    </div>
  </article>
}
