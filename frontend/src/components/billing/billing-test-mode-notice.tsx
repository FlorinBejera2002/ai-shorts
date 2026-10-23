import { Info } from 'lucide-react'

export function BillingTestModeNotice({
  title,
  description
}: {
  title: string
  description: string
}) {
  return (
    <section
      className="mt-4 flex items-start gap-3 rounded-md border border-warning/30 bg-warning/10 px-4 py-3 text-foreground"
      aria-labelledby="billing-test-mode-title"
      role="status"
    >
      <Info className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
      <div className="min-w-0">
        <h2 id="billing-test-mode-title" className="text-sm font-semibold">
          {title}
        </h2>
        <p className="mt-1 text-sm leading-relaxed">{description}</p>
      </div>
    </section>
  )
}
