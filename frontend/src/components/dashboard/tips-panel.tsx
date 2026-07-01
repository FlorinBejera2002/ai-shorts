import { Lightbulb, Zap } from 'lucide-react'
import { useTranslations } from 'next-intl'

interface TipsPanelProps {
  hasSubtitles: boolean
  hasBrandKit: boolean
  pendingClips: number
}

export function TipsPanel({ hasSubtitles, hasBrandKit, pendingClips }: TipsPanelProps) {
  const t = useTranslations('dashboard')

  const tips: { icon: typeof Lightbulb; text: string }[] = []

  if (!hasSubtitles) {
    tips.push({ icon: Lightbulb, text: t('tipSubtitles') })
  }
  if (!hasBrandKit) {
    tips.push({ icon: Lightbulb, text: t('tipBrandKit') })
  }
  if (pendingClips > 0) {
    tips.push({ icon: Zap, text: t('clipsReady', { count: pendingClips }) })
  }

  if (tips.length === 0) return null

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
        {t('tips')}
      </h2>
      <div className="space-y-2">
        {tips.map((tip, i) => {
          const Icon = tip.icon
          return (
            <div key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
              <Icon className="w-3.5 h-3.5 shrink-0 mt-0.5 text-primary" />
              <span>{tip.text}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
