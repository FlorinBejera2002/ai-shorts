'use client'

import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import type { ReactNode } from 'react'
import {
  scriptOverlayClass,
  scriptSurfaceClass,
  scriptSurfaceProps
} from './script-theme'
import styles from './scripts-workspace.module.css'

type ScriptSheetProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  /** Visible heading; otherwise the title only names the dialog. */
  showTitle?: boolean
  className?: string
  children: ReactNode
}

/** Phone bottom sheet with the Scripts reference theme. */
export function ScriptSheet({
  open,
  onOpenChange,
  title,
  showTitle = false,
  className,
  children
}: ScriptSheetProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(scriptSurfaceClass, styles.sheet, className)}
        overlayClassName={scriptOverlayClass}
        aria-describedby={undefined}
        {...scriptSurfaceProps}
      >
        <span className={styles.sheetHandle} aria-hidden="true" />
        <DialogTitle className={showTitle ? styles.sheetTitle : 'sr-only'}>
          {title}
        </DialogTitle>
        {children}
      </DialogContent>
    </Dialog>
  )
}
