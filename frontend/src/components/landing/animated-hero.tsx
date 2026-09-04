'use client'

import { BrandLogo } from '@/components/shared/brand-logo'
import { motion, useInView, useReducedMotion } from 'framer-motion'
import { type ReactNode, useRef } from 'react'

const EASE = [0.16, 1, 0.3, 1] as const

export function NavLogo({
  variant = 'card',
  priority = true
}: {
  variant?: 'card' | 'white-text'
  priority?: boolean
}) {
  const reduceMotion = useReducedMotion()

  return (
    <motion.div
      className="flex items-center gap-3"
      initial={reduceMotion ? false : { opacity: 1, x: -16 }}
      animate={{ opacity: 1, x: 0 }}
      transition={
        reduceMotion ? { duration: 0 } : { duration: 0.6, ease: EASE }
      }
    >
      <BrandLogo
        onDark={variant === 'card'}
        priority={priority}
        variant={variant === 'white-text' ? 'white-text' : 'default'}
      />
    </motion.div>
  )
}

export function SectionReveal({
  children,
  className = ''
}: {
  children: ReactNode
  className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const isInView = useInView(ref, { once: true, margin: '-80px' })
  const reduceMotion = useReducedMotion()

  return (
    <motion.div
      ref={ref}
      className={className}
      initial={reduceMotion ? false : { opacity: 1, y: 48 }}
      animate={
        reduceMotion || isInView ? { opacity: 1, y: 0 } : { opacity: 1, y: 48 }
      }
      transition={
        reduceMotion ? { duration: 0 } : { duration: 0.7, ease: EASE }
      }
    >
      {children}
    </motion.div>
  )
}

export function StaggerGrid({
  children,
  className = ''
}: {
  children: ReactNode
  className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const isInView = useInView(ref, { once: true, margin: '-60px' })
  const reduceMotion = useReducedMotion()

  return (
    <motion.div
      ref={ref}
      className={className}
      initial={reduceMotion ? false : 'hidden'}
      animate={reduceMotion || isInView ? 'visible' : 'hidden'}
      variants={{
        hidden: {},
        visible: {
          transition: { staggerChildren: reduceMotion ? 0 : 0.08 }
        }
      }}
    >
      {children}
    </motion.div>
  )
}

export function StaggerItem({
  children,
  className = ''
}: {
  children: ReactNode
  className?: string
}) {
  const reduceMotion = useReducedMotion()

  return (
    <motion.div
      className={className}
      variants={{
        // Hidden is spatial only: cards remain readable without hydration.
        hidden: reduceMotion ? {} : { opacity: 1, y: 24, scale: 0.96 },
        visible: {
          opacity: 1,
          y: 0,
          scale: 1,
          transition: reduceMotion
            ? { duration: 0 }
            : { duration: 0.5, ease: EASE }
        }
      }}
    >
      {children}
    </motion.div>
  )
}
