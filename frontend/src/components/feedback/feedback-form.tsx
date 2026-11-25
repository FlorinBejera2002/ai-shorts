'use client'

import ui from '@/components/shared/reference-ui.module.css'
import { useTranslations } from 'next-intl'
import { type ClipboardEvent, type FormEvent, useState } from 'react'
import {
  FEEDBACK_CATEGORIES,
  FEEDBACK_IMAGE_LIMIT,
  FEEDBACK_MESSAGE_LIMIT,
  type FeedbackCategory,
  FeedbackError,
  type FeedbackKind,
  feedbackImageProblem,
  sendFeedback
} from './feedback-api'
import { type FeedbackImage, readFeedbackImage } from './feedback-image-file'
import { FeedbackImages } from './feedback-images'
import { FeedbackPills } from './feedback-pills'
import styles from './feedback.module.css'

const ART: Record<FeedbackKind, string> = {
  problem: '/illustrations/feedback-report.webp',
  idea: '/illustrations/feedback-idea.webp'
}

type ErrorKey = 'sendFailed' | 'imageType' | 'imageSize' | 'imageLimit' | 'imageRejected'

/** Problem report / idea form with optional screenshots; after sending it shows a thank-you. */
export function FeedbackForm({ onSent }: { onSent: () => void }) {
  const t = useTranslations('feedback')
  const [kind, setKind] = useState<FeedbackKind>('problem')
  const [category, setCategory] = useState<FeedbackCategory | ''>('')
  const [message, setMessage] = useState('')
  const [images, setImages] = useState<FeedbackImage[]>([])
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<ErrorKey | null>(null)

  const tooLong = message.length > FEEDBACK_MESSAGE_LIMIT
  const ready = category !== '' && message.trim() !== '' && !tooLong && !sending

  async function addImages(files: File[]) {
    if (files.length === 0) return
    setError(null)
    const room = FEEDBACK_IMAGE_LIMIT - images.length
    const problems = files.map(feedbackImageProblem)
    const accepted = files.filter((_, index) => problems[index] === null).slice(0, Math.max(0, room))
    if (problems.includes('type')) setError('imageType')
    else if (problems.includes('size')) setError('imageSize')
    else if (files.length > room) setError('imageLimit')
    if (accepted.length === 0) return
    try {
      const read = await Promise.all(accepted.map(readFeedbackImage))
      setImages((current) => [...current, ...read].slice(0, FEEDBACK_IMAGE_LIMIT))
    } catch {
      setError('imageRejected')
    }
  }

  /** A screenshot pasted into the message is attached instead of inserted. */
  function pasteImages(event: ClipboardEvent<HTMLTextAreaElement>) {
    const files = Array.from(event.clipboardData.files).filter((file) => file.type.startsWith('image/'))
    if (files.length === 0) return
    event.preventDefault()
    void addImages(files)
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!ready) return
    setSending(true)
    setError(null)
    try {
      await sendFeedback({ kind, category, message }, images.map((image) => image.file))
      setSent(true)
      setMessage('')
      setCategory('')
      setImages([])
      onSent()
    } catch (cause) {
      const imageRefused = images.length > 0 && cause instanceof FeedbackError && [400, 413, 422].includes(cause.status)
      setError(imageRefused ? 'imageRejected' : 'sendFailed')
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
          onPaste={pasteImages}
          placeholder={t(kind === 'problem' ? 'problemPlaceholder' : 'ideaPlaceholder')}
          rows={6}
          aria-invalid={tooLong || undefined}
        />
      </label>
      <FeedbackImages
        images={images}
        disabled={sending}
        onAdd={(files) => void addImages(files)}
        onRemove={(id) => setImages((current) => current.filter((image) => image.id !== id))}
      />
      {(tooLong || error) && (
        <p className={ui.fieldError} role="alert">
          {tooLong ? t('tooLong') : t(error ?? 'sendFailed')}
        </p>
      )}
      <button type="submit" className={`${ui.button} ${ui.primary} ${ui.focus} ${styles.submit}`} disabled={!ready}>
        {sending ? t('sending') : t('send')}
      </button>
    </form>
  )
}
