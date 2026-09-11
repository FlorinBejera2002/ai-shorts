import { Card } from '@/components/ui/card'
import { Gauge, LockKeyhole, RefreshCw } from 'lucide-react'

type BillingGuideProps = {
  labels: {
    title: string
    description: string
    predictableTitle: string
    predictableDescription: string
    rolloverTitle: string
    rolloverDescription: string
    controlTitle: string
    controlDescription: string
  }
}

const ITEMS = [
  { key: 'predictable', Icon: Gauge },
  { key: 'rollover', Icon: RefreshCw },
  { key: 'control', Icon: LockKeyhole }
] as const

export function BillingGuide({ labels }: BillingGuideProps) {
  return (
    <section aria-labelledby="billing-guide-title">
      <div className="mb-5">
        <h2 id="billing-guide-title" className="text-lg font-semibold">
          {labels.title}
        </h2>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          {labels.description}
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        {ITEMS.map(({ key, Icon }) => (
          <Card
            key={key}
            as="article"
            className="block gap-0 py-0 p-5 shadow-none"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Icon className="h-4 w-4" aria-hidden="true" />
            </div>
            <h3 className="mt-5 text-sm font-semibold">
              {labels[`${key}Title`]}
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {labels[`${key}Description`]}
            </p>
          </Card>
        ))}
      </div>
    </section>
  )
}
