'use client'

import { Dialog, DialogClose, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { ReactNode } from 'react'
import {
  scriptOverlayClass,
  scriptSurfaceClass,
  scriptSurfaceProps
} from './script-theme'
import styles from './scripts-workspace.module.css'
import sheetStyles from './script-editor.module.css'

type ScriptSheetProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  className?: string
  children: ReactNode
}

/** Phone bottom sheet with the Scripts reference theme and a visible title. */
export function ScriptSheet({
  open,
  onOpenChange,
  title,
  className,
  children
}: ScriptSheetProps) {
  const t = useTranslations('scriptGenerator')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(scriptSurfaceClass, styles.sheet, className)}
        overlayClassName={scriptOverlayClass}
        aria-describedby={undefined}
        {...scriptSurfaceProps}
      >
        <span className={styles.sheetHandle} aria-hidden="true" />
        <div className={sheetStyles.sheetHeader}>
          <DialogTitle className={styles.sheetTitle}>{title}</DialogTitle>
          <DialogClose className={sheetStyles.sheetClose} aria-label={t('workspace.close')}>
            <X aria-hidden="true" />
          </DialogClose>
        </div>
        {children}
      </DialogContent>
    </Dialog>
  )
}
