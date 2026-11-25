import { useState } from 'react'
import { Switch } from '@/components/ui/switch'
import { AgentPill } from './agent-pill'
import type { useWorkspaceAgent } from './use-workspace-agent'
import type { AgentMessages } from './messages'
import styles from './agent-panels.module.css'
import uiStyles from './agent-ui.module.css'

export function AgentPreferences({ agent, messages: m, ro, width, onWidth }: {
  agent: ReturnType<typeof useWorkspaceAgent>; messages: AgentMessages; ro: boolean; width: number; onWidth: (width: number) => void
}) {
  const [confirmClear, setConfirmClear] = useState(false)
  return <div className={styles.body}>
    <div className={styles.toggleRow}>
      <span>{m.follow}</span>
      <Switch aria-label={m.follow} checked={agent.follow} disabled={agent.preferencesBusy} onCheckedChange={checked => void agent.savePreferences({ follow: checked })} />
    </div>
    <div className={styles.toggleRow}>
      <span>{m.suggestions}</span>
      <Switch aria-label={m.suggestions} checked={agent.showSuggestions} disabled={agent.preferencesBusy} onCheckedChange={checked => void agent.savePreferences({ recommendations: checked })} />
    </div>
    <label className={styles.sliderRow}>
      <span>{m.width}</span>
      <input aria-label={m.width} type="range" min={320} max={560} step={20} value={width} onChange={event => onWidth(Number(event.target.value))} className={styles.range} />
    </label>
    <div className={uiStyles.actions}>
      <AgentPill disabled={agent.preferencesBusy} onClick={() => void agent.savePreferences({ reset: true })}>{ro ? 'Resetează preferințele' : 'Reset preferences'}</AgentPill>
      {!confirmClear && <AgentPill disabled={agent.busy} onClick={() => setConfirmClear(true)}>{ro ? 'Golește istoricul încheiat' : 'Clear finished history'}</AgentPill>}
    </div>
    {confirmClear && <section className={styles.confirm} aria-label={ro ? 'Confirmă golirea istoricului' : 'Confirm clearing history'}>
      <img src="/illustrations/delete.webp" alt="" width={120} height={120} className={styles.confirmImage} draggable={false} />
      <p className={styles.confirmTitle}>{ro ? 'Conversațiile încheiate' : 'Finished conversations'}</p>
      <p className={styles.muted}>{ro ? 'Proiectele și fișierele rămân' : 'Projects and files stay'}</p>
      <p className={styles.danger}>{ro ? 'Nu se poate anula.' : 'This cannot be undone.'}</p>
      <div className={uiStyles.actions}>
        <AgentPill onClick={() => setConfirmClear(false)}>{ro ? 'Păstrează' : 'Keep'}</AgentPill>
        <AgentPill variant="danger" disabled={agent.busy} onClick={() => { void agent.clearHistory(); setConfirmClear(false) }}>{ro ? 'Golește istoricul' : 'Clear history'}</AgentPill>
      </div>
    </section>}
  </div>
}
