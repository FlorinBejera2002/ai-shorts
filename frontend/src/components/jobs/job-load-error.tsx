'use client'

import { AlertCircle } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { JOB_CONNECTION_LOST, JOB_LOAD_ERROR } from './use-job-status'

interface JobLoadErrorProps {
  error: string
  onRetry: () => void
}

/** Alert shown when the job status cannot be loaded; it never invents a stage or percentage. */
export function JobLoadError({ error, onRetry }: JobLoadErrorProps) {
  const t = useTranslations('jobProgress')
  const message =
    error === JOB_LOAD_ERROR ? t('loadError') : error === JOB_CONNECTION_LOST ? t('connectionLost') : error

  return (
    <div className="mb-6 flex items-start gap-3 rounded-md border px-4 py-4" role="alert">
      <AlertCircle className="mt-0.5 size-5 shrink-0 text-muted-foreground" strokeWidth={1.75} />
      <div>
        <p className="text-sm font-medium">{message}</p>
        <Button variant="outline" className="mt-3 min-h-11" onClick={onRetry}>
          {t('retry')}
        </Button>
      </div>
    </div>
  )
}
