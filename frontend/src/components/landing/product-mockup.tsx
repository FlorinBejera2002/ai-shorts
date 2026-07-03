'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { AudioLines, Captions, Check, Flame } from 'lucide-react'
import { useEffect, useState } from 'react'

export interface MockupLabels {
  transcription: string
  clipsReady: string
  viralScore: string
  autoCaptions: string
  captions: string[]
}

const EASE = [0.16, 1, 0.3, 1] as const

// ─── Animated waveform bars ───
function Waveform() {
  const bars = [14, 22, 10, 26, 18, 24, 12, 20]
  return (
    <div className="flex items-center gap-[3px] h-7">
      {bars.map((h, i) => (
        <motion.div
          key={i}
          className="w-[3px] rounded-full bg-primary"
          animate={{ height: [h * 0.4, h, h * 0.55, h * 0.9, h * 0.4] }}
          transition={{
            duration: 1.6,
            repeat: Infinity,
            ease: 'easeInOut',
            delay: i * 0.12
          }}
        />
      ))}
    </div>
  )
}

// ─── Satellite card floating around the phone ───
function SatelliteCard({
  children,
  className = '',
  delay = 0,
  bob = 8
}: {
  children: React.ReactNode
  className?: string
  delay?: number
  bob?: number
}) {
  return (
    <motion.div
      className={`absolute z-20 rounded-xl border border-border/70 bg-card/90 backdrop-blur-md px-3.5 py-2.5 shadow-lg shadow-black/5 ${className}`}
      initial={{ opacity: 0, scale: 0.8, y: 12 }}
      animate={{ opacity: 1, scale: 1, y: [0, -bob, 0] }}
      transition={{
        opacity: { duration: 0.6, delay, ease: EASE },
        scale: { duration: 0.6, delay, ease: EASE },
        y: {
          duration: 5 + delay,
          repeat: Infinity,
          ease: 'easeInOut',
          delay: delay + 0.6
        }
      }}
    >
      {children}
    </motion.div>
  )
}

