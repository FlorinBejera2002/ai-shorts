'use client'

import { Keyboard, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useEffect, useRef, useState } from 'react'

export function ShortcutsHelp() {
  const t = useTranslations('editor')
  const [open, setOpen] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent) => {
      if (!panelRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

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
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        title={t('shortcuts')}
        aria-expanded={open}
        className={`rounded-md border p-2 transition-colors ${
          open
            ? 'border-primary/40 bg-primary/10 text-primary'
            : 'border-border text-muted-foreground hover:text-foreground'
        }`}
      >
        <Keyboard className="h-4 w-4" strokeWidth={1.75} />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-40 mt-2 w-72 animate-scale-in rounded-xl border border-border bg-popover p-4 shadow-xl">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t('shortcuts')}
            </h3>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label={t('close')}
              className="rounded p-0.5 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" strokeWidth={1.75} />
            </button>
          </div>
          <div className="mt-3 space-y-1.5">
            {shortcuts.map(([key, label]) => (
              <div key={key} className="flex items-center justify-between gap-3">
                <span className="text-xs text-muted-foreground">{label}</span>
                <kbd className="shrink-0 rounded-md border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] font-medium text-foreground">
                  {key}
                </kbd>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
