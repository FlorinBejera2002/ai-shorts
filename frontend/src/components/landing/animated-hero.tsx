'use client'

import { motion, useScroll, useTransform, useInView } from 'framer-motion'
import Image from 'next/image'
import { type ReactNode, useRef } from 'react'

// ─── Animated nav logo ───
export function NavLogo() {
  return (
    <motion.div
      className="flex items-center gap-2.5"
      initial={{ opacity: 0, x: -16 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
    >
      <Image src="/logo.webp" alt="AI Video Creator" width={34} height={34} className="rounded-lg" priority />
      <span className="text-[15px] font-bold tracking-tight gradient-text">AI Video Creator</span>
    </motion.div>
  )
}

// ─── Full-screen hero wrapper with parallax ───
export function HeroSection({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end start'] })
  const bgY = useTransform(scrollYProgress, [0, 1], ['0%', '30%'])
  const opacity = useTransform(scrollYProgress, [0, 0.8], [1, 0])

  return (
    <section ref={ref} className="relative min-h-[90vh] flex items-center overflow-hidden">
      {/* Gradient mesh background */}
      <motion.div className="absolute inset-0 z-0" style={{ y: bgY }}>
        <div className="absolute top-[-20%] left-[-10%] w-[60vw] h-[60vw] rounded-full bg-[#6366f1]/8 blur-[120px]" />
        <div className="absolute top-[10%] right-[-5%] w-[50vw] h-[50vw] rounded-full bg-[#d946ef]/6 blur-[100px]" />
        <div className="absolute bottom-[-10%] left-[30%] w-[40vw] h-[40vw] rounded-full bg-[#f97316]/5 blur-[100px]" />
      </motion.div>

      {/* Grid pattern overlay */}
      <div className="absolute inset-0 z-0 opacity-[0.03]" style={{
        backgroundImage: 'linear-gradient(var(--foreground) 1px, transparent 1px), linear-gradient(90deg, var(--foreground) 1px, transparent 1px)',
        backgroundSize: '64px 64px',
      }} />

      <motion.div className="relative z-10 w-full" style={{ opacity }}>
        {children}
      </motion.div>

      {/* Bottom fade */}
      <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-background to-transparent z-10" />
    </section>
  )
}

// ─── Floating logo with glow ───
export function HeroLogo() {
  return (
    <motion.div
      className="relative"
      initial={{ opacity: 0, scale: 0.5, rotate: -10 }}
      animate={{ opacity: 1, scale: 1, rotate: 0 }}
      transition={{ duration: 1, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
    >
      {/* Glow rings */}
      <motion.div
        className="absolute inset-[-60%] rounded-full"
        style={{ background: 'radial-gradient(circle, rgba(99,102,241,0.15) 0%, rgba(139,92,246,0.08) 40%, transparent 70%)' }}
        animate={{ scale: [1, 1.08, 1], opacity: [0.6, 1, 0.6] }}
        transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute inset-[-30%] rounded-full"
        style={{ background: 'radial-gradient(circle, rgba(217,70,239,0.12) 0%, transparent 60%)' }}
        animate={{ scale: [1.05, 1, 1.05], opacity: [0.5, 0.8, 0.5] }}
        transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut', delay: 1 }}
      />
      <motion.div
        animate={{ y: [0, -8, 0] }}
        transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
      >
        <Image
          src="/logo.webp"
          alt="AI Video Creator"
          width={320}
          height={320}
          className="relative z-10 drop-shadow-2xl"
          priority
        />
      </motion.div>
    </motion.div>
  )
}

// ─── Text reveal animation ───
export function TextReveal({ children, delay = 0, className = '' }: { children: ReactNode; delay?: number; className?: string }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 30, filter: 'blur(8px)' }}
      animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
      transition={{ duration: 0.8, delay, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
  )
}

// ─── Scroll-triggered section reveal ───
export function SectionReveal({ children, className = '' }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const isInView = useInView(ref, { once: true, margin: '-80px' })

  return (
    <motion.div
      ref={ref}
      className={className}
      initial={{ opacity: 0, y: 48 }}
      animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 48 }}
      transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
  )
}

// ─── Stagger container for grids ───
export function StaggerGrid({ children, className = '' }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const isInView = useInView(ref, { once: true, margin: '-60px' })

  return (
    <motion.div
      ref={ref}
      className={className}
      initial="hidden"
      animate={isInView ? 'visible' : 'hidden'}
      variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.08 } } }}
    >
      {children}
    </motion.div>
  )
}

export function StaggerItem({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <motion.div
      className={className}
      variants={{
        hidden: { opacity: 0, y: 24, scale: 0.96 },
        visible: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] } },
      }}
    >
      {children}
    </motion.div>
  )
}

