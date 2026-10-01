'use client'

import './job-processing-panel.css'

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Check, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

export interface ProcessingStage {
  key: string
  label: string
  state: 'done' | 'active' | 'waiting' | 'attention'
  stateLabel: string
}

interface Props {
  title: string
  eyebrow: string
  countLabel?: string
  stage: { key: string; label: string; detail: string; icon: LucideIcon }
  stageLabel?: string
  stages: ProcessingStage[]
  message: string
  running: boolean
  tone: 'active' | 'idle' | 'error' | 'success'
  progress?: {
    label: string
    ariaLabel: string
    value?: number
    displayValue?: string
  }
  className?: string
  testID?: string
  status?: string
  children?: ReactNode
}

export function ProcessingPipeline({
  title,
  eyebrow,
  countLabel,
  stage,
  stageLabel,
  stages,
  message,
  running,
  tone,
  progress,
  className = '',
  testID,
  status,
  children
}: Props) {
  const reduceMotion = useReducedMotion()
  const animate = running && !reduceMotion
  const ActiveIcon = stage.icon
  const copy = (
    <>
      {stageLabel && <span className="job-stage-kicker">{stageLabel}</span>}
      <h4>{stage.label}</h4>
      <p>{stage.detail}</p>
      {message && (
        <div className="job-thinking-line" aria-live="polite" role="status">
          {running && (
            <span className="job-stage-activity" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
          )}
          <span>{message}</span>
        </div>
      )}
    </>
  )

  return (
    <section
      className={`job-processing ${className}`.trim()}
      data-tone={tone}
      data-running={running}
      data-stage={stage.key}
      data-status={status}
      data-testid={testID}
      aria-label={title}
    >
      <div className="job-processing-ambient" aria-hidden="true" />
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {stage.label}
      </p>
      <div className="job-processing-stages">
        <div className="job-stages-heading">
          <div>
            <span className="job-eyebrow">
              <span className="job-processing-signal" aria-hidden="true" />
              {eyebrow}
            </span>
            <h3>{title}</h3>
          </div>
          {countLabel && <span>{countLabel}</span>}
        </div>
        <div className="job-stage-focus">
          <div className="job-ai-visual" aria-hidden="true">
            <span className="job-ai-orbit job-ai-orbit-one" />
            <span className="job-ai-orbit job-ai-orbit-two" />
            <span className="job-ai-orbit job-ai-orbit-three" />
            <span className="job-ai-scan" />
            <span className="job-ai-particle job-ai-particle-one" />
            <span className="job-ai-particle job-ai-particle-two" />
            <span className="job-ai-particle job-ai-particle-three" />
            {animate ? (
              <AnimatePresence mode="wait" initial={false}>
                <motion.span
                  className="job-ai-core"
                  key={stage.key}
                  initial={{ opacity: 0, scale: 0.72, rotate: -18 }}
                  animate={{ opacity: 1, scale: 1, rotate: 0 }}
                  exit={{ opacity: 0, scale: 0.72, rotate: 18 }}
                  transition={{ duration: 0.42, ease: 'easeOut' }}
                >
                  <ActiveIcon size={31} strokeWidth={1.55} />
                </motion.span>
              </AnimatePresence>
            ) : (
              <span className="job-ai-core">
                <ActiveIcon size={31} strokeWidth={1.55} />
              </span>
            )}
          </div>
          {animate ? (
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                className="job-stage-copy"
                key={stage.key}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.32 }}
              >
                {copy}
              </motion.div>
            </AnimatePresence>
          ) : (
            <div className="job-stage-copy">{copy}</div>
          )}
        </div>
        {progress && (
          <div className="job-stage-progress">
            <div className="job-progress-meta">
              <span>{progress.label}</span>
              {progress.displayValue && <strong>{progress.displayValue}</strong>}
            </div>
            <div
              className="job-progress-track"
              role="progressbar"
              aria-label={progress.ariaLabel}
              aria-valuemin={progress.value === undefined ? undefined : 0}
              aria-valuemax={progress.value === undefined ? undefined : 100}
              aria-valuenow={progress.value}
              aria-valuetext={progress.value === undefined ? stage.label : undefined}
              data-indeterminate={progress.value === undefined}
            >
              {progress.value === undefined ? (
                <span className="job-progress-indeterminate" />
              ) : (
                <motion.span
                  initial={false}
                  animate={{ scaleX: progress.value / 100 }}
                  transition={{
                    duration: animate ? 0.75 : 0,
                    ease: [0.22, 1, 0.36, 1]
                  }}
                />
              )}
            </div>
          </div>
        )}
        <ol
          className="job-stage-map"
          style={{ gridTemplateColumns: `repeat(${stages.length}, minmax(0, 1fr))` }}
        >
          {stages.map((item) => (
            <li
              key={item.key}
              data-stage={item.key}
              data-state={item.state}
              aria-current={item.state === 'active' ? 'step' : undefined}
              aria-label={`${item.label} — ${item.stateLabel}`}
            >
              <span className="job-map-dot">
                {item.state === 'done' ? (
                  <Check size={11} strokeWidth={2.25} aria-hidden="true" />
                ) : (
                  <span />
                )}
              </span>
              <span className="job-map-label">{item.label}</span>
            </li>
          ))}
        </ol>
      </div>
      {children}
    </section>
  )
}
