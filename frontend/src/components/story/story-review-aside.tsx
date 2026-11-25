import type { ReactNode } from 'react'
import { Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { MonthlyUsage } from '@/components/dashboard/sidebar-usage'

interface Props {
  preview: ReactNode
  usage: MonthlyUsage | null
  usageLabel: string
  ctaLabel: string
  ready: boolean
  busy: boolean
  onCreate: () => void
}

/** Side panel of the review: the preview, monthly usage when the account has an allowance, and the primary action. */
export function StoryReviewAside({
  preview,
  usage,
  usageLabel,
  ctaLabel,
  ready,
  busy,
  onCreate
}: Props) {
  return (
    <aside className="creare-review-aside">
      <div className="creare-review-preview">{preview}</div>
      {usage && (
        <div className="creare-review-usage">
          <div className="creare-review-usage-head">
            <span>{usageLabel}</span>
            <strong>{usage.percent}%</strong>
          </div>
          <div className="creare-review-usage-track" aria-hidden="true">
            <span style={{ width: `${Math.min(100, usage.percent)}%` }} />
          </div>
        </div>
      )}
      <Button
        className="creare-review-create rounded-full"
        disabled={!ready || busy}
        onClick={onCreate}
      >
        <Sparkles aria-hidden="true" />
        {ctaLabel}
      </Button>
    </aside>
  )
}
