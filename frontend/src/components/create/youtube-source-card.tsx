'use client'

import type { ReactNode } from 'react'

interface YouTubeSourceCardProps {
  title: string
  children: ReactNode
}

/** Source card of the YouTube path: the title above the channel video list. */
export function YouTubeSourceCard({ title, children }: YouTubeSourceCardProps) {
  return (
    <section className="yt-card yt-source" data-testid="creation-source-media">
      <div className="yt-card__header">
        <h2>{title}</h2>
      </div>
      {children}
    </section>
  )
}
