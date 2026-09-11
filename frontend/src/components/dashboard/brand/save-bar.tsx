'use client'

import { Button } from '@/components/ui/button'
import { Check, Loader2, RotateCcw, Save, Undo2 } from 'lucide-react'
import { useTranslations } from 'next-intl'

type SaveBarProps = {
  dirty: boolean
  saving: boolean
  saved: boolean
  logoBusy: boolean
  hasInvalidColor: boolean
  onDiscard: () => void
  onReset: () => void
  onSave: () => Promise<void>
}

export function SaveBar({
  dirty,
  saving,
  saved,
  logoBusy,
  hasInvalidColor,
  onDiscard,
  onReset,
  onSave
}: SaveBarProps) {
  const t = useTranslations('brand')
  const common = useTranslations('common')
  const busy = saving || logoBusy

  return (
    <div className="brand-save-bar flex flex-wrap items-center gap-2 rounded-md border border-border bg-card px-3 py-2">
      <Button
        type="button"
        onClick={onReset}
        disabled={busy}
        variant="ghost"
        aria-label={common('reset')}
        title={common('reset')}
        className="size-9 rounded-md text-muted-foreground sm:w-auto"
      >
        <RotateCcw />
        <span className="hidden sm:inline">{common('reset')}</span>
      </Button>
      <div
        role="status"
        className="flex min-w-0 flex-1 items-center gap-2 text-[11px] text-muted-foreground"
      >
        {dirty && (
          <>
            <span
              className="size-1.5 shrink-0 rounded-full bg-amber-500"
              aria-hidden="true"
            />
            <span className="sr-only sm:not-sr-only">{t('unsaved')}</span>
          </>
        )}
      </div>

      <div className="flex items-center gap-2">
        <Button
          type="button"
          onClick={onDiscard}
          disabled={!dirty || busy}
          variant="ghost"
          className="h-9 rounded-md px-3 text-xs"
        >
          <Undo2 />
          {t('discard')}
        </Button>
        <Button
          type="button"
          onClick={() => void onSave()}
          disabled={busy || hasInvalidColor}
          title={hasInvalidColor ? t('fixColors') : undefined}
          className="h-9 min-w-24 rounded-md px-3 text-xs"
        >
          {saving ? (
            <Loader2 className="animate-spin" />
          ) : saved ? (
            <Check />
          ) : (
            <Save />
          )}
          {saved ? common('saved') : common('save')}
        </Button>
      </div>
    </div>
  )
}
