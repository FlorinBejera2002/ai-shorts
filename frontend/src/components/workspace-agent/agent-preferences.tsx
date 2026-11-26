import { useState } from 'react'
import type { SiteLocale } from '@/lib/site-config'
import { Switch } from '@/components/ui/switch'
import { AgentPill } from './agent-pill'
import type { useWorkspaceAgent } from './use-workspace-agent'
import type { AgentMessages } from './messages'
import styles from './agent-panels.module.css'
import uiStyles from './agent-ui.module.css'

export function AgentPreferences({ agent, messages: m, locale, width, onWidth }: {
  agent: ReturnType<typeof useWorkspaceAgent>; messages: AgentMessages; locale: SiteLocale; width: number; onWidth: (width: number) => void
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
      <AgentPill disabled={agent.preferencesBusy} onClick={() => void agent.savePreferences({ reset: true })}>{{ en: 'Reset preferences', ro: 'Resetează preferințele', es: 'Restablecer preferencias' }[locale]}</AgentPill>
      {!confirmClear && <AgentPill disabled={agent.busy} onClick={() => setConfirmClear(true)}>{{ en: 'Clear finished history', ro: 'Golește istoricul încheiat', es: 'Borrar historial terminado' }[locale]}</AgentPill>}
    </div>
    {confirmClear && <section className={styles.confirm} aria-label={{ en: 'Confirm clearing history', ro: 'Confirmă golirea istoricului', es: 'Confirmar el borrado del historial' }[locale]}>
      <img src="/illustrations/delete.webp" alt="" width={120} height={120} className={styles.confirmImage} draggable={false} />
      <p className={styles.confirmTitle}>{{ en: 'Finished conversations', ro: 'Conversațiile încheiate', es: 'Conversaciones terminadas' }[locale]}</p>
      <p className={styles.muted}>{{ en: 'Projects and files stay', ro: 'Proiectele și fișierele rămân', es: 'Los proyectos y archivos se mantienen' }[locale]}</p>
      <p className={styles.danger}>{{ en: 'This cannot be undone.', ro: 'Nu se poate anula.', es: 'No se puede deshacer.' }[locale]}</p>
      <div className={uiStyles.actions}>
        <AgentPill onClick={() => setConfirmClear(false)}>{{ en: 'Keep', ro: 'Păstrează', es: 'Conservar' }[locale]}</AgentPill>
        <AgentPill variant="danger" disabled={agent.busy} onClick={() => { void agent.clearHistory(); setConfirmClear(false) }}>{{ en: 'Clear history', ro: 'Golește istoricul', es: 'Borrar historial' }[locale]}</AgentPill>
      </div>
    </section>}
  </div>
}
