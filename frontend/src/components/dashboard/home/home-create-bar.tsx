'use client'

import { Link, useRouter } from '@/i18n/navigation'
import { extractYouTubeId } from '@/lib/youtube'
import { Link2, Sparkles, Upload } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { type FormEvent, useId, useState } from 'react'
import styles from './home.module.css'

/** One bar for starting a clip: paste a YouTube link, upload, or create. */
export function HomeCreateBar() {
  const t = useTranslations('dashboard.home')
  const router = useRouter()
  const errorId = useId()
  const [link, setLink] = useState('')
  const [invalid, setInvalid] = useState(false)

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const url = link.trim()
    if (!url) {
      router.push('/dashboard/create?mode=youtube')
      return
    }
    if (!extractYouTubeId(url)) {
      setInvalid(true)
      return
    }
    router.push(`/dashboard/create?${new URLSearchParams({ mode: 'youtube', url })}`)
  }

  return (
    <>
      <form
        className={styles.composer}
        onSubmit={submit}
        noValidate
        data-invalid={invalid ? '' : undefined}
        data-home-composer=""
      >
        <label className={styles.composerField}>
          <Link2 aria-hidden="true" />
          <input
            type="url"
            inputMode="url"
            value={link}
            onChange={(event) => {
              setLink(event.target.value)
              if (invalid) setInvalid(false)
            }}
            placeholder={t('linkPlaceholder')}
            aria-label={t('linkLabel')}
            aria-invalid={invalid}
            aria-describedby={invalid ? errorId : undefined}
          />
        </label>
        <span className={styles.composerActions}>
          <span className={styles.composerDivider} aria-hidden="true" />
          <Link href="/dashboard/create?mode=upload" className={styles.ghostButton} data-home-upload="">
            <Upload aria-hidden="true" />
            {t('upload')}
          </Link>
          <button type="submit" className={styles.primaryButton} data-home-new-clip="">
            <Sparkles aria-hidden="true" />
            {t('create')}
          </button>
        </span>
      </form>
      {invalid && (
        <p id={errorId} role="alert" className={styles.composerError}>
          {t('invalidLink')}
        </p>
      )}
    </>
  )
}
