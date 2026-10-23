import { Button } from '@/components/ui/button'
import { LoadingIndicator } from '@/components/ui/loading-indicator'
import { ChevronDown, Monitor, Smartphone } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { SettingsPanelFeedback } from './settings-panel-status'
import type { SettingsPanelsController } from './use-settings-panels'
import styles from './settings-panels.module.css'

export function SettingsSessionsPanel({
  controller
}: {
  controller: SettingsPanelsController
}) {
  const t = useTranslations('settings')
  const locale = useLocale()
  const data = controller.data
  if (!data) return null
  const formatter = new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: data.preferences.timezone
  })
  return (
    <div className={styles.panel}>
      <div className={styles.sessionsHeader}>
        <div>
          <h2 className={styles.heading}>{t('activeSessions')}</h2>
          <p className={styles.hint}>{t('activeSessionsDesc')}</p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => void controller.revokeOthers()}
          disabled={
            controller.disabled ||
            !data.sessions.some((session) => !session.current)
          }
          data-settings-revoke-others
        >
          {controller.busy === 'sessions' && (
            <LoadingIndicator className="size-4" />
          )}
          {t('revokeOthers')}
        </Button>
      </div>
      <SettingsPanelFeedback controller={controller} group="sessions" />
      <ul className={styles.sessionsList}>
        {data.sessions.map((session) => (
          <li key={session.id} data-settings-session={session.id}>
            {session.device.includes('iOS') ||
            session.device.includes('Android') ? (
              <Smartphone aria-hidden="true" />
            ) : (
              <Monitor aria-hidden="true" />
            )}
            <div className={styles.sessionInfo}>
              <div className={styles.sessionName}>
                <span>{session.device}</span>
                {session.current && (
                  <span className={styles.currentBadge}>
                    {t('currentSession')}
                  </span>
                )}
              </div>
              <p className={styles.hint}>
                {t('lastActive', {
                  date: formatter.format(new Date(session.lastSeenAt))
                })}
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              disabled={controller.disabled}
              onClick={() =>
                void controller.revokeSession(session.id, session.current)
              }
              data-settings-session-revoke
            >
              {controller.busy === `session-${session.id}` ? (
                <LoadingIndicator className="size-4" />
              ) : (
                t('revoke')
              )}
            </Button>
          </li>
        ))}
      </ul>
      {!data.sessions.length && (
        <p className={styles.hint}>{t('panelsDesign.noSessions')}</p>
      )}
      <details className={styles.activity} open>
        <summary>
          <h3 className={styles.subheading}>{t('securityActivity')}</h3>
          <ChevronDown aria-hidden="true" />
        </summary>
        {data.securityEvents.length ? (
          <ul className={styles.activityList}>
            {data.securityEvents.map((event) => (
              <li key={event.id}>
                <span>{event.detail}</span>
                <time dateTime={event.createdAt}>
                  {formatter.format(new Date(event.createdAt))}
                </time>
              </li>
            ))}
          </ul>
        ) : (
          <p className={styles.hint}>{t('noSecurityActivity')}</p>
        )}
      </details>
    </div>
  )
}
