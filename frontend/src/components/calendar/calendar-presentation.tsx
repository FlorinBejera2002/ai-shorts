'use client'

import type {
  ContentPlatform,
  ContentPostStatus,
  ScheduledPostRecord
} from '@/lib/content-calendar'
import { useTranslations } from 'next-intl'
import type { DragEvent } from 'react'
import { PlatformMark } from './platform-mark'

export const statusStyles = {
  draft: {
    pill: 'border-border bg-muted text-muted-foreground',
    line: 'bg-muted-foreground',
    surface: 'bg-muted/55 text-muted-foreground'
  },
  scheduled: {
    pill: 'border-primary/20 bg-primary/[0.08] text-primary',
    line: 'bg-primary',
    surface: 'bg-primary/[0.09] text-primary'
  },
  published: {
    pill: 'border-success/20 bg-success/10 text-success',
    line: 'bg-success',
    surface: 'bg-success/10 text-success'
  }
} satisfies Record<
  ContentPostStatus,
  { pill: string; line: string; surface: string }
>

export function StatusPill({ status }: { status: ContentPostStatus }) {
  const t = useTranslations('contentCalendar')
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[10px] font-bold ${statusStyles[status].pill}`}
    >
      <span
        aria-hidden="true"
        className={`h-1.5 w-1.5 rounded-full ${statusStyles[status].line}`}
      />
      {t(`statuses.${status}`)}
    </span>
  )
}

export function PlatformMarks({
  platforms,
  compact = false
}: {
  platforms: ContentPlatform[]
  compact?: boolean
}) {
  const t = useTranslations('contentCalendar')
  const visible = platforms.slice(0, compact ? 2 : 3)

  return (
    <span className="inline-flex items-center -space-x-1">
      {visible.map((platform) => (
        <span
          key={platform}
          className="rounded-md ring-2 ring-background"
          title={t(`platforms.${platform}`)}
        >
          <PlatformMark
            platform={platform}
            label={t(`platforms.${platform}`)}
          />
        </span>
      ))}
      {platforms.length > visible.length && (
        <span className="ml-1 text-[9px] font-bold text-muted-foreground">
          +{platforms.length - visible.length}
        </span>
      )}
    </span>
  )
}

export function draggablePostData(event: DragEvent, post: ScheduledPostRecord) {
  event.dataTransfer.effectAllowed = 'move'
  event.dataTransfer.setData('application/x-sneepcut-calendar-post', post.id)
  event.dataTransfer.setData('text/plain', post.id)
}

export function readDraggedPostId(event: DragEvent): string {
  return (
    event.dataTransfer.getData('application/x-sneepcut-calendar-post') ||
    event.dataTransfer.getData('text/plain')
  )
}
