import { useState } from 'react'
import { Button } from '@/components/ui/button'
import type { useWorkspaceAgent } from './use-workspace-agent'
import type { AgentMessages } from './messages'

export function AgentPreferences({ agent, messages: m, ro, width, onWidth }: {
  agent: ReturnType<typeof useWorkspaceAgent>; messages: AgentMessages; ro: boolean; width: number; onWidth: (width: number) => void
}) {
  const [confirmClear, setConfirmClear] = useState(false)
  return <div className="space-y-4 text-xs">
    <label className="flex items-center gap-2"><input type="checkbox" checked={agent.follow} disabled={agent.preferencesBusy} onChange={event => void agent.savePreferences({ follow: event.target.checked })} />{m.follow}</label>
    <label className="flex items-center gap-2"><input type="checkbox" checked={agent.showSuggestions} disabled={agent.preferencesBusy} onChange={event => void agent.savePreferences({ recommendations: event.target.checked })} />{m.suggestions}</label>
    <label className="hidden space-y-2 md:block"><span>{m.width}</span><input aria-label={m.width} type="range" min={320} max={560} step={20} value={width} onChange={event => onWidth(Number(event.target.value))} className="block w-full" /></label>
    <Button variant="outline" size="sm" disabled={agent.preferencesBusy} onClick={() => void agent.savePreferences({ reset: true })}>{ro ? 'Resetează preferințele' : 'Reset preferences'}</Button>
    <div className="space-y-2 border-t pt-3">
      <p className="text-muted-foreground">{ro ? 'Golește conversațiile încheiate. Proiectele, fișierele și activitățile curente rămân.' : 'Clear finished conversations. Projects, files and ongoing work remain.'}</p>
      {confirmClear ? <div className="space-y-2"><p>{ro ? 'Ștergi conversațiile încheiate din istoric?' : 'Remove finished conversations from history?'}</p><div className="flex gap-2"><Button size="sm" disabled={agent.busy} onClick={() => { void agent.clearHistory(); setConfirmClear(false) }}>{ro ? 'Golește istoricul' : 'Clear history'}</Button><Button variant="ghost" size="sm" onClick={() => setConfirmClear(false)}>{ro ? 'Păstrează' : 'Keep history'}</Button></div></div> : <Button variant="outline" size="sm" disabled={agent.busy} onClick={() => setConfirmClear(true)}>{ro ? 'Golește istoricul încheiat' : 'Clear finished history'}</Button>}
    </div>
  </div>
}
