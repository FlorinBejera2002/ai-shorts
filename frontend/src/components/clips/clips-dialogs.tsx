'use client'

import theme from '@/components/calendar/publishing-theme.module.css'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle
} from '@/components/ui/dialog'
import { LoadingIndicator } from '@/components/ui/loading-indicator'
import { Film } from 'lucide-react'
import { useId, type ReactNode } from 'react'
import { useClipsCopy } from './clips-copy'
import styles from './clips-dialogs.module.css'

type DialogShellProps = {
  open: boolean
  busy?: boolean
  alert?: boolean
  label?: string
  className?: string
  onOpenChange: (open: boolean) => void
  children: ReactNode
}

/** Reference-styled dialog: centered card on desktop, bottom sheet on phones. */
export function ClipsDialog({
  open,
  busy = false,
  alert = false,
  label,
  className,
  onOpenChange,
  children
}: DialogShellProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!busy || value) onOpenChange(value)
      }}
    >
      <DialogContent
        role={alert ? 'alertdialog' : 'dialog'}
        aria-label={label}
        aria-describedby={undefined}
        className={`${theme.surface} ${styles.dialog} ${className ?? ''}`}
        overlayClassName={theme.overlay}
        data-reference-surface=""
        onEscapeKeyDown={(event) => {
          if (busy) event.preventDefault()
        }}
        onPointerDownOutside={(event) => {
          if (busy) event.preventDefault()
        }}
      >
        <span className={styles.handle} aria-hidden="true" />
        {children}
      </DialogContent>
    </Dialog>
  )
}

function Actions({
  cancel,
  confirm,
  busy,
  disabled,
  tone = 'primary',
  onCancel,
  onConfirm
}: {
  cancel: string
  confirm: string
  busy: boolean
  disabled?: boolean
  tone?: 'primary' | 'danger'
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <div className={styles.actions}>
      <button
        type="button"
        className={styles.secondary}
        disabled={busy}
        onClick={onCancel}
      >
        {cancel}
      </button>
      <button
        type="button"
        className={tone === 'danger' ? styles.danger : styles.primary}
        disabled={busy || disabled}
        onClick={onConfirm}
      >
        {busy && <LoadingIndicator className="size-4" />}
        {confirm}
      </button>
    </div>
  )
}

export function FolderDialog({
  open,
  editing,
  name,
  saving,
  onOpenChange,
  onName,
  onSubmit
}: {
  open: boolean
  editing: boolean
  name: string
  saving: boolean
  onOpenChange: (open: boolean) => void
  onName: (name: string) => void
  onSubmit: () => void
}) {
  const copy = useClipsCopy()
  const id = useId()
  const title = editing ? copy.rename : copy.newProject
  return (
    <ClipsDialog
      open={open}
      busy={saving}
      className={styles.compact}
      onOpenChange={onOpenChange}
    >
      <DialogTitle className={styles.title}>{title}</DialogTitle>
      <form
        className={styles.form}
        onSubmit={(event) => {
          event.preventDefault()
          if (name.trim()) onSubmit()
        }}
      >
        <label htmlFor={`${id}-name`} className={styles.field}>
          {copy.name}
          <input
            id={`${id}-name`}
            autoFocus={true}
            value={name}
            maxLength={80}
            className={styles.input}
            onChange={(event) => onName(event.target.value)}
          />
        </label>
        <div className={styles.actions} data-layout="form">
          <button
            type="button"
            className={styles.secondary}
            disabled={saving}
            onClick={() => onOpenChange(false)}
          >
            {copy.cancel}
          </button>
          <button
            type="submit"
            className={styles.primary}
            disabled={saving || !name.trim()}
          >
            {saving && <LoadingIndicator className="size-4" />}
            {editing ? copy.save : copy.create}
          </button>
        </div>
      </form>
    </ClipsDialog>
  )
}

export function ProjectDeleteDialog({
  name,
  busy,
  onCancel,
  onConfirm
}: {
  name: string | null
  busy: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  const copy = useClipsCopy()
  return (
    <ClipsDialog
      open={name !== null}
      busy={busy}
      alert={true}
      className={styles.compact}
      onOpenChange={(open) => {
        if (!open) onCancel()
      }}
    >
      <DialogTitle className={styles.title}>
        {copy.deleteProjectTitle(name ?? '')}
      </DialogTitle>
      <DialogDescription className={styles.description}>
        {copy.deleteProjectBody}
      </DialogDescription>
      <Actions
        cancel={copy.cancel}
        confirm={copy.remove}
        busy={busy}
        tone="danger"
        onCancel={onCancel}
        onConfirm={onConfirm}
      />
    </ClipsDialog>
  )
}

export function ClipDeleteDialog({
  open,
  busy,
  thumbnailUrl,
  onOpenChange,
  onConfirm
}: {
  open: boolean
  busy: boolean
  thumbnailUrl: string | null
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
}) {
  const copy = useClipsCopy()
  return (
    <ClipsDialog
      open={open}
      busy={busy}
      alert={true}
      className={styles.compact}
      onOpenChange={onOpenChange}
    >
      <div className={styles.clipHeading}>
        <span className={styles.clipThumb}>
          {thumbnailUrl ? (
            <img src={thumbnailUrl} alt="" />
          ) : (
            <Film aria-hidden="true" />
          )}
        </span>
        <DialogTitle className={styles.title}>{copy.deleteClipTitle}</DialogTitle>
      </div>
      <DialogDescription className={styles.description}>
        {copy.deleteClipBody}
      </DialogDescription>
      <Actions
        cancel={copy.keep}
        confirm={copy.remove}
        busy={busy}
        tone="danger"
        onCancel={() => onOpenChange(false)}
        onConfirm={onConfirm}
      />
    </ClipsDialog>
  )
}
