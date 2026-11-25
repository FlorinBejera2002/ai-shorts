'use client'

import { Youtube } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useId, useState } from 'react'

import { Button } from '@/components/ui/button'
import { LoadingIndicator } from '@/components/ui/loading-indicator'
import { Link } from '@/i18n/navigation'

interface YouTubeConnectGateProps {
  connecting: boolean
  onConnect: () => void
}

/** Shown until a YouTube channel is connected: illustration, title, consent and the connect action. */
export function YouTubeConnectGate({ connecting, onConnect }: YouTubeConnectGateProps) {
  const t = useTranslations('create.youtubeChannel')
  const consentId = useId()
  // The canvas ships with the privacy consent already ticked; the connect action follows it.
  const [consented, setConsented] = useState(true)

  return (
    <section className="yt-connect-gate" aria-labelledby={`${consentId}-title`}>
      <img
        className="yt-connect-gate__art"
        src="/illustrations/youtube-connect.webp"
        alt={t('connectIllustrationAlt')}
        width={240}
        height={240}
      />
      <h2 id={`${consentId}-title`} className="yt-connect-gate__title">{t('connectTitle')}</h2>
      <div className="yt-connect-gate__actions">
        <Button
          type="button"
          size="lg"
          className="yt-pill-button yt-primary-button w-full"
          disabled={!consented || connecting}
          aria-busy={connecting}
          onClick={onConnect}
        >
          {connecting ? <LoadingIndicator className="size-4" /> : <Youtube className="size-[18px]" aria-hidden="true" />}
          {t('connectAction')}
        </Button>
        <label className="yt-consent" htmlFor={consentId}>
          <input
            id={consentId}
            type="checkbox"
            checked={consented}
            onChange={(event) => setConsented(event.target.checked)}
          />
          <span className="yt-consent__box" aria-hidden="true" />
          <span>
            {t('consentLead')}
            <Link href="/privacy" className="yt-consent__link">{t('consentPrivacy')}</Link>
            {t('consentTrail')}
          </span>
        </label>
      </div>
    </section>
  )
}
