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
      {/* Phone body with float animation */}
      <motion.div
        animate={{ y: [0, -10, 0] }}
        transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
        className="relative z-10"
      >
        {/* Outer phone chassis */}
        <div
          className="relative w-[260px] sm:w-[280px] rounded-[3rem] p-[3px]"
          style={{
            background:
              'linear-gradient(145deg, rgba(255,255,255,0.15) 0%, rgba(255,255,255,0.05) 50%, rgba(0,0,0,0.2) 100%)',
            boxShadow:
              '0 25px 60px -12px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.05), inset 0 1px 0 rgba(255,255,255,0.1)'
          }}
        >
          {/* Side buttons — left */}
          <div
            className="absolute -left-[2px] top-[18%] w-[3px] h-[18px] rounded-l-sm"
            style={{
              background:
                'linear-gradient(180deg, rgba(255,255,255,0.12), rgba(255,255,255,0.04))'
            }}
          />
          <div
            className="absolute -left-[2px] top-[28%] w-[3px] h-[30px] rounded-l-sm"
            style={{
              background:
                'linear-gradient(180deg, rgba(255,255,255,0.12), rgba(255,255,255,0.04))'
            }}
          />
          <div
            className="absolute -left-[2px] top-[40%] w-[3px] h-[30px] rounded-l-sm"
            style={{
              background:
                'linear-gradient(180deg, rgba(255,255,255,0.12), rgba(255,255,255,0.04))'
            }}
          />
          {/* Side button — right (power) */}
          <div
            className="absolute -right-[2px] top-[30%] w-[3px] h-[38px] rounded-r-sm"
            style={{
              background:
                'linear-gradient(180deg, rgba(255,255,255,0.12), rgba(255,255,255,0.04))'
            }}
          />

          {/* Inner bezel */}
          <div className="rounded-[2.8rem] bg-black overflow-hidden aspect-[9/19.5]">
            {/* Dynamic Island */}
            <div className="absolute top-[10px] left-1/2 -translate-x-1/2 z-30">
              <motion.div
                className="h-[22px] rounded-full bg-black flex items-center justify-center gap-1.5 px-1"
                initial={{ width: 90 }}
                animate={{ width: [90, 100, 90] }}
                transition={{
                  duration: 4,
                  repeat: Infinity,
                  ease: 'easeInOut'
                }}
              >
                <div className="w-[8px] h-[8px] rounded-full bg-zinc-900 ring-1 ring-zinc-800" />
                <div className="w-[5px] h-[5px] rounded-full bg-zinc-800" />
              </motion.div>
            </div>

            {/* Screen content */}
            <div className="relative w-full h-full">
              {/* Fake footage — cinematic gradient blobs */}
              <div className="absolute inset-0">
                <motion.div
                  className="absolute w-[80%] h-[50%] rounded-full blur-[60px]"
                  style={{
                    background:
                      'color-mix(in srgb, var(--primary) 50%, transparent)'
                  }}
                  animate={{
                    x: ['-10%', '45%', '-10%'],
                    y: ['10%', '50%', '10%']
                  }}
                  transition={{
                    duration: 11,
                    repeat: Infinity,
                    ease: 'easeInOut'
                  }}
                />
                <motion.div
                  className="absolute w-[65%] h-[45%] rounded-full blur-[60px]"
                  style={{
                    background:
                      'color-mix(in srgb, var(--accent) 40%, transparent)'
                  }}
                  animate={{
                    x: ['55%', '5%', '55%'],
                    y: ['60%', '15%', '60%']
                  }}
                  transition={{
                    duration: 13,
                    repeat: Infinity,
                    ease: 'easeInOut'
                  }}
                />
                <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/70" />
              </div>

              {/* Status bar */}
              <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-7 pt-[38px]">
                <span className="text-[11px] font-semibold text-white/80 tabular-nums">
                  9:41
                </span>
                <div className="flex items-center gap-1">
                  {/* Signal bars */}
                  <svg
                    width="15"
                    height="10"
                    viewBox="0 0 15 10"
                    className="text-white/70"
                  >
                    <rect
                      x="0"
                      y="7"
                      width="2.5"
                      height="3"
                      rx="0.5"
                      fill="currentColor"
                    />
                    <rect
                      x="4"
                      y="5"
                      width="2.5"
                      height="5"
                      rx="0.5"
                      fill="currentColor"
                    />
                    <rect
                      x="8"
                      y="2.5"
                      width="2.5"
                      height="7.5"
                      rx="0.5"
                      fill="currentColor"
                    />
                    <rect
                      x="12"
                      y="0"
                      width="2.5"
                      height="10"
                      rx="0.5"
                      fill="currentColor"
                    />
                  </svg>
                  {/* WiFi */}
                  <svg
                    width="13"
                    height="10"
                    viewBox="0 0 13 10"
                    className="text-white/70"
                  >
                    <path
                      d="M6.5 9.5a1 1 0 100-2 1 1 0 000 2z"
                      fill="currentColor"
                    />
                    <path
                      d="M3.8 6.8a3.8 3.8 0 015.4 0"
                      stroke="currentColor"
                      strokeWidth="1.2"
                      strokeLinecap="round"
                      fill="none"
                    />
                    <path
                      d="M1.5 4.5a6.8 6.8 0 0110 0"
                      stroke="currentColor"
                      strokeWidth="1.2"
                      strokeLinecap="round"
                      fill="none"
                    />
                  </svg>
                  {/* Battery */}
                  <div className="flex items-center gap-[1px]">
                    <div className="w-[18px] h-[9px] rounded-[2px] border border-white/50 p-[1.5px]">
                      <div className="h-full w-[75%] rounded-[1px] bg-white/70" />
                    </div>
                    <div className="w-[1.5px] h-[4px] rounded-r-full bg-white/50" />
                  </div>
                </div>
              </div>

              {/* Recording indicator */}
              <div className="absolute top-[62px] left-4 z-20 flex items-center gap-1.5 rounded-full bg-black/50 backdrop-blur-sm px-2.5 py-1">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                <span className="text-[9px] font-semibold text-white/90 tracking-wider uppercase">
                  9:16
                </span>
              </div>

              {/* Viral score chip */}
              <motion.div
                className="absolute top-[62px] right-4 z-20 flex items-center gap-1 rounded-full bg-black/50 backdrop-blur-sm px-2.5 py-1"
                initial={{ opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 1, duration: 0.5, ease: EASE }}
              >
                <Flame className="w-3 h-3 text-orange-400" />
                <span className="text-[10px] font-bold text-white tabular-nums">
                  94
                </span>
              </motion.div>

              {/* Animated captions */}
              <div className="absolute bottom-[22%] left-4 right-4 z-20 flex justify-center">
                <AnimatePresence mode="wait">
                  <motion.p
                    key={captionIndex}
                    className="text-center text-[14px] font-extrabold text-white leading-snug [text-shadow:0_2px_10px_rgba(0,0,0,0.8)]"
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
              <div className="absolute bottom-[10%] left-5 right-5 z-20">
                <div className="h-[3px] rounded-full bg-white/15 overflow-hidden">
                  <motion.div
                    className="h-full rounded-full"
                    style={{
                      width: `${progress}%`,
                      background:
                        'linear-gradient(90deg, var(--primary), var(--accent))'
                    }}
                  />
                </div>
              </div>

              {/* Home indicator */}
              <div className="absolute bottom-[4%] left-1/2 -translate-x-1/2 z-20 w-[35%] h-[4px] rounded-full bg-white/20" />
            </div>
          </div>
        </div>

        {/* Reflection highlight on glass */}
        <div
          className="absolute inset-0 rounded-[3rem] pointer-events-none"
          style={{
            background:
              'linear-gradient(135deg, rgba(255,255,255,0.07) 0%, transparent 40%, transparent 60%, rgba(255,255,255,0.03) 100%)'
          }}
        />
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

      {/* Compact fallback row for screens below xl */}
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
