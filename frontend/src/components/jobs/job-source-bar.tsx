'use client'

import { Upload, Youtube } from 'lucide-react'
import { useCreateText } from '@/components/create/create-text'
import { YouTubeAccountPill } from '@/components/create/youtube-account-pill'
import { Link } from '@/i18n/navigation'
import { isLinkJob } from './job-source-model'
import styles from './job-source-bar.module.css'

interface JobSourceBarProps {
  /** The job's source type; picks which segment of the Creare switch is selected. */
  job: { source_type?: string }
}

/**
 * Creare source switch above a job card, with the connected YouTube account on the right.
 * Both segments link back to the Create page, which owns the source choice.
 */
export function JobSourceBar({ job }: JobSourceBarProps) {
  const text = useCreateText()
  const linked = isLinkJob(job)
  return (
    <div className={`${styles.bar} ${styles.tokens}`}>
      <nav className={styles.switch} aria-label={text('Footage source', 'Sursa filmărilor')}>
        <Link
          href="/dashboard/create"
          className={styles.segment}
          aria-current={linked ? undefined : 'page'}
        >
          <Upload aria-hidden="true" />
          {text('Upload footage', 'Încarcă filmări')}
        </Link>
        <Link
          href="/dashboard/create?mode=youtube"
          className={styles.segment}
          aria-current={linked ? 'page' : undefined}
        >
          <Youtube aria-hidden="true" />
          YouTube
        </Link>
      </nav>
      <YouTubeAccountPill className={styles.account} />
    </div>
  )
}
