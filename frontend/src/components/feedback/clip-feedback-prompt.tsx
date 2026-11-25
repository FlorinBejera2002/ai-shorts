'use client'

import ui from '@/components/shared/reference-ui.module.css'
import { Frown, Meh, Smile, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { type FormEvent, useState } from 'react'
import { type ClipRating, FEEDBACK_MESSAGE_LIMIT, sendFeedback } from './feedback-api'
import { FeedbackPills } from './feedback-pills'
import { settleClipFeedback, shouldAskClipFeedback } from './clip-feedback-schedule'
import styles from './clip-feedback-prompt.module.css'

type Step = 'ask' | 'comment' | 'thanks' | 'hidden'

const RATINGS = [
  { value: '1', icon: Frown },
  { value: '2', icon: Meh },
  { value: '3', icon: Smile }
] as const

/**
 * One-tap rating under a finished job. Inline (never a dialog), asked once per job and paused
 * between jobs; the rating is saved on the first tap and the comment is optional.
 */
export function ClipFeedbackPrompt({ jobId }: { jobId: string }) {
  const t = useTranslations('feedback.clip')
  const [step, setStep] = useState<Step>(() => (shouldAskClipFeedback(jobId) ? 'ask' : 'hidden'))
  const [rating, setRating] = useState<ClipRating | null>(null)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)

  if (step === 'hidden') return null

  async function send(nextRating: ClipRating, comment?: string) {
    setBusy(true)
    setFailed(false)
    try {
      await sendFeedback({ kind: 'clip', jobId, rating: nextRating, ...(comment ? { message: comment } : {}) })
      settleClipFeedback(jobId, 'answered')
      return true
    } catch {
      setFailed(true)
      return false
    } finally {
      setBusy(false)
    }
  }

  async function rate(value: string) {
    const next = Number(value) as ClipRating
    setRating(next)
    if (await send(next)) setStep('comment')
  }

  async function submitComment(event: FormEvent) {
    event.preventDefault()
    const comment = message.trim()
    if (!rating || !comment || comment.length > FEEDBACK_MESSAGE_LIMIT) return
    if (await send(rating, comment)) setStep('thanks')
  }

  function dismiss() {
    if (step === 'ask') settleClipFeedback(jobId, 'dismissed')
    setStep(step === 'comment' ? 'thanks' : 'hidden')
  }

  if (step === 'thanks') {
    return (
      <p className={styles.thanks} role="status" data-clip-feedback="thanks">
        {t('thanks')}
      </p>
    )
  }

  return (
    <section className={`${ui.tokens} ${styles.prompt}`} aria-labelledby="clip-feedback-title" data-clip-feedback={step}>
      <div className={styles.row}>
        <h2 id="clip-feedback-title" className={`${ui.heading} ${styles.title}`}>
          {t('title')}
        </h2>
        <FeedbackPills
          label={t('title')}
          value={rating === null ? '' : String(rating)}
          onChange={(value) => void rate(value)}
          options={RATINGS.map(({ value, icon: Icon }) => ({
            value,
            label: (
              <>
                <Icon aria-hidden="true" strokeWidth={1.75} />
                {t(`ratings.${value}`)}
              </>
            )
          }))}
        />
        <button
          type="button"
          className={`${styles.close} ${ui.focus}`}
          onClick={dismiss}
          aria-label={step === 'ask' ? t('dismiss') : t('close')}
          title={step === 'ask' ? t('dismiss') : t('close')}
          disabled={busy}
        >
          <X aria-hidden="true" />
        </button>
      </div>
      {step === 'comment' && rating !== null && (
        <form className={styles.comment} onSubmit={submitComment}>
          <input
            className={styles.input}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            maxLength={FEEDBACK_MESSAGE_LIMIT}
            placeholder={t(rating === 3 ? 'highPlaceholder' : 'lowPlaceholder')}
            aria-label={t(rating === 3 ? 'highPlaceholder' : 'lowPlaceholder')}
          />
          <button type="submit" className={`${ui.button} ${ui.primary} ${ui.focus}`} disabled={busy || !message.trim()}>
            {t('send')}
          </button>
        </form>
      )}
      {failed && (
        <p className={ui.fieldError} role="alert">
          {t('failed')}
        </p>
      )}
    </section>
  )
}
