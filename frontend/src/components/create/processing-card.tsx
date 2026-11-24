'use client'

import { Check, X } from 'lucide-react'
import type { ReactNode } from 'react'
import type { ProcessingCardStage } from './processing-stages'
import { clampProgress } from './processing-stages'
import styles from './processing-card.module.css'

export interface ProcessingCardSource {
  title: string
  meta?: string
  thumbnailUrl?: string | null
}

export interface ProcessingCardProps {
  title: string
  /** Shown under the title, e.g. the duration limit on a too-long video. */
  detail?: string
  illustration: { src: string; alt: string }
  progress: number
  progressLabel: string
  /** Stage line; omit it for screens that show no stages (too long). */
  stages?: ProcessingCardStage[]
  stagesLabel: string
  /** False renders the still variant used for failed and too-long screens. */
  animated: boolean
  /** Failed and too-long screens hide the bar and percentage. */
  showProgress?: boolean
  /** Failed screens announce themselves as an alert. */
  role?: 'status' | 'alert'
  source?: ProcessingCardSource
  testID?: string
  children?: ReactNode
}

/** Done shows a check, failed an X, and the rest their 1-based step number. */
function StageMark({ state, step }: { state: ProcessingCardStage['state']; step: number }) {
  if (state === 'done') return <Check size={14} strokeWidth={2.5} aria-hidden="true" />
  if (state === 'failed') return <X size={14} strokeWidth={2.5} aria-hidden="true" />
  return <span className={styles.step}>{step}</span>
}

/** Source summary row: thumbnail, title and meta. Shared by the processing card and the job done hero. */
export function ProcessingSourceRow({ source }: { source: ProcessingCardSource }) {
  return (
    <div className={styles.source}>
      <span className={styles.thumb}>{source.thumbnailUrl && <img src={source.thumbnailUrl} alt="" />}</span>
      <span className={styles.sourceText}>
        <strong>{source.title}</strong>
        {source.meta && <small>{source.meta}</small>}
      </span>
    </div>
  )
}

/** Stage-by-stage processing card shared by upload and YouTube clip creation. */
export function ProcessingCard({
  title,
  detail,
  illustration,
  progress,
  progressLabel,
  stages,
  stagesLabel,
  animated,
  showProgress = true,
  role = 'status',
  source,
  testID,
  children
}: ProcessingCardProps) {
  const value = clampProgress(progress)
  return (
    <section
      className={styles.card}
      role={role}
      aria-live={role === 'alert' ? 'assertive' : 'polite'}
      aria-label={title}
      data-testid={testID}
      data-animated={animated || undefined}
    >
      <div className={`${styles.art} ${animated ? styles.animated : ''}`}>
        <span className={styles.disc} aria-hidden="true" />
        <span className={styles.ring} aria-hidden="true" />
        <span className={styles.orbit} aria-hidden="true">
          <span className={styles.dot} />
        </span>
        <img className={styles.illustration} src={illustration.src} alt={illustration.alt} />
      </div>
      <div className={styles.copy}>
        <h2 className={styles.title}>{title}</h2>
        {detail && <p className={styles.detail}>{detail}</p>}
      </div>
      {showProgress && (
        <div className={styles.progress}>
          <div
            className={styles.track}
            role="progressbar"
            aria-label={progressLabel}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={value}
          >
            <span style={{ width: `${value}%` }} />
          </div>
          <strong>{value}%</strong>
        </div>
      )}
      {stages && (
        <ol className={styles.stages} aria-label={stagesLabel}>
          {stages.map((stage, index) => (
            <li
              key={stage.key}
              className={styles.stage}
              data-state={stage.state}
              aria-current={stage.state === 'current' ? 'step' : undefined}
              aria-label={`${stage.label}${stage.state === 'failed' ? ` (${stage.state})` : ''}`}
            >
              <span className={styles.mark}>
                <StageMark state={stage.state} step={index + 1} />
              </span>
              <span className={styles.label}>{stage.label}</span>
            </li>
          ))}
        </ol>
      )}
      {source && <ProcessingSourceRow source={source} />}
      {children && <div className={styles.actions}>{children}</div>}
    </section>
  )
}
