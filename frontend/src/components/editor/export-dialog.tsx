'use client'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Link } from '@/i18n/navigation'
import { CheckCircle2, Clock, Film, Loader2, Scissors, X } from 'lucide-react'
import { useTranslations } from 'next-intl'

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
  const submitting = phase === 'submitting'
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !submitting) onClose()
      }}
    >
      <DialogContent
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          document
            .querySelector<HTMLButtonElement>('[data-export-trigger]')
            ?.focus()
        }}
        onEscapeKeyDown={(event) => {
          if (submitting) event.preventDefault()
        }}
        onInteractOutside={(event) => {
          if (submitting) event.preventDefault()
        }}
      >
        <DialogHeader>
          <div className="mb-2 flex items-center justify-between">
            <span className="flex size-11 items-center justify-center rounded-xl border bg-muted text-primary">
              {phase === 'done' ? (
                <CheckCircle2 className="size-5 text-success" />
              ) : (
                <Scissors className="size-5" />
              )}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="hover:bg-muted hover:text-foreground"
              onClick={onClose}
              disabled={submitting}
              aria-label={t('close')}
            >
              <X className="size-4" />
            </Button>
          </div>
          <DialogTitle>
            {phase === 'done'
              ? t('exportStartedTitle')
              : t('exportConfirmTitle')}
          </DialogTitle>
          <DialogDescription>
            {phase === 'done' ? t('exportStartedDesc') : t('exportConfirmDesc')}
          </DialogDescription>
        </DialogHeader>
        {phase !== 'done' && (
          <>
            <Card className="gap-0 bg-muted/30 py-0 shadow-none">
              <CardContent className="space-y-4 p-4">
                <div className="flex items-center gap-3 text-sm">
                  <Film className="size-4 text-primary" />
                  {t('segments', { count: segmentCount })}
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <Clock className="size-4 text-primary" />
                  {t('totalDuration', {
                    duration: `${totalDuration.toFixed(1)}s`
                  })}
                </div>
              </CardContent>
            </Card>
            <p className="text-xs leading-6 text-muted-foreground">
              {t('exportNote')}
            </p>
          </>
        )}
        <DialogFooter>
          {phase === 'done' ? (
            <>
              <Button
                variant="outline"
                onClick={onClose}
                className="hover:bg-muted hover:text-foreground"
              >
                {t('keepEditing')}
              </Button>
              <Button
                asChild={true}
                className="bg-foreground text-background hover:bg-foreground/85"
              >
                <Link href={`/dashboard/clips/${clipId}`}>
                  {t('backToClip')}
                </Link>
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="outline"
                onClick={onClose}
                disabled={submitting}
                className="hover:bg-muted hover:text-foreground"
              >
                {t('cancel')}
              </Button>
              <Button
                onClick={onConfirm}
                disabled={submitting}
                className="bg-foreground text-background hover:bg-foreground/85"
              >
                {submitting ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Scissors className="size-4" />
                )}
                {submitting ? t('exporting') : t('exportConfirm')}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
