import { PlatformBrandIcon } from '@/components/publishing/platform-brand-icon'
import type { ContentPlatform } from '@/lib/content-calendar'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { ChevronDown } from 'lucide-react'
import { type ReactNode, useState } from 'react'

export function PostSettingsSection({
  idPrefix,
  provider,
  title,
  subtitle,
  children
}: {
  idPrefix: string
  provider: ContentPlatform
  title: string
  subtitle: string
  children: ReactNode
}) {
  const [expanded, setExpanded] = useState(false)
  const reduceMotion = useReducedMotion()

  return (
    <section
      aria-labelledby={`${idPrefix}-title`}
      className="overflow-hidden rounded-md border"
    >
      <button
        type="button"
        onClick={() => setExpanded(value => !value)}
        aria-expanded={expanded}
        aria-controls={`${idPrefix}-content`}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/30"
      >
        <PlatformBrandIcon provider={provider} className="size-5" />
        <div className="min-w-0 flex-1">
          <h3 id={`${idPrefix}-title`} className="text-xs font-semibold">
            {title}
          </h3>
          <p className="mt-0.5 text-[11px] text-muted-foreground">{subtitle}</p>
        </div>
        <motion.div
          animate={{ rotate: expanded ? 180 : 0 }}
          transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
        >
          <ChevronDown className="size-4 text-muted-foreground" />
        </motion.div>
      </button>
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            id={`${idPrefix}-content`}
            initial={reduceMotion ? false : { height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.04, 0.62, 0.23, 0.98] }}
            className="overflow-hidden"
          >
            <div className="space-y-5 border-t px-4 py-4">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  )
}
