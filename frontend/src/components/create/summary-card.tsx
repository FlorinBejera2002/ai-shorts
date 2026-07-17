'use client'

import { AlertTriangle, Loader2, Wand2, Zap } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'

import { Link } from '@/i18n/navigation'
import type { CreateSettings } from './settings-panel'

interface SummaryCardProps {
  settings: CreateSettings
  videoCount: number
  creditCost: number
  canGenerate: boolean
  busy: boolean
  isBatch: boolean
  onGenerate: () => void
}

export function SummaryCard({
  settings,
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
    fetch('/api/user/credits')
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

  const subtitleLabel = {
    clean: t('subtitleClean'),
    bold: t('subtitleBold'),
    'caption-box': t('subtitleCaptionBox'),
    none: t('subtitleNone')
  }[settings.subtitleStyle]

  return (
    <div className="space-y-4">
      {/* Recap + cost */}
      <div className="rounded-xl border border-border bg-gradient-to-br from-primary/10 to-accent/5 p-4">
        <div className="flex flex-wrap gap-1.5">
          {[
            t('recapClips', { count: settings.clips }),
            settings.aspectRatio,
            subtitleLabel,
            ...(isBatch ? [t('recapVideos', { count: videoCount })] : [])
          ].map((chip) => (
            <span
              key={chip}
              className="rounded-md bg-card/80 px-2 py-1 text-[11px] font-medium text-foreground shadow-sm"
            >
              {chip}
            </span>
          ))}
        </div>

        <div className="mt-4 flex items-start gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/20">
            <Zap className="h-4 w-4 text-primary" strokeWidth={1.75} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] text-muted-foreground">
              {isBatch ? t('costBatch', { count: videoCount }) : t('cost')}
            </p>
            <p className="mt-1 text-lg font-bold tabular-nums text-foreground">
              {creditCost}{' '}
              <span className="text-xs font-normal text-muted-foreground">
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

        {insufficient && (
          <div className="mt-3 flex items-start gap-2 rounded-lg bg-warning/10 p-2.5 text-[11px] text-warning">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
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
      </div>

      {/* Submit */}
      <button
        type="button"
        disabled={!canGenerate || busy || insufficient}
        onClick={onGenerate}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition-all hover:opacity-90 hover:shadow-lg hover:shadow-primary/20 disabled:cursor-not-allowed disabled:opacity-40"
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
              : t('generateClips', { count: settings.clips })}
          </>
        )}
      </button>
    </div>
  )
}
