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
    <div className="panel overflow-hidden">
      <div className="p-4" aria-live="polite">
        <div className="flex items-start gap-3">
          <div className="icon-tile">
            <Zap className="h-4 w-4" strokeWidth={1.75} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="section-label">
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

        <div className="mt-4 flex flex-wrap gap-1.5 border-t border-border pt-4">
          {[
            t('recapClips', { count: settings.clips }),
            settings.aspectRatio,
            subtitleLabel,
            ...(isBatch ? [t('recapVideos', { count: videoCount })] : [])
          ].map((chip) => (
            <span
              key={chip}
              className="rounded-md bg-muted px-2 py-1 text-[11px] font-medium text-foreground"
            >
              {chip}
            </span>
          ))}
        </div>

        {insufficient && (
          <div className="mt-4 flex items-start gap-2 rounded-lg border border-warning/25 bg-warning/10 p-2.5 text-[11px] text-warning">
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
      </div>

      <div className="border-t border-border bg-muted/35 p-3">
        <button
          type="button"
          disabled={!canGenerate || busy || insufficient}
          onClick={onGenerate}
          aria-busy={busy}
          className="button-primary w-full disabled:cursor-not-allowed disabled:opacity-40"
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
    </div>
  )
}
