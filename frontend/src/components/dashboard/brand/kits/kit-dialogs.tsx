'use client'

import {
  CloseButton,
  DeleteIllustration,
  OverlayActions,
  OverlayDescription,
  OverlayTitle,
  ReferenceOverlay
} from '@/components/shared/reference-overlay'
import ui from '@/components/shared/reference-ui.module.css'
import { Switch } from '@/components/ui/switch'
import { Camera, Check, Plus } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { LOGO_TYPES } from '../constants'
import type { BrandKitSummary } from './kit-model'
import { KitAvatar } from './kit-visuals'
import styles from './kits.module.css'

type Common = { mobile: boolean; busy: boolean; error: string | null; onClose: () => void }

/** Remembers the form while open and starts fresh each time it opens. */
function useOpenValue<T>(open: boolean, initial: () => T) {
  const [value, setValue] = useState(initial)
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) setValue(initial())
  }
  return [value, setValue] as const
}

function NameField({ id, value, label, onChange, children }: { id?: string; value: string; label: string; onChange: (value: string) => void; children?: ReactNode }) {
  return (
    <span className={ui.fieldBox} style={{ flex: '1 1 auto', minWidth: 0, height: 48, padding: '0 14px' }}>
      {children}
      <input id={id} aria-label={label} value={value} maxLength={80} autoComplete="off" onChange={(event) => onChange(event.target.value)} data-autofocus="" />
    </span>
  )
}

function ErrorText({ error }: { error: string | null }) {
  return error ? (
    <p className={ui.fieldError} role="alert">
      {error}
    </p>
  ) : null
}

/** Shows a picked image file; its object URL lives exactly as long as the file is shown. */
function LocalImage({ file }: { file: File }) {
  const image = useRef<HTMLImageElement>(null)
  useEffect(() => {
    const url = URL.createObjectURL(file)
    if (image.current) image.current.src = url
    return () => URL.revokeObjectURL(url)
  }, [file])
  return <img ref={image} alt="" />
}

/** Kit nou: image + name, then start from an existing kit or from scratch. Mount it only while open. */
export function KitNewDialog({
  open,
  source,
  onSubmit,
  ...common
}: Common & {
  open: boolean
  source: BrandKitSummary | null
  onSubmit: (input: { name: string; fromKitId: string | null; image: File | null }) => void
}) {
  const t = useTranslations('brandKits')
  const [form, setForm] = useOpenValue(open, () => ({ name: '', copy: Boolean(source), image: null as File | null }))
  const imageId = useId()
  const name = form.name.trim()
  function submit(event: FormEvent) {
    event.preventDefault()
    if (name && !common.busy) onSubmit({ name, fromKitId: form.copy && source ? source.id : null, image: form.image })
  }
  return (
    <ReferenceOverlay open={open} mobile={common.mobile} busy={common.busy} described={false} onClose={common.onClose}>
      <form className={ui.form} onSubmit={submit} data-kit-new-form="">
        <div className={styles.dialogHead}>
          <OverlayTitle mobile={common.mobile}>{t('newKit')}</OverlayTitle>
          <CloseButton onClick={common.onClose} />
        </div>
        <div className={styles.identity}>
          <label className={styles.imagePicker} htmlFor={imageId} aria-label={t('addImage')}>
            {form.image ? <LocalImage file={form.image} /> : <Camera aria-hidden="true" />}
            {!form.image && (
              <span className={styles.imagePlus} aria-hidden="true">
                <Plus strokeWidth={2.5} />
              </span>
            )}
            <input
              id={imageId}
              type="file"
              accept={LOGO_TYPES.join(',')}
              onChange={(event) => {
                const image = event.target.files?.[0] ?? null
                setForm((current) => ({ ...current, image }))
              }}
            />
          </label>
          <NameField value={form.name} label={t('kitName')} onChange={(value) => setForm((current) => ({ ...current, name: value }))} />
        </div>
        {source && (
          <div className={styles.sources} role="radiogroup" aria-label={t('startFrom')}>
            <span>{t('startFrom')}</span>
            <div>
              <label className={styles.source}>
                <input type="radio" name="kit-source" checked={form.copy} onChange={() => setForm((current) => ({ ...current, copy: true }))} />
                <KitAvatar kit={source} size={32} />
                <b>{source.name}</b>
                {form.copy && <Check aria-hidden="true" strokeWidth={2.5} />}
              </label>
              <label className={styles.source}>
                <input type="radio" name="kit-source" checked={!form.copy} onChange={() => setForm((current) => ({ ...current, copy: false }))} />
                <span className={styles.blank} aria-hidden="true">
                  Aa
                </span>
                <b>{t('fromScratch')}</b>
                {!form.copy && <Check aria-hidden="true" strokeWidth={2.5} />}
              </label>
            </div>
          </div>
        )}
        <ErrorText error={common.error} />
        <OverlayActions cancel={t('cancel')} confirm={t('createKit')} tone="primary" busy={common.busy} disabled={!name} submit onCancel={common.onClose} />
      </form>
    </ReferenceOverlay>
  )
}

