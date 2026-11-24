import type { ReactNode } from 'react'
import { cn } from '../lib/utils'
import { Skeleton } from './ui/skeleton'
import { type IllustrationName, illustrations } from './illustrations'

type StatePanelProps = {
  illustration: IllustrationName
  title: string
  message?: ReactNode
  action?: ReactNode
  compact?: boolean
  role?: 'alert' | 'status'
}

/** Illustrated empty, no-results and error state used across the console. */
export function StatePanel({ illustration, title, message, action, compact = false, role }: StatePanelProps) {
  return (
    <div className={cn('state-panel', compact && 'compact')} role={role}>
      <img src={illustrations[illustration]} alt="" width={compact ? 140 : 180} height={compact ? 140 : 180} />
      <h2>{title}</h2>
      {message && <p>{message}</p>}
      {action}
    </div>
  )
}

export function PageLoader({ compact = false }: { compact?: boolean }) {
  return (
    <div className={cn('page-loader', compact && 'compact')} role="status">
      <Skeleton className="size-10 rounded-full" />
      <Skeleton className="h-2.5 w-32 rounded-full" />
      <span className="sr-only">Se încarcă datele…</span>
    </div>
  )
}
