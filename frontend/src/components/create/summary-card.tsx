'use client'

import { apiFetch } from '@/lib/auth'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

import { AlertTriangle, Loader2, Wand2, Zap } from 'lucide-react'
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

export function SummaryCard({
  videoCount,
  creditCost,
  canGenerate,
  busy,
  isBatch,
  onGenerate
}: SummaryCardProps) {
  const t = useTranslations('create')
  const [balance, setBalance] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false
    apiFetch('/api/user/credits')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data && typeof data.credits === 'number') {
          setBalance(data.credits)
        }
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [])

  const insufficient = balance !== null && creditCost > balance

  return (
    <Card className="creation-generate block gap-0 py-0 overflow-hidden">
      <div className="creation-cost" aria-live="polite">
        <div className="flex items-start gap-3">
          <div className="icon-tile">
            <Zap className="h-4 w-4" strokeWidth={1.75} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="sr-only">
              {isBatch ? t('costBatch', { count: videoCount }) : t('cost')}
            </p>
            <p className="mt-1.5 text-2xl font-semibold tabular-nums text-foreground">
              {creditCost}{' '}
              <span className="text-xs font-medium text-muted-foreground">
                {t('creditsUnit')}
              </span>
            </p>
            {balance !== null && (
              <p className="mt-0.5 text-[11px] tabular-nums text-muted-foreground">
                {t('balance', { count: balance })}
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="creation-generate-action">
        <Button
          type="button"
          disabled={!canGenerate || busy || insufficient}
          onClick={onGenerate}
          aria-busy={busy}
          variant="default"
          className="w-full disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              {t('processing')}
            </>
          ) : (
            <>
              <Wand2 className="h-4 w-4" strokeWidth={1.75} />
              {isBatch
                ? t('processVideos', { count: videoCount })
                : t('generateAction')}
            </>
          )}
        </Button>
      </div>
      {insufficient && (
        <div className="creation-credit-warning flex items-start gap-2 rounded-lg border border-warning/25 bg-warning/10 p-2.5 text-[11px] text-warning">
          <AlertTriangle
            className="mt-0.5 h-3.5 w-3.5 shrink-0"
            strokeWidth={1.75}
          />
          <span>
            {t('insufficientCredits')}{' '}
            <Link
              href="/dashboard/billing"
              className="font-semibold underline underline-offset-2"
            >
              {t('getCredits')}
            </Link>
          </span>
        </div>
      )}
    </Card>
  )
}
