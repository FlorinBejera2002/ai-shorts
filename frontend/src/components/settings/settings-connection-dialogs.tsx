'use client'

import { PlatformBrandIcon } from '@/components/publishing/platform-brand-icon'
import { CloseButton, OverlayActions, OverlayDescription, OverlayTitle, ReferenceOverlay } from '@/components/shared/reference-overlay'
import { PUBLISHING_PROVIDER_CATALOG } from '@/lib/publishing'
import { Link } from '@/i18n/navigation'
import { Link2, TriangleAlert } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Switch } from './settings-ui'
import type { SettingsConnectionsController } from './use-settings-connections'
import controls from './settings-controls.module.css'

type Props = { connections: SettingsConnectionsController; mobile: boolean }

/** "Deconectezi Instagram?" with the scheduled-posts warning. */
export function DisconnectDialog({ connections, mobile }: Props) {
  const t = useTranslations('settings')
  const account = connections.disconnectTarget
  const provider = PUBLISHING_PROVIDER_CATALOG.find(({ id }) => id === account?.provider)
  const busy = account !== null && connections.busyId === account.id
  return (
    <ReferenceOverlay open={account !== null} mobile={mobile} busy={busy} alert onClose={connections.closeDisconnect}>
      {account && provider && (
        <div className={controls.centered} data-settings-disconnect-dialog={account.id}>
          <div className={controls.dialogClose}>
            <CloseButton onClick={connections.closeDisconnect} />
          </div>
          <span className={controls.logoBadge}>
            <PlatformBrandIcon provider={provider.id} className="rounded-full" />
            <span aria-hidden="true">
              <span>
                <Link2 />
              </span>
            </span>
          </span>
          <div className={controls.titleBlock}>
            <OverlayTitle mobile={mobile}>{t('connectionsDesign.disconnectTitle', { provider: provider.name })}</OverlayTitle>
            <OverlayDescription mobile={mobile}>{account.username ? `@${account.username.replace(/^@/, '')}` : account.name}</OverlayDescription>
          </div>
          <span className={controls.warning}>
            <TriangleAlert aria-hidden="true" />
            {t('page.disconnectWarning')}
          </span>
          <OverlayActions
            cancel={t('cancel')}
            confirm={t('disconnect')}
            tone="danger"
            busy={busy}
            onCancel={connections.closeDisconnect}
            onConfirm={() => void connections.disconnect()}
          />
        </div>
      )}
    </ReferenceOverlay>
  )
}

/** YouTube requires accepting its terms before the OAuth window opens. */
export function YouTubeConsentDialog({ connections, mobile }: Props) {
  const t = useTranslations('settings')
  const youtube = useTranslations('youtubePublishing')
  const busy = connections.busyId === 'youtube'
  return (
    <ReferenceOverlay open={connections.consentOpen} mobile={mobile} busy={busy} described={false} onClose={connections.closeConsent}>
      <div className={controls.dialogBody} data-settings-youtube-consent="">
        <div className={controls.dialogHead}>
          <OverlayTitle mobile={mobile}>{t('connectionsDesign.youtubeConsentTitle')}</OverlayTitle>
          <CloseButton onClick={connections.closeConsent} />
        </div>
        <div className={controls.consent}>
          <Switch
            checked={connections.youtubeConsent}
            label={t('connectionsDesign.youtubeConsentTitle')}
            onChange={connections.setYouTubeConsent}
            data-settings-youtube-consent-check=""
          />
          <span>
            {youtube.rich('connectionConsent', {
              terms: (chunks) => (
                <a href="https://www.youtube.com/t/terms" target="_blank" rel="noreferrer">
                  {chunks}
                </a>
              ),
              privacy: (chunks) => (
                <Link href="/privacy" target="_blank" rel="noreferrer">
                  {chunks}
                </Link>
              )
            })}
          </span>
        </div>
        <OverlayActions
          cancel={t('cancel')}
          confirm={t('page.connectProvider', { provider: 'YouTube' })}
          tone="primary"
          busy={busy}
          disabled={!connections.youtubeConsent}
          onCancel={connections.closeConsent}
          onConfirm={connections.confirmYouTube}
        />
      </div>
    </ReferenceOverlay>
  )
}