// ─── Animated stat counter ───
export function AnimatedStat({ value, label }: { value: string; label: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const isInView = useInView(ref, { once: true })

  return (
    <motion.div
      ref={ref}
      className="text-center py-2"
      initial={{ opacity: 0, y: 16 }}
      animate={isInView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="text-3xl font-bold tracking-tight gradient-text">{value}</div>
      <div className="mt-1 text-[11px] text-muted-foreground uppercase tracking-[0.15em]">{label}</div>
    </motion.div>
  )
}

// ─── Bento card with hover glow ───
export function BentoCard({ children, className = '', large = false }: { children: ReactNode; className?: string; large?: boolean }) {
  return (
    <motion.div
      className={`group relative rounded-2xl border border-border/60 bg-card/50 backdrop-blur-sm overflow-hidden transition-all duration-300 hover:border-primary/30 hover:shadow-[0_0_40px_-12px] hover:shadow-primary/15 ${large ? 'sm:col-span-2 sm:row-span-2' : ''} ${className}`}
      whileHover={{ y: -3 }}
      transition={{ duration: 0.2 }}
    >
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 bg-gradient-to-br from-primary/[0.03] via-transparent to-accent/[0.03]" />
      <div className="relative z-10">{children}</div>
    </motion.div>
  )
}

// ─── Floating particles ───
export function FloatingElements() {
  const elements = [
    { x: '10%', y: '20%', size: 4, delay: 0, duration: 6 },
    { x: '85%', y: '15%', size: 3, delay: 1, duration: 7 },
    { x: '70%', y: '70%', size: 5, delay: 2, duration: 5 },
    { x: '20%', y: '80%', size: 3, delay: 0.5, duration: 8 },
    { x: '50%', y: '30%', size: 2, delay: 1.5, duration: 6 },
  ]

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none z-0" aria-hidden>
      {elements.map((el, i) => (
        <motion.div
          key={i}
          className="absolute rounded-full"
          style={{
            left: el.x,
            top: el.y,
            width: el.size,
            height: el.size,
            background: 'linear-gradient(135deg, var(--primary), var(--accent))',
          }}
          animate={{
            y: [0, -24, 0],
            opacity: [0.2, 0.6, 0.2],
            scale: [1, 1.4, 1],
          }}
          transition={{
            duration: el.duration,
            repeat: Infinity,
            ease: 'easeInOut',
            delay: el.delay,
          }}
        />
      ))}
    </div>
  )
}

// ─── Step connector with animated line ───
export function StepCard({ children, step, isLast = false, className = '' }: { children: ReactNode; step: string; isLast?: boolean; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const isInView = useInView(ref, { once: true })

  return (
    <div ref={ref} className={`relative ${className}`}>
      {!isLast && (
        <div className="hidden sm:block absolute top-1/2 -right-3 w-6 z-20">
          <motion.div
            className="h-[2px] bg-gradient-to-r from-primary/40 to-accent/40"
            initial={{ scaleX: 0 }}
            animate={isInView ? { scaleX: 1 } : {}}
            transition={{ duration: 0.6, delay: 0.4, ease: [0.16, 1, 0.3, 1] }}
            style={{ transformOrigin: 'left' }}
          />
        </div>
      )}
      <motion.div
        className="relative rounded-2xl border border-border/60 bg-card/50 backdrop-blur-sm p-8 text-center overflow-hidden transition-all duration-300 hover:border-primary/30 hover:shadow-[0_0_40px_-12px] hover:shadow-primary/15"
        initial={{ opacity: 0, y: 24, scale: 0.96 }}
        animate={isInView ? { opacity: 1, y: 0, scale: 1 } : {}}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        whileHover={{ y: -4 }}
      >
        <div className="absolute top-3 right-4 text-[72px] font-black text-primary/[0.04] leading-none select-none">
          {step}
        </div>
        {children}
      </motion.div>
    </div>
  )
}

// ─── CTA section with parallax ───
export function CtaSection({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] })
  const y = useTransform(scrollYProgress, [0, 1], [40, -40])

  return (
    <section ref={ref} className="relative overflow-hidden border-t border-border/40">
      <motion.div className="absolute inset-0 z-0" style={{ y }}>
        <div className="absolute top-[-30%] left-[20%] w-[50vw] h-[50vw] rounded-full bg-[#6366f1]/6 blur-[100px]" />
        <div className="absolute bottom-[-20%] right-[10%] w-[40vw] h-[40vw] rounded-full bg-[#d946ef]/5 blur-[80px]" />
      </motion.div>
      <div className="relative z-10">{children}</div>
    </section>
  )
}
