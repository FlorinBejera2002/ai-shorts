'use client'

import type { ReactNode } from 'react'

interface YouTubeSourceCardProps {
  title: string
  /** Optional count shown on the header's right edge, such as the number of chosen videos. */
  aside?: ReactNode
  children: ReactNode
}

/** Source card of the YouTube path: the title (and optional count) above the channel video list. */
export function YouTubeSourceCard({ title, aside, children }: YouTubeSourceCardProps) {
  return (
    <section className="yt-card yt-source" data-testid="creation-source-media">
      <div className="yt-card__header">
        <h2>{title}</h2>
        {aside && <span className="yt-card__aside">{aside}</span>}
      </div>
      {children}
    </section>
  )
}
