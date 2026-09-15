'use client'

import { motion, useReducedMotion } from 'framer-motion'
import { Check, FileVideo2, Play, Sparkles } from 'lucide-react'

const ease = [0.16, 1, 0.3, 1] as const
const waveform = [
  22, 45, 30, 62, 38, 76, 46, 58, 34, 70, 44, 82, 52, 64, 38, 72, 48, 60
]

function PanelFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative h-44 overflow-hidden rounded-xl border border-white/[0.08] bg-[#0a0a0a] p-4">
      <div className="pointer-events-none absolute inset-0 opacity-[0.07] [background-image:linear-gradient(rgba(255,255,255,.24)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.24)_1px,transparent_1px)] [background-size:30px_30px]" />
      <div className="relative h-full">{children}</div>
    </div>
  )
}

export function UploadWorkflowVisual() {
  const reduceMotion = useReducedMotion()

  return (
    <PanelFrame>
      <div className="absolute inset-x-2 top-2 rounded-lg border border-dashed border-[#5139ef]/45 bg-[#5139ef]/[0.06] p-4">
        <motion.span
          animate={reduceMotion ? undefined : { y: [0, -4, 0] }}
          transition={{
            duration: 2.8,
            repeat: Number.POSITIVE_INFINITY,
            ease: 'easeInOut'
          }}
          className="mx-auto grid h-10 w-10 place-items-center rounded-xl bg-[#5139ef] text-white shadow-[0_10px_35px_rgba(81,57,239,.3)]"
        >
          <FileVideo2 className="h-4 w-4" />
        </motion.span>
        <div className="mx-auto mt-3 h-1.5 w-24 rounded-full bg-white/10" />
        <div className="mx-auto mt-2 h-1 w-16 rounded-full bg-white/[0.06]" />
      </div>
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5, duration: 0.6, ease }}
        className="absolute inset-x-6 bottom-1 flex items-center gap-2 rounded-lg border border-[#5139ef]/20 bg-[#121212] px-3 py-2"
      >
        <span className="h-1.5 w-1.5 rounded-full bg-[#5139ef]" />
        <span className="h-1 flex-1 rounded-full bg-white/10" />
        <span className="font-mono text-[8px] text-white/35">100%</span>
      </motion.div>
    </PanelFrame>
  )
}

export function AnalyzeWorkflowVisual() {
  const reduceMotion = useReducedMotion()

  return (
    <PanelFrame>
      <div className="absolute inset-x-1 top-2 flex h-20 items-center gap-1 overflow-hidden rounded-lg border border-white/[0.06] bg-white/[0.02] px-3">
        {waveform.map((height, index) => (
          <motion.span
            key={`${height}-${index}`}
            initial={{ scaleY: 0.35, opacity: 0.2 }}
            animate={
              reduceMotion
                ? { scaleY: 1, opacity: index > 4 && index < 14 ? 1 : 0.25 }
                : {
                    scaleY: [0.45, 1, 0.45],
                    opacity: index > 4 && index < 14 ? [0.55, 1, 0.55] : 0.25
                  }
            }
            transition={{
              duration: 1.5 + (index % 3) * 0.35,
              repeat: Number.POSITIVE_INFINITY,
              ease: 'easeInOut'
            }}
            className={
              index > 4 && index < 14
                ? 'w-full rounded-full bg-[#5139ef]'
                : 'w-full rounded-full bg-white/20'
            }
            style={{ height: `${height}%` }}
          />
        ))}
        <motion.i
          animate={reduceMotion ? undefined : { left: ['8%', '90%', '8%'] }}
          transition={{
            duration: 4.8,
            repeat: Number.POSITIVE_INFINITY,
            ease: 'linear'
          }}
          className="absolute inset-y-0 w-px bg-[#5139ef] shadow-[0_0_16px_rgba(81,57,239,.8)]"
        />
      </div>
      <div className="absolute inset-x-1 bottom-2 grid grid-cols-3 gap-2">
        {[94, 89, 86].map((score, index) => (
          <motion.div
            key={score}
            initial={{ opacity: 0, y: 7 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35 + index * 0.13, duration: 0.5, ease }}
            className="rounded-lg border border-white/[0.07] bg-[#121212] px-2.5 py-2.5"
          >
            <Sparkles className="h-3 w-3 text-[#5139ef]" />
            <span className="mt-2 block text-[12px] font-bold text-white/80">
              {score}
            </span>
            <span
              className="mt-1 block h-1 rounded-full bg-[#5139ef]"
              style={{ opacity: 1 - index * 0.2 }}
            />
          </motion.div>
        ))}
      </div>
    </PanelFrame>
  )
}

export function ExportWorkflowVisual() {
  const reduceMotion = useReducedMotion()

  return (
    <PanelFrame>
      <motion.div
        animate={
          reduceMotion ? undefined : { y: [0, -4, 0], rotate: [-1, 1, -1] }
        }
        transition={{
          duration: 5,
          repeat: Number.POSITIVE_INFINITY,
          ease: 'easeInOut'
        }}
        className="absolute left-3 top-1 h-28 w-20 overflow-hidden rounded-[10px] border border-[#5139ef]/35 bg-[linear-gradient(145deg,#1c1c1c,#0e0e0e)] shadow-[0_16px_40px_rgba(0,0,0,.35)]"
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_65%_20%,rgba(81,57,239,.55),transparent_30%)]" />
        <span className="absolute left-1/2 top-1/2 grid h-7 w-7 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-white text-[#5139ef]">
          <Play className="ml-0.5 h-2.5 w-2.5 fill-current" />
        </span>
        <span className="absolute inset-x-2 bottom-3 h-1 rounded-full bg-[#5139ef]" />
      </motion.div>
      <div className="absolute bottom-2 right-1 top-1 grid w-[68%] grid-cols-2 content-center gap-1.5">
        {['TikTok', 'Instagram', 'Facebook', 'YouTube', 'LinkedIn', 'X'].map(
          (platform, index) => (
            <motion.div
              key={platform}
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.35 + index * 0.12, duration: 0.5, ease }}
              className="flex items-center gap-1.5 rounded-md border border-white/[0.07] bg-[#121212] px-2 py-1.5"
            >
              <span className="grid h-5 w-5 place-items-center rounded-md bg-[#5139ef]/15 text-[#5139ef]">
                <Check className="h-3 w-3" strokeWidth={2.5} />
              </span>
              <span className="text-[9px] font-semibold text-white/55">
                {platform}
              </span>
              <span className="ml-auto h-1.5 w-1.5 rounded-full bg-[#5139ef]" />
            </motion.div>
          )
        )}
      </div>
    </PanelFrame>
  )
}
