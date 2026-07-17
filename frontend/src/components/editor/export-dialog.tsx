'use client'

import { CheckCircle2, Clock, Film, Loader2, Scissors, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useEffect } from 'react'

import { Link } from '@/i18n/navigation'

export type ExportPhase = 'confirm' | 'submitting' | 'done'

interface ExportDialogProps {
  open: boolean
  phase: ExportPhase
  segmentCount: number
  totalDuration: number
  clipId: string
  onConfirm: () => void
  onClose: () => void
}

export function ExportDialog({
  open,
  phase,
  segmentCount,
  totalDuration,
  clipId,
  onConfirm,
  onClose
}: ExportDialogProps) {
  const t = useTranslations('editor')

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && phase !== 'submitting') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, phase, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm animate-fade-in"
      onClick={() => phase !== 'submitting' && onClose()}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('export')}
        className="w-full max-w-md animate-scale-in rounded-xl border border-border bg-card p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {phase === 'done' ? (
          <div className="text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-success/10">
              <CheckCircle2 className="h-6 w-6 text-success" strokeWidth={1.75} />
            </div>
            <h2 className="mt-4 text-base font-semibold text-foreground">
              {t('exportStartedTitle')}
            </h2>
            <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
              {t('exportStartedDesc')}
            </p>
            <div className="mt-5 flex justify-center gap-2">
              <Link
                href={`/dashboard/clips/${clipId}`}
                className="rounded-lg bg-primary px-4 py-2 text-[13px] font-medium text-primary-foreground transition-opacity hover:opacity-90"
              >
                {t('backToClip')}
              </Link>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-border px-4 py-2 text-[13px] font-medium text-foreground transition-colors hover:bg-muted"
              >
                {t('keepEditing')}
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-base font-semibold text-foreground">
                  {t('exportConfirmTitle')}
                </h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t('exportConfirmDesc')}
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                disabled={phase === 'submitting'}
                aria-label={t('close')}
                className="rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
              >
                <X className="h-4 w-4" strokeWidth={1.75} />
              </button>
            </div>

            <div className="mt-4 space-y-2">
              <div className="flex items-center gap-3 rounded-lg bg-muted/60 px-3 py-2.5">
                <Film className="h-4 w-4 shrink-0 text-primary" strokeWidth={1.75} />
                <span className="text-[13px] text-foreground">
                  {t('segments', { count: segmentCount })}
                </span>
              </div>
              <div className="flex items-center gap-3 rounded-lg bg-muted/60 px-3 py-2.5">
                <Clock className="h-4 w-4 shrink-0 text-primary" strokeWidth={1.75} />
                <span className="text-[13px] tabular-nums text-foreground">
                  {t('totalDuration', { duration: `${totalDuration.toFixed(1)}s` })}
                </span>
              </div>
            </div>

            <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
              {t('exportNote')}
            </p>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={phase === 'submitting'}
                className="rounded-lg border border-border px-4 py-2 text-[13px] font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-40"
              >
                {t('cancel')}
              </button>
              <button
                type="button"
                onClick={onConfirm}
                disabled={phase === 'submitting'}
                className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-[13px] font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
              >
                {phase === 'submitting' ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Scissors className="h-3.5 w-3.5" strokeWidth={1.75} />
                )}
                {phase === 'submitting' ? t('exporting') : t('exportConfirm')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
