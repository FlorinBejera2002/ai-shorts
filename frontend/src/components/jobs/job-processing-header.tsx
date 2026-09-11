'use client'

import './job-processing-panel.css'

import { PageHeader } from '@/components/ui/page-header'
import { motion, useReducedMotion } from 'framer-motion'
import { useTranslations } from 'next-intl'

interface JobProcessingHeaderProps {
  status: string
  progress: number
  message: string
  connected: boolean
}

export function JobProcessingHeader({
  status,
  progress,
  message,
  connected
}: JobProcessingHeaderProps) {
  const t = useTranslations('jobProgress')
  const reduceMotion = useReducedMotion()
  const complete = status === 'completed'
  const stopped = status === 'failed' || status === 'cancelled'
  const running = connected && !complete && !stopped
  const value = complete
    ? 100
    : Math.min(100, Math.max(0, Number.isFinite(progress) ? progress : 0))
  const tone =
    status === 'failed'
      ? 'error'
      : complete
        ? 'success'
        : stopped || !connected
          ? 'idle'
          : 'active'

  return (
    <PageHeader
      title={t('title')}
      description={t('subtitle')}
      actions={
        <div
          className="job-header-progress"
          data-tone={tone}
          data-running={running}
        >
          <div className="job-header-status">
            <span className="job-header-label">
              <span className="job-processing-signal" aria-hidden="true" />
              {t('overallProgress')}
            </span>
            <span className="job-header-message" aria-live="polite">
              {message}
            </span>
          </div>
          <div
            className="job-processing-dial"
            role="progressbar"
            aria-label={t('overallProgress')}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={value}
          >
            <svg viewBox="0 0 160 160" aria-hidden="true">
              <circle className="job-dial-track" cx="80" cy="80" r="68" />
              <motion.circle
                className="job-dial-value"
                cx="80"
                cy="80"
                r="68"
                pathLength="1"
                initial={false}
                animate={{ strokeDashoffset: 1 - value / 100 }}
                transition={{
                  duration: reduceMotion ? 0 : 0.8,
                  ease: 'easeOut'
                }}
              />
            </svg>
            <div className="job-dial-number">
              <span>
                {Math.round(value)}
                <small>%</small>
              </span>
            </div>
          </div>
        </div>
      }
    />
  )
}
