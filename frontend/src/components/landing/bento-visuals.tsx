'use client'

import { motion, useInView } from 'framer-motion'
import { Flame } from 'lucide-react'
import { useRef } from 'react'

const EASE = [0.16, 1, 0.3, 1] as const

// ─── AI highlight detection: ranked clip rows with animated viral scores ───
export function HighlightViz() {
  const ref = useRef<HTMLDivElement>(null)
  const isInView = useInView(ref, { once: true, margin: '-40px' })
  const rows = [
    { score: 94, width: '94%' },
    { score: 87, width: '87%' },
    { score: 76, width: '76%' }
  ]

  return (
    <div ref={ref} className="mt-4 space-y-2.5">
      {rows.map((row, i) => (
        <div key={row.score} className="flex items-center gap-3">
          <div className="h-8 w-12 shrink-0 rounded-md bg-gradient-to-br from-primary/25 to-accent/25 border border-border/60" />
          <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-primary to-accent"
              initial={{ width: 0 }}
              animate={isInView ? { width: row.width } : {}}
              transition={{ duration: 1, delay: 0.3 + i * 0.15, ease: EASE }}
            />
          </div>
          <motion.div
            className="flex items-center gap-1 shrink-0 rounded-full bg-orange-500/10 px-2 py-0.5"
            initial={{ opacity: 0, scale: 0.7 }}
            animate={isInView ? { opacity: 1, scale: 1 } : {}}
            transition={{ duration: 0.4, delay: 0.9 + i * 0.15, ease: EASE }}
          >
            <Flame className="w-2.5 h-2.5 text-orange-500" />
            <span className="text-[10px] font-bold text-orange-600 dark:text-orange-400">
              {row.score}
            </span>
          </motion.div>
        </div>
      ))}
    </div>
  )
}

// ─── Script generator: scene lines typing in ───
export function ScriptViz() {
  const ref = useRef<HTMLDivElement>(null)
  const isInView = useInView(ref, { once: true, margin: '-40px' })
  const lines = ['85%', '70%', '92%', '60%']

  return (
    <div
      ref={ref}
      className="mt-4 rounded-lg border border-border/60 bg-muted/40 p-3 space-y-2"
    >
      <motion.div
        className="inline-flex items-center rounded-md bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary uppercase tracking-wider"
        initial={{ opacity: 0, x: -8 }}
        animate={isInView ? { opacity: 1, x: 0 } : {}}
        transition={{ duration: 0.4, delay: 0.2, ease: EASE }}
      >
        Hook
      </motion.div>
      {lines.map((w, i) => (
        <motion.div
          key={i}
          className="h-1.5 rounded-full bg-foreground/10"
          style={{ transformOrigin: 'left', width: w }}
          initial={{ scaleX: 0, opacity: 0 }}
          animate={isInView ? { scaleX: 1, opacity: 1 } : {}}
          transition={{ duration: 0.5, delay: 0.4 + i * 0.12, ease: EASE }}
        />
      ))}
    </div>
  )
}

// ─── Smart crop: 16:9 frame narrowing to a tracked 9:16 region ───
export function CropViz() {
  const ref = useRef<HTMLDivElement>(null)
  const isInView = useInView(ref, { once: true, margin: '-40px' })

  return (
    <div
      ref={ref}
      className="mt-4 relative h-20 rounded-lg border border-border/60 bg-muted/40 overflow-hidden"
    >
      {/* Subject dot drifting */}
      <motion.div
        className="absolute top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-gradient-to-br from-primary/50 to-accent/50 blur-[1px]"
        animate={isInView ? { left: ['20%', '60%', '35%', '20%'] } : {}}
        transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
      />
      {/* Tracking 9:16 frame following the subject */}
      <motion.div
        className="absolute top-1 bottom-1 w-11 rounded-md border-2 border-primary/70 bg-primary/5"
        animate={isInView ? { left: ['17%', '57%', '32%', '17%'] } : {}}
        transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
      >
        <div className="absolute top-1 left-1/2 -translate-x-1/2 rounded-sm bg-primary px-1 py-px text-[8px] font-bold text-primary-foreground leading-none">
          9:16
        </div>
      </motion.div>
    </div>
  )
}
