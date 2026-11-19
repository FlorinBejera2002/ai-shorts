'use client'

import { useTranslations } from 'next-intl'
import { useId, useState, type FormEvent } from 'react'
import {
  CloseButton,
  DeleteIllustration as DeleteImage,
  OverlayActions as Actions,
  OverlayDescription as Description,
  OverlayTitle as Title,
  ReferenceOverlay as ClipsOverlay
} from '@/components/shared/reference-overlay'
import { ProjectIcon } from './clips-icons'
import overlay from '@/components/shared/reference-ui.module.css'

function DeleteIllustration() {
  const t = useTranslations('clipsLibrary')
  return <DeleteImage alt={t('illustrations.delete')} />
}

type ConfirmProps = { mobile: boolean; busy: boolean; onClose: () => void; onConfirm: () => void }

export function DeleteClipDialog({ title, ...props }: ConfirmProps & { title: string | null }) {
  const t = useTranslations('clipsLibrary')
  return (
    <ClipsOverlay open={title !== null} alert {...props}>
      <div className={overlay.dialogHead}>
        <DeleteIllustration />
        <Title mobile={props.mobile}>{t('deleteClipTitle')}</Title>
        <Description mobile={props.mobile}>{t('deleteClipBody', { title: title ?? '' })}</Description>
      </div>
      <Actions cancel={t('keep')} confirm={t('delete')} tone="danger" busy={props.busy} onCancel={props.onClose} onConfirm={props.onConfirm} />
    </ClipsOverlay>
  )
}

export function DeleteProjectDialog({ name, ...props }: ConfirmProps & { name: string | null }) {
  const t = useTranslations('clipsLibrary')
  return (
    <ClipsOverlay open={name !== null} alert {...props}>
      <div className={overlay.dialogHead}>
        <DeleteIllustration />
        <Title mobile={props.mobile}>{t('deleteProjectTitle', { name: name ?? '' })}</Title>
        <Description mobile={props.mobile}>{t('deleteProjectBody')}</Description>
      </div>
      <Actions cancel={t('cancel')} confirm={t('deleteProject')} tone="danger" busy={props.busy} onCancel={props.onClose} onConfirm={props.onConfirm} />
    </ClipsOverlay>
  )
}

/** "Proiect nou" and "Redenumește": one name field. `initialName` null means closed. */
export function ProjectNameDialog({
  initialName,
  renaming,
  error,
  mobile,
  busy,
  onClose,
  onSubmit
}: {
  initialName: string | null
  renaming: boolean
  error: string | null
  mobile: boolean
  busy: boolean
  onClose: () => void
  onSubmit: (name: string) => void
}) {
  const t = useTranslations('clipsLibrary')
  const fieldId = useId()
  const [name, setName] = useState(initialName ?? '')
  const [shownFor, setShownFor] = useState(initialName)
  if (shownFor !== initialName) {
    setShownFor(initialName)
    setName(initialName ?? '')
  }
  const trimmed = name.trim()
  function submit(event: FormEvent) {
    event.preventDefault()
    if (trimmed && !busy) onSubmit(trimmed)
  }
  return (
    <ClipsOverlay open={initialName !== null} wide described={false} mobile={mobile} busy={busy} onClose={onClose}>
      <form className={overlay.form} onSubmit={submit} data-clips-project-form="">
        <div className={overlay.dialogHead} data-compact="">
          {!mobile && (
            <span className={overlay.dialogClose}>
              <CloseButton onClick={onClose} />
            </span>
          )}
          <img src="/illustrations/clips-emptyproject.webp" alt={t('illustrations.emptyProject')} width={mobile ? 150 : 170} height={mobile ? 150 : 170} />
          <Title mobile={mobile}>{renaming ? t('renameProjectTitle') : t('newProjectTitle')}</Title>
        </div>
        <label className={overlay.field} htmlFor={fieldId}>
          <span>{t('name')}</span>
          <span className={overlay.fieldBox}>
            <ProjectIcon size={28} />
            <input
              id={fieldId}
              value={name}
              maxLength={80}
              placeholder={t('namePlaceholder')}
              autoComplete="off"
              aria-invalid={error ? true : undefined}
              onChange={(event) => setName(event.target.value)}
              data-autofocus=""
            />
          </span>
          {error && (
            <p className={overlay.fieldError} role="alert">
              {error}
            </p>
          )}
        </label>
        <Actions
          cancel={t('cancel')}
          confirm={renaming ? t('save') : t('createProject')}
          tone="primary"
          busy={busy}
          disabled={!trimmed || (renaming && trimmed === initialName)}
          submit
          onCancel={onClose}
        />
      </form>
    </ClipsOverlay>
  )
}
