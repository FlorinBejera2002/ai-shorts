import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { ActionDetails } from './action-details'
import { agentApi } from './api'
import type { AgentMessages } from './messages'
import type { Suggestion } from './model'

export function SuggestionCard({ original, messages: m, disabled, onAccept, onDismiss }: {
  original: Suggestion; messages: AgentMessages; disabled: boolean
  onAccept: (suggestion: Suggestion) => void; onDismiss: (id: string) => void
}) {
  const [revised, setRevised] = useState<Suggestion>()
  const [editing, setEditing] = useState(false)
  const [instruction, setInstruction] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const suggestion = revised ?? original
  const ro = m.send === 'Trimite'
  async function revise() {
    if (pending || !instruction.trim()) return
    setPending(true); setError('')
    try { setRevised(await agentApi.revise(suggestion.id, instruction.trim())); setEditing(false); setInstruction('') }
    catch (cause) { setError(cause instanceof Error ? cause.message : m.error) }
    finally { setPending(false) }
  }
  return <article className="space-y-3 rounded-md border p-3">
    <h4 className="text-sm font-medium">{suggestion.title}</h4>
    <details className="text-xs text-muted-foreground"><summary className="cursor-pointer">{m.explain}</summary><p className="mt-2 leading-relaxed">{suggestion.description}</p><ActionDetails action={suggestion.action} ro={ro} /></details>
    <p className="text-xs text-muted-foreground">{suggestion.cost_credits} {m.credits}</p>
    {suggestion.missing_resources.length > 0 && <p className="text-xs">{m.missing}: {suggestion.missing_resources.join(', ')}</p>}
    {editing && <div className="space-y-2">
      <label className="block text-xs">{ro ? 'Ce vrei să schimbi?' : 'What would you change?'}<textarea value={instruction} onChange={event => setInstruction(event.target.value)} rows={2} maxLength={2000} className="mt-2 w-full rounded-md border bg-background p-2 text-sm" /></label>
      <p className="text-xs text-muted-foreground">{ro ? 'Verifică sugestia revizuită înainte de execuție.' : 'Review the revised suggestion before executing it.'}</p>
      <Button size="sm" variant="outline" disabled={pending || !instruction.trim()} onClick={() => void revise()}>{ro ? 'Revizuiește sugestia' : 'Revise suggestion'}</Button>
    </div>}
    {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
    <div className="flex flex-wrap gap-2">
      <Button size="sm" disabled={disabled || pending || editing} onClick={() => onAccept(suggestion)}>{m.doIt}</Button>
      <Button size="sm" variant="outline" disabled={pending} aria-expanded={editing} onClick={() => setEditing(!editing)}>{ro ? 'Modifică' : 'Edit'}</Button>
      <Button size="sm" variant="ghost" disabled={pending} onClick={() => onDismiss(suggestion.id)}>{m.dismiss}</Button>
    </div>
  </article>
}
