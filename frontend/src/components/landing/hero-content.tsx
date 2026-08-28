'use client'

import { motion } from 'framer-motion'
import { ArrowRight, Play, Sparkles } from 'lucide-react'
import Link from 'next/link'

const ease = [0.16, 1, 0.3, 1] as const
const reveal = (delay: number) => ({
  initial: { opacity: 0, y: 22, filter: 'blur(8px)' },
  animate: { opacity: 1, y: 0, filter: 'blur(0px)' },
  transition: { duration: 0.85, delay, ease }
})

interface HeroLabels {
  badge: string
  heroTitle1: string
  heroTitle2: string
  heroDesc: string
  ctaFree: string
  ctaPricing: string
  ctaNote: string
}

export function HeroContent({ labels }: { labels: HeroLabels }) {
  return (
    <div className="relative mx-auto flex min-h-dvh max-w-5xl items-start justify-center px-5 pb-32 pt-[21vh] text-center sm:px-6 sm:pb-40 sm:pt-[18vh]">
      <div className="relative z-10 flex w-full flex-col items-center">
        <motion.div {...reveal(0.12)}>
          <div className="inline-flex max-w-full items-center gap-2 border-y border-white/10 bg-black/15 px-3 py-2 font-[family-name:var(--font-studio)] backdrop-blur-xl sm:px-4">
            <Sparkles className="h-3 w-3 text-violet-200" />
            <span className="truncate text-[8px] font-semibold uppercase tracking-[0.2em] text-white/60 sm:text-[9px] sm:tracking-[0.28em]">
              {labels.badge}
            </span>
          </div>
        </motion.div>

        <motion.h1
          {...reveal(0.25)}
          className="mt-4 max-w-5xl font-[family-name:var(--font-cinematic)] text-[clamp(2.85rem,7.2vw,7.5rem)] font-medium leading-[0.88] tracking-[-0.05em] text-white sm:mt-5 sm:leading-[0.86] sm:tracking-[-0.055em]"
        >
          <span className="block">{labels.heroTitle1}</span>
          <span className="mt-2 block bg-gradient-to-r from-violet-200 via-white to-cyan-100 bg-clip-text pb-2 font-normal italic text-transparent [text-shadow:0_14px_55px_rgba(139,92,246,0.16)] sm:mt-3">
            {labels.heroTitle2}
          </span>
        </motion.h1>

        <motion.p
          {...reveal(0.4)}
          className="mt-6 max-w-[330px] font-[family-name:var(--font-studio)] text-[13px] font-light leading-6 tracking-[0.01em] text-white/52 sm:max-w-xl sm:text-[15px] sm:leading-7"
        >
          {labels.heroDesc}
        </motion.p>

        <motion.div
          {...reveal(0.55)}
          className="mt-7 flex w-full max-w-[310px] flex-col items-center gap-3 font-[family-name:var(--font-studio)] sm:mt-8 sm:w-auto sm:max-w-none sm:flex-row"
        >
          <Link
            href="/register"
            className="group relative inline-flex min-h-13 w-full items-center justify-center overflow-hidden rounded-[14px] border border-violet-200/35 bg-gradient-to-b from-violet-200/25 to-violet-400/10 p-px shadow-[0_16px_45px_rgba(109,40,217,0.24),inset_0_1px_0_rgba(255,255,255,0.3)] transition-all duration-300 hover:-translate-y-0.5 hover:border-cyan-100/45 hover:shadow-[0_20px_60px_rgba(109,40,217,0.36)] sm:w-auto"
          >
            <span className="absolute inset-0 -translate-x-[120%] bg-gradient-to-r from-transparent via-white/20 to-transparent transition-transform duration-700 group-hover:translate-x-[120%]" />
            <span className="relative flex min-h-[50px] w-full items-center justify-between gap-4 rounded-[13px] bg-[#0b0712]/88 px-2 pl-5 text-[11px] font-semibold uppercase tracking-[0.11em] text-white backdrop-blur-xl sm:w-auto sm:text-[12px] sm:tracking-[0.12em]">
              {labels.ctaFree}
              <span className="flex h-9 w-9 items-center justify-center rounded-[9px] border border-white/10 bg-white text-black shadow-[0_0_20px_rgba(255,255,255,0.2)]">
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </span>
            </span>
          </Link>
          <Link
            href="/pricing"
            className="group inline-flex min-h-13 w-full items-center justify-center gap-3 rounded-[14px] border border-white/10 bg-black/20 px-4 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/55 backdrop-blur-xl transition-all duration-300 hover:border-white/20 hover:bg-white/[0.06] hover:text-white sm:w-auto sm:justify-start sm:pr-5 sm:text-[11px]"
          >
            <span className="relative flex h-8 w-8 items-center justify-center rounded-full border border-white/15 bg-white/[0.06]">
              <span className="absolute inset-0 rounded-full border border-violet-300/20 transition-transform duration-500 group-hover:scale-125 group-hover:opacity-0" />
              <Play className="h-2.5 w-2.5 fill-current text-violet-100" />
            </span>
            {labels.ctaPricing}
          </Link>
        </motion.div>

        <motion.div
          {...reveal(0.68)}
          className="mt-5 hidden items-center gap-3 font-[family-name:var(--font-studio)] text-[9px] font-medium uppercase tracking-[0.18em] text-white/28 sm:flex"
        >
          <span className="h-px w-5 bg-gradient-to-r from-transparent to-white/20" />
          {labels.ctaNote}
          <span className="h-px w-5 bg-gradient-to-l from-transparent to-white/20" />
        </motion.div>
      </div>
    </div>
  )
}
