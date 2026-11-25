'use client'

import ui from '@/components/shared/reference-ui.module.css'
import { useTranslations } from 'next-intl'
import { type FormEvent, useState } from 'react'
import {
  FEEDBACK_CATEGORIES,
  FEEDBACK_MESSAGE_LIMIT,
  type FeedbackCategory,
  type FeedbackKind,
  sendFeedback
} from './feedback-api'
import { FeedbackPills } from './feedback-pills'
import styles from './feedback.module.css'

const ART: Record<FeedbackKind, string> = {
  problem: '/illustrations/feedback-report.webp',
  idea: '/illustrations/feedback-idea.webp'
}

/** Problem report / idea form; after sending it shows a thank-you until the user starts another. */
export function FeedbackForm({ onSent }: { onSent: () => void }) {
  const t = useTranslations('feedback')
  const [kind, setKind] = useState<FeedbackKind>('problem')
  const [category, setCategory] = useState<FeedbackCategory | ''>('')
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const tooLong = message.length > FEEDBACK_MESSAGE_LIMIT
  const ready = category !== '' && message.trim() !== '' && !tooLong && !sending

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!ready) return
    setSending(true)
    setError(null)
    try {
      await sendFeedback({ kind, category, message })
      setSent(true)
      setMessage('')
      setCategory('')
      onSent()
    } catch {
      setError(t('sendFailed'))
    } finally {
      setSending(false)
    }
  }

  if (sent) {
    return (
      <section className={`${styles.card} ${styles.thanks}`} aria-live="polite" data-feedback-sent="">
        <img className={styles.art} src="/illustrations/feedback-thanks.webp" alt="" />
        <h2 className={`${ui.heading} ${styles.cardTitle}`}>{t('sentTitle')}</h2>
        <button type="button" className={`${ui.button} ${ui.secondary} ${ui.focus}`} onClick={() => setSent(false)}>
          {t('sendAnother')}
        </button>
      </section>
    )
  }

  const kindLabel = t(kind === 'problem' ? 'kindProblem' : 'kindIdea')
  return (
    <form className={styles.card} onSubmit={submit} noValidate={true} data-feedback-form={kind}>
      <FeedbackPills
        variant="segment"
        label={t('kindLabel')}
        value={kind}
        onChange={setKind}
        options={[
          { value: 'problem', label: t('kindProblem') },
          { value: 'idea', label: t('kindIdea') }
        ]}
      />
      <div className={styles.hero}>
        <img className={styles.art} src={ART[kind]} alt="" />
        <h2 className={`${ui.heading} ${styles.cardTitle}`}>{kindLabel}</h2>
      </div>
      <div className={ui.field} role="group" aria-label={t('categoryLabel')}>
        <span>{t('categoryLabel')}</span>
        <FeedbackPills
          label={t('categoryLabel')}
          value={category}
          onChange={setCategory}
          options={FEEDBACK_CATEGORIES.map((value) => ({ value, label: t(`categories.${value}`) }))}
        />
      </div>
      <label className={ui.field}>
        <span>{t('messageLabel')}</span>
        <textarea
          className={styles.textarea}
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          placeholder={t(kind === 'problem' ? 'problemPlaceholder' : 'ideaPlaceholder')}
          rows={6}
          aria-invalid={tooLong || undefined}
        />
      </label>
      {(tooLong || error) && (
        <p className={ui.fieldError} role="alert">
          {tooLong ? t('tooLong') : error}
        </p>
      )}
      <button type="submit" className={`${ui.button} ${ui.primary} ${ui.focus} ${styles.submit}`} disabled={!ready}>
        {sending ? t('sending') : t('send')}
      </button>
    </form>
  )
}
