'use client'

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Check, Play, RotateCcw, Sparkles } from 'lucide-react'
import { useEffect, useState } from 'react'

const clips = [
  {
    score: 94,
    time: '00:42',
    color: '#5139EF',
    caption: 'THIS CHANGES EVERYTHING'
  },
  {
    score: 89,
    time: '01:18',
    color: '#5139EF',
    caption: 'THE PART NOBODY TELLS YOU'
  },
  { score: 86, time: '02:06', color: '#5139EF', caption: 'SAVE THIS FOR LATER' }
]

const waveform = [
  18, 29, 14, 35, 24, 42, 20, 31, 16, 39, 27, 45, 19, 33, 22, 38, 17, 29, 41,
  25, 34, 16, 30, 21
]

export function TransformationStage({ locale }: { locale: string }) {
  const reduceMotion = useReducedMotion()
  const [run, setRun] = useState(0)
  const [phase, setPhase] = useState(0)
  const copy =
    locale === 'ro'
      ? {
          editor: 'Editor AI Sneepcut',
          videoCaption: 'Momentul în care totul a devenit clar',
          clipCaptions: [
            'ASTA SCHIMBĂ TOT',
            'PARTEA PE CARE NU ȚI-O SPUNE NIMENI',
            'SALVEAZĂ PENTRU MAI TÂRZIU'
          ],
          aria: 'Demonstrație animată a fluxului Sneepcut',
          replay: 'Reia',
          source: 'Sursă',
          tracked: 'Vorbitor urmărit',
          transcript: 'Transcriere analizată',
          selections: 'Selecții AI',
          found: '3 clipuri găsite',
          ready: 'Gata',
          highlight: 'Moment',
          phases: [
            'Analizăm contextul video…',
            'Detectăm cele mai bune momente…',
            'Adaptăm cadrul și adăugăm subtitrări…',
            'Clipurile sunt gata de verificat'
          ]
        }
      : {
          editor: 'Sneepcut AI editor',
          videoCaption: 'The moment everything finally clicked',
          clipCaptions: clips.map((clip) => clip.caption),
          aria: 'Animated Sneepcut product workflow',
          replay: 'Replay',
          source: 'Source',
          tracked: 'Speaker tracked',
          transcript: 'Transcript analyzed',
          selections: 'AI selections',
          found: '3 clips found',
          ready: 'Ready',
          highlight: 'Highlight',
          phases: [
            'Reading video context…',
            'Detecting strongest moments…',
            'Reframing and adding captions…',
            'Clips ready to review'
          ]
        }

  // biome-ignore lint/correctness/useExhaustiveDependencies: run is an intentional replay token.
  useEffect(() => {
    if (reduceMotion) {
      setPhase(3)
      return
    }
    setPhase(0)
    const timers = [700, 2100, 3600].map((delay, index) =>
      window.setTimeout(() => setPhase(index + 1), delay)
    )
    return () => timers.forEach(window.clearTimeout)
  }, [run, reduceMotion])

  return (
    <div
      className="relative mx-auto w-full max-w-[1180px]"
      aria-label={copy.aria}
      role="region"
    >
      <div className="absolute -inset-10 rounded-[3rem] bg-[#5139EF]/12 blur-3xl" />
      <div className="relative overflow-hidden rounded-[22px] border border-[#5139EF]/20 bg-[#101010] shadow-[0_55px_120px_rgba(0,0,0,.58)]">
        <div className="flex h-12 items-center justify-between border-b border-white/10 px-4 sm:px-5">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-[#5139EF]/30" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#5139EF]/60" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#5139EF]" />
          </div>
          <div className="hidden items-center gap-2 text-[9px] font-bold uppercase tracking-[.16em] text-white/35 sm:flex">
            <Sparkles className="h-3 w-3 text-[#5139EF]" /> {copy.editor}
          </div>
          <button
            type="button"
            onClick={() => setRun((value) => value + 1)}
            className="flex h-11 min-h-0 items-center gap-1.5 rounded-md border border-white/10 px-3 text-[10px] font-bold uppercase tracking-[.12em] text-white/60 hover:bg-white/[.05] hover:text-white"
            aria-label={copy.replay}
          >
            <RotateCcw className="h-3 w-3" /> {copy.replay}
          </button>
        </div>

        <div className="grid min-h-[500px] lg:grid-cols-[1.55fr_.85fr]">
          <div className="border-b border-white/10 p-3 sm:p-5 lg:border-b-0 lg:border-r">
            <div className="relative aspect-video overflow-hidden rounded-xl border border-white/10 bg-[#181818]">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_28%_35%,rgba(81,57,239,.34)_0,transparent_27%),radial-gradient(circle_at_68%_42%,rgba(81,57,239,.16)_0,transparent_25%),linear-gradient(135deg,#202020,#0d0d0d)]" />
              <div className="absolute bottom-0 left-[16%] h-[72%] w-[27%] rounded-t-[48%] bg-[#151515] shadow-[0_0_60px_rgba(81,57,239,.16)]">
                <div className="mx-auto mt-[-18%] aspect-square w-[48%] rounded-full bg-[#383838]" />
              </div>
              <div className="absolute bottom-0 right-[15%] h-[66%] w-[25%] rounded-t-[48%] bg-[#1c1c1c]">
                <div className="mx-auto mt-[-18%] aspect-square w-[48%] rounded-full bg-[#303030]" />
              </div>
              <div className="absolute left-3 top-3 flex items-center gap-2 rounded-md bg-black/45 px-2.5 py-1.5 backdrop-blur">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#5139EF]" />
                <span className="text-[10px] font-bold uppercase tracking-[.12em] text-white/70">
                  {copy.source} · 24:18
                </span>
              </div>
              <div className="absolute inset-x-[9%] bottom-5 text-center">
                <span className="rounded bg-black/70 px-2 py-1 text-[clamp(10px,1.25vw,17px)] font-black uppercase leading-relaxed text-white">
                  {copy.videoCaption}
                </span>
              </div>
              <motion.div
                key={`scan-${run}`}
                className="absolute inset-y-0 w-px bg-[#5139EF] shadow-[0_0_22px_5px_rgba(81,57,239,.55)]"
                initial={reduceMotion ? false : { left: '0%', opacity: 0 }}
                animate={
                  reduceMotion
                    ? { left: '48%', opacity: 0.7 }
                    : { left: '100%', opacity: [0, 1, 1, 0] }
                }
                transition={{ duration: 2.1, delay: 0.45, ease: 'easeInOut' }}
              />
              <AnimatePresence>
                {phase >= 1 && (
                  <motion.div
                    className="absolute left-[23%] top-[16%] h-[70%] w-[25%] rounded-lg border-2 border-[#5139EF]"
                    initial={reduceMotion ? false : { opacity: 0, scale: 0.85 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0 }}
                  >
                    <span className="absolute -top-6 left-0 rounded-t bg-[#5139EF] px-2 py-1 text-[9px] font-black uppercase text-white">
                      {copy.tracked}
                    </span>
                  </motion.div>
                )}
              </AnimatePresence>
              <div className="absolute inset-0 bg-gradient-to-t from-black/35 via-transparent to-black/15" />
              <span className="absolute left-1/2 top-1/2 flex h-12 w-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white/25 bg-black/30 backdrop-blur">
                <Play className="ml-0.5 h-4 w-4 fill-white text-white" />
              </span>
            </div>

            <div className="mt-3 rounded-xl border border-white/10 bg-black/20 p-3">
              <div className="flex items-end gap-1 overflow-hidden">
                {waveform.map((height, index) => (
                  <motion.span
                    key={index}
                    className="w-full rounded-full bg-white/20"
                    style={{ height }}
                    animate={
                      phase >= 1 && index > 6 && index < 17
                        ? { backgroundColor: '#5139EF', opacity: 1 }
                        : { opacity: 0.55 }
                    }
                    transition={
                      reduceMotion ? { duration: 0 } : { delay: index * 0.025 }
                    }
                  />
                ))}
              </div>
              <div className="relative mt-3 h-7 overflow-hidden rounded-md bg-[#202020]">
                <motion.div
                  key={`timeline-${run}`}
                  className="absolute inset-y-0 left-[28%] rounded border border-[#5139EF]/70 bg-[#5139EF]/20"
                  initial={reduceMotion ? false : { width: 0 }}
                  animate={{ width: phase >= 1 ? '44%' : 0 }}
                  transition={{ duration: reduceMotion ? 0 : 0.8 }}
                />
                <motion.span
                  key={`playhead-${run}`}
                  className="absolute inset-y-0 w-px bg-white"
                  initial={reduceMotion ? false : { left: '4%' }}
                  animate={{ left: reduceMotion ? '62%' : '92%' }}
                  transition={{
                    duration: reduceMotion ? 0 : 4.4,
                    ease: 'linear'
                  }}
                />
              </div>
              <div className="mt-2 flex justify-between text-[10px] font-bold uppercase tracking-[.12em] text-white/35">
                <span>{copy.transcript}</span>
                <span>24:18:09</span>
              </div>
            </div>
          </div>

          <div className="relative flex flex-col bg-[#0d0d0d] p-4 sm:p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[.16em] text-[#5139EF]">
                  {copy.selections}
                </p>
                <h3 className="mt-1 text-lg font-semibold text-white">
                  {copy.found}
                </h3>
              </div>
              <AnimatePresence>
                {phase >= 3 && (
                  <motion.span
                    className="flex items-center gap-1 rounded-full border border-[#5139EF]/30 bg-[#5139EF]/10 px-2.5 py-1 text-[10px] font-bold text-white/75"
                    initial={reduceMotion ? false : { opacity: 0 }}
                    animate={{ opacity: 1 }}
                  >
                    <Check className="h-3 w-3" /> {copy.ready}
                  </motion.span>
                )}
              </AnimatePresence>
            </div>
            <div className="mt-5 grid flex-1 grid-cols-1 gap-2 sm:grid-cols-3 lg:grid-cols-1">
              {clips.map((clip, index) => (
                <motion.article
                  key={clip.score}
                  className="group grid min-w-0 grid-cols-[82px_minmax(0,1fr)] overflow-hidden rounded-lg border border-white/10 bg-[#181818] sm:grid-cols-1 lg:grid-cols-[72px_minmax(0,1fr)]"
                  initial={reduceMotion ? false : { opacity: 0, x: 20 }}
                  animate={
                    phase >= 2 ? { opacity: 1, x: 0 } : { opacity: 0.18, x: 8 }
                  }
                  transition={
                    reduceMotion
                      ? { duration: 0 }
                      : { delay: index * 0.16, duration: 0.55 }
                  }
                >
                  <div className="relative min-h-24 overflow-hidden bg-[#202020] sm:min-h-28 lg:min-h-0">
                    <div
                      className="absolute inset-0"
                      style={{
                        background: `radial-gradient(circle at 50% 38%,${clip.color}80 0,transparent 28%),linear-gradient(145deg,#2a2a2a,#111111)`
                      }}
                    />
                    <div className="absolute bottom-3 left-1 right-1 text-center text-[9px] font-black leading-tight text-white">
                      {copy.clipCaptions[index]}
                    </div>
                  </div>
                  <div className="flex min-w-0 flex-col justify-between p-2.5 sm:p-3">
                    <div>
                      <div className="flex items-center gap-1 text-[11px] font-bold text-white">
                        <Sparkles className="h-3 w-3 text-[#5139EF]" />{' '}
                        {clip.score}
                        <span className="font-normal text-white/40">
                          {' '}
                          / 100
                        </span>
                      </div>
                      <p className="mt-1 truncate text-[11px] text-white/50 sm:mt-2">
                        {copy.highlight} #{index + 1}
                      </p>
                    </div>
                    <div className="mt-2 flex items-center justify-between text-[9px] font-bold text-white/35">
                      <span>9:16</span>
                      <span>{clip.time}</span>
                    </div>
                  </div>
                </motion.article>
              ))}
            </div>
          </div>
        </div>

        <div className="flex h-11 items-center gap-3 border-t border-white/10 px-4 text-[10px] font-bold uppercase tracking-[.12em] text-white/40">
          <motion.span
            className="h-1.5 w-1.5 rounded-full bg-[#5139EF]"
            animate={reduceMotion ? undefined : { opacity: [1, 0.25, 1] }}
            transition={{ duration: 1.2, repeat: Infinity }}
          />
          {copy.phases[phase]}
        </div>
      </div>
    </div>
  )
}
