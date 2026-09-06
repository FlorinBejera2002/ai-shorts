'use client'

import { Card } from '@/components/ui/card'

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

  if (!hasSubtitles)
    tips.push({ icon: Lightbulb, text: t('tipSubtitles'), id: 0 })
  if (!hasBrandKit)
    tips.push({ icon: Lightbulb, text: t('tipBrandKit'), id: 1 })
  if (pendingClips > 0)
    tips.push({
      icon: Zap,
      text: t('clipsReady', { count: pendingClips }),
      id: 2
    })

  const visibleTips = tips.filter((tip) => !dismissed.has(tip.id))
  if (visibleTips.length === 0) return null

  return (
    <div className="flex flex-wrap items-center gap-2 animate-fade-in">
      {visibleTips.map((tip) => {
        const Icon = tip.icon
        return (
          <Card
            key={tip.id}
            className="block gap-0 py-0 inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs text-muted-foreground animate-scale-in"
          >
            <Icon
              className="h-3 w-3 shrink-0 text-primary"
              strokeWidth={1.75}
            />
            <span>{tip.text}</span>
            <button
              type="button"
              onClick={() => setDismissed((prev) => new Set(prev).add(tip.id))}
              className="-mr-2 ml-0.5 inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label={t('dismissTip')}
            >
              <X className="h-3 w-3" strokeWidth={2} />
            </button>
          </Card>
        )
      })}
    </div>
  )
}
