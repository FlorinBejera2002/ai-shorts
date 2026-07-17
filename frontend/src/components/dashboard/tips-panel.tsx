'use client'

import { Lightbulb, X, Zap } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

interface TipsPanelProps {
  hasSubtitles: boolean
  hasBrandKit: boolean
  pendingClips: number
}

export function TipsPanel({
  hasSubtitles,
  hasBrandKit,
  pendingClips
}: TipsPanelProps) {
  const t = useTranslations('dashboard')
  const [dismissed, setDismissed] = useState<Set<number>>(new Set())

  const tips: { icon: typeof Lightbulb; text: string; id: number }[] = []

  if (!hasSubtitles) {
    tips.push({ icon: Lightbulb, text: t('tipSubtitles'), id: 0 })
  }
  if (!hasBrandKit) {
    tips.push({ icon: Lightbulb, text: t('tipBrandKit'), id: 1 })
  }
  if (pendingClips > 0) {
    tips.push({
      icon: Zap,
      text: t('clipsReady', { count: pendingClips }),
      id: 2
    })
  }

  const visibleTips = tips.filter((tip) => !dismissed.has(tip.id))

  if (visibleTips.length === 0) return null

  return (
    <div className="rounded-xl border border-border/60 bg-gradient-to-br from-primary/5 to-accent/5 p-4 backdrop-blur-sm animate-fade-in">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {t('tips')}
        </h2>
        {visibleTips.length > 0 && (
          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary/20 text-[10px] font-bold text-primary">
            {visibleTips.length}
          </span>
        )}
      </div>
      <div className="space-y-2">
        {visibleTips.map((tip) => {
          const Icon = tip.icon
          return (
            <div
              key={tip.id}
              className="group flex items-start gap-2.5 rounded-lg bg-background/40 px-3 py-2.5 transition-all duration-300 hover:bg-background/60 animate-slide-up"
              style={{ animationDelay: `${tip.id * 50}ms` }}
            >
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/20 text-primary">
                <Icon className="h-3.5 w-3.5" strokeWidth={1.75} />
              </div>
              <p className="flex-1 text-xs leading-relaxed text-foreground">
                {tip.text}
              </p>
              <button
                onClick={() =>
                  setDismissed((prev) => new Set(prev).add(tip.id))
                }
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-all duration-200 hover:bg-muted/50 group-hover:opacity-100"
                aria-label="Dismiss tip"
              >
                <X className="h-3 w-3" strokeWidth={2} />
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