// ─── The 9:16 phone clip preview ───
export function ProductMockup({ labels }: { labels: MockupLabels }) {
  const [captionIndex, setCaptionIndex] = useState(0)
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    const id = setInterval(() => {
      setCaptionIndex((i) => (i + 1) % labels.captions.length)
    }, 2600)
    return () => clearInterval(id)
  }, [labels.captions.length])

  useEffect(() => {
    const id = setInterval(() => {
      setProgress((p) => (p >= 100 ? 0 : p + 0.5))
    }, 40)
    return () => clearInterval(id)
  }, [])

  return (
    <motion.div
      className="relative"
      initial={{ opacity: 0, scale: 0.9, y: 24 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.9, delay: 0.2, ease: EASE }}
    >
      {/* Ambient glow */}
      <motion.div
        className="absolute inset-[-40%] rounded-full pointer-events-none"
        style={{
          background:
            'radial-gradient(circle, color-mix(in srgb, var(--primary) 16%, transparent) 0%, color-mix(in srgb, var(--accent) 8%, transparent) 45%, transparent 70%)'
        }}
        animate={{ scale: [1, 1.06, 1], opacity: [0.7, 1, 0.7] }}
        transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
      />

      {/* Phone frame */}
      <motion.div
        animate={{ y: [0, -10, 0] }}
        transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
        className="relative z-10 w-[250px] sm:w-[270px] aspect-[9/16] rounded-[2.2rem] border border-border/80 bg-zinc-950 shadow-2xl shadow-primary/10 overflow-hidden"
      >
        {/* Fake footage — moving gradient blobs */}
        <div className="absolute inset-0">
          <motion.div
            className="absolute w-[70%] h-[45%] rounded-full blur-3xl"
            style={{
              background: 'color-mix(in srgb, var(--primary) 55%, transparent)'
            }}
            animate={{ x: ['-10%', '55%', '-10%'], y: ['15%', '55%', '15%'] }}
            transition={{ duration: 11, repeat: Infinity, ease: 'easeInOut' }}
          />
          <motion.div
            className="absolute w-[60%] h-[40%] rounded-full blur-3xl"
            style={{
              background: 'color-mix(in srgb, var(--accent) 45%, transparent)'
            }}
            animate={{ x: ['60%', '0%', '60%'], y: ['65%', '20%', '65%'] }}
            transition={{ duration: 13, repeat: Infinity, ease: 'easeInOut' }}
          />
          <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-black/70" />
        </div>

        {/* Top chips */}
        <div className="absolute top-4 left-4 right-4 flex items-center justify-between z-10">
          <div className="flex items-center gap-1.5 rounded-full bg-black/50 backdrop-blur-sm px-2.5 py-1">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse-dot" />
            <span className="text-[10px] font-semibold text-white/90 tracking-wide">
              9:16
            </span>
          </div>
          <motion.div
            className="flex items-center gap-1 rounded-full bg-black/50 backdrop-blur-sm px-2.5 py-1"
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 1, duration: 0.5, ease: EASE }}
          >
            <Flame className="w-3 h-3 text-orange-400" />
            <span className="text-[10px] font-bold text-white">94</span>
          </motion.div>
        </div>

        {/* Animated captions — TikTok style */}
        <div className="absolute bottom-[22%] left-4 right-4 z-10 flex justify-center">
          <AnimatePresence mode="wait">
            <motion.p
              key={captionIndex}
              className="text-center text-[15px] font-extrabold text-white leading-snug [text-shadow:0_2px_10px_rgba(0,0,0,0.8)]"
              initial={{ opacity: 0, y: 10, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.95 }}
              transition={{ duration: 0.35, ease: EASE }}
            >
              <span className="bg-primary/90 box-decoration-clone px-1.5 py-0.5 rounded-md">
                {labels.captions[captionIndex]}
              </span>
            </motion.p>
          </AnimatePresence>
        </div>

        {/* Progress bar */}
        <div className="absolute bottom-5 left-4 right-4 z-10">
          <div className="h-[3px] rounded-full bg-white/20 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-primary to-accent"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </motion.div>

      {/* Satellite cards */}
      <SatelliteCard
        className="top-[8%] -left-[28%] hidden xl:block"
        delay={0.7}
      >
        <div className="flex items-center gap-2.5">
          <Waveform />
          <span className="text-[11px] font-medium text-muted-foreground whitespace-nowrap">
            {labels.transcription}
          </span>
        </div>
      </SatelliteCard>

      <SatelliteCard
        className="top-[38%] -right-[30%] hidden xl:block"
        delay={1}
        bob={10}
      >
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-orange-500/10 flex items-center justify-center">
            <Flame className="w-3.5 h-3.5 text-orange-500" />
          </div>
          <div>
            <div className="text-[13px] font-bold leading-none">94 / 100</div>
            <div className="text-[10px] text-muted-foreground mt-0.5 whitespace-nowrap">
              {labels.viralScore}
            </div>
          </div>
        </div>
      </SatelliteCard>

      <SatelliteCard
        className="bottom-[18%] -left-[24%] hidden xl:block"
        delay={1.3}
        bob={7}
      >
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-success/10 flex items-center justify-center">
            <Check className="w-3.5 h-3.5 text-success" strokeWidth={3} />
          </div>
          <span className="text-[11px] font-semibold whitespace-nowrap">
            {labels.clipsReady}
          </span>
        </div>
      </SatelliteCard>

      <SatelliteCard
        className="bottom-[4%] -right-[18%] hidden xl:block"
        delay={1.6}
        bob={9}
      >
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
            <Captions className="w-3.5 h-3.5 text-primary" />
          </div>
          <span className="text-[11px] font-semibold whitespace-nowrap">
            {labels.autoCaptions}
          </span>
        </div>
      </SatelliteCard>

      {/* Compact fallback row for screens below xl (satellites hidden) */}
      <motion.div
        className="xl:hidden mt-6 flex flex-wrap justify-center gap-2"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.8, duration: 0.6, ease: EASE }}
      >
        {[
          { icon: AudioLines, label: labels.transcription },
          { icon: Flame, label: labels.viralScore },
          { icon: Check, label: labels.clipsReady }
        ].map(({ icon: Icon, label }) => (
          <div
            key={label}
            className="flex items-center gap-1.5 rounded-full border border-border/70 bg-card/80 px-3 py-1.5"
          >
            <Icon className="w-3 h-3 text-primary" />
            <span className="text-[11px] font-medium text-muted-foreground">
              {label}
            </span>
          </div>
        ))}
      </motion.div>
    </motion.div>
  )
}
