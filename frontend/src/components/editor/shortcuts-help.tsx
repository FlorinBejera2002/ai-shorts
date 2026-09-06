'use client'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog'
import { Keyboard, X } from 'lucide-react'
import { useTranslations } from 'next-intl'

export function ShortcutsHelp() {
  const t = useTranslations('editor')
  const shortcuts: [string, string][] = [
    ['Space', t('shortcutPlay')],
    ['← / →', t('shortcutSeek')],
    ['Shift + ← / →', t('shortcutSeekBig')],
    [', / .', t('shortcutSeekFine')],
    ['S', t('shortcutSplit')],
    ['Delete', t('shortcutDelete')],
    ['[ / ]', t('shortcutSetBounds')],
    ['Ctrl + Z', t('shortcutUndo')],
    ['Ctrl + Shift + Z', t('shortcutRedo')],
    ['+ / −', t('shortcutZoom')]
  ]
  return (
    <Dialog>
      <DialogTrigger asChild={true}>
        <Button
          variant="outline"
          size="icon"
          title={t('shortcuts')}
          aria-label={t('shortcuts')}
        >
          <Keyboard className="size-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('shortcuts')}</DialogTitle>
          <DialogDescription className="sr-only">
            {t('title')}
          </DialogDescription>
        </DialogHeader>
        <DialogClose asChild={true}>
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-3 top-3"
            aria-label={t('close')}
          >
            <X className="size-4" />
          </Button>
        </DialogClose>
        <div className="divide-y">
          {shortcuts.map(([key, label]) => (
            <div
              key={key}
              className="flex items-center justify-between gap-4 py-3"
            >
              <span className="text-sm text-muted-foreground">{label}</span>
              <kbd className="shrink-0 rounded-md border bg-muted px-2 py-1 font-mono text-xs">
                {key}
              </kbd>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
