'use client'

import { Wand2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useEffect, useId, useState } from 'react'

import { useAuth } from '@/components/auth/use-auth'
import { Button } from '@/components/ui/button'
import { LoadingIndicator } from '@/components/ui/loading-indicator'
import { Link } from '@/i18n/navigation'
import { useMonthlyUsage } from '@/components/dashboard/sidebar-usage'
import { apiFetch } from '@/lib/auth'

interface SummaryCardProps {
  videoCount: number
  /** Credits the job needs before it can start (at least one clip per video while the count is Auto). */
  creditCost: number
  consented?: boolean
  onConsentChange?: (consented: boolean) => void
  canGenerate: boolean
  busy: boolean
  limitReached: boolean
  onGenerate?: () => void
  actionType?: 'button' | 'submit'
}

interface CreditsAccount {
  credits: number
  creditsUnlimited?: boolean
}

/** Primary action at the bottom of the inspector, the credit warning, and the monthly-limit state. */
export function SummaryCard({
  videoCount,
  creditCost,
  consented = false,
  onConsentChange,
  canGenerate,
  busy,
  limitReached,
  onGenerate,
  actionType = 'button'
}: SummaryCardProps) {
  const t = useTranslations('create')
  const { user } = useAuth()
  const account = useCreditsAccount()
  const creditsUnlimited = account?.creditsUnlimited ?? user?.access_role === 'admin'
  const insufficient = !creditsUnlimited && account !== null && creditCost > account.credits

  if (limitReached || insufficient) {
    return <LimitNotice message={insufficient ? t('insufficientCredits') : null} />
  }

  return (
    <div className="yt-generate">
      {onConsentChange && <ImportConsent consented={consented} onChange={onConsentChange} />}
      <Button
        type={actionType}
        size="lg"
        disabled={!canGenerate || busy || insufficient}
        onClick={actionType === 'button' ? onGenerate : undefined}
        aria-busy={busy}
        className="yt-primary-button yt-generate__action w-full"
      >
        {busy ? (
          <>
            <LoadingIndicator className="size-4" />
            {t('processing')}
          </>
        ) : (
          <>
            <Wand2 className="size-[18px]" aria-hidden="true" strokeWidth={1.75} />
            {videoCount > 1 ? t('processVideos', { count: videoCount }) : t('generateAction')}
          </>
        )}
      </Button>
    </div>
  )
}

/** Explicit agreement to the Google data export. Generate stays disabled until it is ticked. */
function ImportConsent({ consented, onChange }: { consented: boolean; onChange: (consented: boolean) => void }) {
  const t = useTranslations('create.youtubeImport')
  const consentId = useId()
  return (
    <label className="yt-consent" htmlFor={consentId}>
      <input
        id={consentId}
        type="checkbox"
        checked={consented}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="yt-consent__box" aria-hidden="true" />
      <span>{t('consentLabel')}</span>
    </label>
  )
}

/**
 * Canvas limit block, shown instead of Generate when the account is out of credits (checked
 * before submit or rejected by the server). The monthly usage shows when the plan has an allowance.
 */
function LimitNotice({ message }: { message: string | null }) {
  const t = useTranslations('create.limit')
  const usage = useMonthlyUsage().data ?? null
  return (
    <div className="yt-limit" role="alert">
      <img src="/illustrations/create-limit.webp" alt="" width={110} height={110} className="yt-limit__art" />
      <h3>{t('title')}</h3>
      {message && <p className="yt-limit__message">{message}</p>}
      {usage && <UsageMeter label={t('usage')} percent={usage.percent} />}
      <Link href="/dashboard/billing" className="yt-primary-button yt-limit__cta">{t('viewPlans')}</Link>
    </div>
  )
}

/** Canvas usage pill in the limit block: the share of the monthly allowance spent, with a danger bar. */
function UsageMeter({ label, percent }: { label: string; percent: number }) {
  const shown = Math.min(100, Math.max(0, Math.round(percent)))
  return (
    <div className="yt-limit__usage">
      <div className="yt-limit__usage-head">
        <span>{label}</span>
        <strong>{shown}%</strong>
      </div>
      <span className="yt-limit__usage-track" aria-hidden="true">
        <span style={{ width: `${shown}%` }} />
      </span>
    </div>
  )
}

/** Balance from `/api/user/credits`; null until loaded or when the request fails. */
function useCreditsAccount(): CreditsAccount | null {
  const [account, setAccount] = useState<CreditsAccount | null>(null)

  useEffect(() => {
    let cancelled = false
    apiFetch('/api/user/credits')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data && typeof data.credits === 'number') setAccount(data)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [])

  return account
}