/** Redenumește: one name field, saved only when it changed. */
export function KitRenameDialog({ kit, onSubmit, ...common }: Common & { kit: BrandKitSummary | null; onSubmit: (name: string) => void }) {
  const t = useTranslations('brandKits')
  const [name, setName] = useOpenValue(kit !== null, () => kit?.name ?? '')
  const trimmed = name.trim()
  return (
    <ReferenceOverlay open={kit !== null} mobile={common.mobile} busy={common.busy} described={false} onClose={common.onClose}>
      <form
        className={ui.form}
        onSubmit={(event) => {
          event.preventDefault()
          if (trimmed && trimmed !== kit?.name && !common.busy) onSubmit(trimmed)
        }}
      >
        <div className={styles.dialogHead}>
          <OverlayTitle mobile={common.mobile}>{t('renameKit')}</OverlayTitle>
          <CloseButton onClick={common.onClose} />
        </div>
        <div className={styles.identity}>
          {kit && <KitAvatar kit={kit} size={52} />}
          <NameField value={name} label={t('kitName')} onChange={setName} />
        </div>
        <ErrorText error={common.error} />
        <OverlayActions cancel={t('cancel')} confirm={t('save')} tone="primary" busy={common.busy} disabled={!trimmed || trimmed === kit?.name} submit onCancel={common.onClose} />
      </form>
    </ReferenceOverlay>
  )
}

/** Ștergi kitul? — with the delete illustration. */
export function KitDeleteDialog({ kit, onConfirm, ...common }: Omit<Common, 'error'> & { kit: BrandKitSummary | null; onConfirm: () => void }) {
  const t = useTranslations('brandKits')
  return (
    <ReferenceOverlay open={kit !== null} mobile={common.mobile} busy={common.busy} alert onClose={common.onClose}>
      <div className={ui.dialogHead}>
        <DeleteIllustration alt={t('deleteIllustration')} />
        <OverlayTitle mobile={common.mobile}>{t('deleteTitle', { name: kit?.name ?? '' })}</OverlayTitle>
        <OverlayDescription mobile={common.mobile}>{t('deleteBody')}</OverlayDescription>
      </div>
      <OverlayActions cancel={t('cancel')} confirm={t('deleteKit')} tone="danger" busy={common.busy} onCancel={common.onClose} onConfirm={onConfirm} />
    </ReferenceOverlay>
  )
}

/** Salvează ca kit nou: name and whether it becomes the default. */
export function KitSaveAsDialog({
  open,
  onSubmit,
  ...common
}: Common & { open: boolean; onSubmit: (name: string, makeDefault: boolean) => void }) {
  const t = useTranslations('brandKits')
  const [form, setForm] = useOpenValue(open, () => ({ name: '', makeDefault: false }))
  const name = form.name.trim()
  const switchLabel = useId()
  const nameId = useId()
  return (
    <ReferenceOverlay open={open} mobile={common.mobile} busy={common.busy} described={false} onClose={common.onClose}>
      <form
        className={ui.form}
        onSubmit={(event) => {
          event.preventDefault()
          if (name && !common.busy) onSubmit(name, form.makeDefault)
        }}
        data-kit-save-as=""
      >
        <div className={styles.dialogHead}>
          <OverlayTitle mobile={common.mobile}>{t('saveAsTitle')}</OverlayTitle>
          <CloseButton onClick={common.onClose} />
        </div>
        <div className={styles.identity}>
          <KitAvatar kit={{ name: name || '?', imageUrl: null }} size={52} />
          <label className={ui.field} htmlFor={nameId} style={{ flex: '1 1 auto', minWidth: 0 }}>
            <span>{t('name')}</span>
            <NameField id={nameId} value={form.name} label={t('kitName')} onChange={(value) => setForm((current) => ({ ...current, name: value }))} />
          </label>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', minHeight: 30, fontWeight: 500 }}>
          <span id={switchLabel}>{t('setDefault')}</span>
          <Switch aria-labelledby={switchLabel} checked={form.makeDefault} onCheckedChange={(makeDefault) => setForm((current) => ({ ...current, makeDefault }))} />
        </div>
        <ErrorText error={common.error} />
        <OverlayActions cancel={t('cancel')} confirm={t('saveKit')} tone="primary" busy={common.busy} disabled={!name} submit onCancel={common.onClose} />
      </form>
    </ReferenceOverlay>
  )
}
