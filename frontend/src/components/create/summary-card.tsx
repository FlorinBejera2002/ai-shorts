'use client'

import { LoadingIndicator } from '@/components/ui/loading-indicator'
import { useAuth } from '@/components/auth/use-auth'
import { apiFetch } from '@/lib/auth'
import { Button } from '@/components/ui/button'
import { AlertTriangle, Wand2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'
import { Link } from '@/i18n/navigation'

interface SummaryCardProps {
  videoCount: number
  creditCost: number
  canGenerate: boolean
  busy: boolean
  isBatch: boolean
  onGenerate: () => void
}

export function SummaryCard({ videoCount, creditCost, canGenerate, busy, isBatch, onGenerate }: SummaryCardProps) {
  const t = useTranslations('create')
  const billing = useTranslations('billing')
  const { user } = useAuth()
  const [account, setAccount] = useState<{ credits: number; creditsUnlimited?: boolean } | null>(null)

  useEffect(() => {
    let cancelled = false
    apiFetch('/api/user/credits')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data && typeof data.credits === 'number') setAccount(data)
      })
      .catch(() => undefined)
    return () => { cancelled = true }
  }, [])

  const creditsUnlimited = account?.creditsUnlimited ?? user?.access_role === 'admin'
  const insufficient = !creditsUnlimited && account !== null && creditCost > account.credits

  return (
    <div className="creation-generate">
      <div className="creation-cost" aria-live="polite">
        <span>
          <span className="sr-only">{isBatch ? t('costBatch', { count: videoCount }) : t('cost')}: </span>
          {creditsUnlimited ? 0 : creditCost} {t('creditsUnit')}
        </span>
        {(creditsUnlimited || account !== null) && (
          <span className="text-muted-foreground">
            {creditsUnlimited ? billing('creditsUnlimited') : t('balance', { count: account?.credits ?? 0 })}
          </span>
        )}
      </div>
      <Button
        type="button"
        disabled={!canGenerate || busy || insufficient}
        onClick={onGenerate}
        aria-busy={busy}
        className="creation-generate-action w-full disabled:cursor-not-allowed disabled:opacity-40"
      >
        {busy ? <><LoadingIndicator className="size-4" />{t('processing')}</> : (
          <><Wand2 className="size-4" strokeWidth={1.75} />
            {isBatch ? t('processVideos', { count: videoCount }) : t('generateAction')}
          </>
        )}
      </Button>
      {insufficient && (
        <div className="creation-credit-warning flex items-start gap-2 rounded-md border border-warning/25 bg-warning/10 p-3 text-xs text-warning">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} />
          <span>{t('insufficientCredits')}{' '}
            <Link href="/dashboard/billing" className="font-semibold underline underline-offset-2">{t('getCredits')}</Link>
          </span>
        </div>
      )}
    </div>
  )
}
