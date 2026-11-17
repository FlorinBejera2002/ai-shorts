'use client'

import { DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { LoadingIndicator } from '@/components/ui/loading-indicator'
import { X } from 'lucide-react'
import Image from 'next/image'
import { type CSSProperties, useId } from 'react'
import styles from './clips-brand-dialog.module.css'
import { useClipsCopy } from './clips-copy'
import { ClipsDialog } from './clips-dialogs'
import dialogStyles from './clips-dialogs.module.css'
import type { ProjectBrand } from './clips-project-types'

type ColorField = 'primaryColor' | 'secondaryColor' | 'subtitleColor'

/** Project-scoped brand kit editor with a live caption preview. */
export function ClipsBrandDialog({
  open,
  projectName,
  brand,
  saving,
  onOpenChange,
  onBrand,
  onLogo,
  onSubmit
}: {
  open: boolean
  projectName: string
  brand: Required<ProjectBrand>
  saving: boolean
  onOpenChange: (open: boolean) => void
  onBrand: (brand: Required<ProjectBrand>) => void
  onLogo: (file: File) => void
  onSubmit: () => void
}) {
  const copy = useClipsCopy()
  const id = useId()
  const name = brand.name || projectName
  const update = (field: keyof ProjectBrand, value: string) =>
    onBrand({ ...brand, [field]: value })

  return (
    <ClipsDialog
      open={open}
      busy={saving}
      label={copy.brandTitle(name)}
      className={styles.dialog}
      onOpenChange={onOpenChange}
    >
      <header className={styles.header}>
        <div>
          <DialogTitle className={styles.title}>
            {copy.brandTitle(projectName)}
          </DialogTitle>
          <DialogDescription className={styles.description}>
            {copy.brandDescription}
          </DialogDescription>
        </div>
        <button
          type="button"
          className={styles.close}
          aria-label={copy.close}
          disabled={saving}
          onClick={() => onOpenChange(false)}
        >
          <X aria-hidden="true" />
        </button>
      </header>
      <div className={styles.body}>
        <div
          className={styles.preview}
          style={
            {
              '--brand-primary': brand.primaryColor,
              '--brand-secondary': brand.secondaryColor,
              '--brand-caption': brand.subtitleColor,
              fontFamily: `${brand.fontFamily}, 'Inter Variable', Inter, sans-serif`
            } as CSSProperties
          }
          aria-hidden="true"
        >
          <span className={styles.chip}>{name}</span>
          <span className={styles.orb} />
          <strong>
            {copy.previewHeadline[0]}
            <br />
            {copy.previewHeadline[1]}
          </strong>
          <small>{copy.previewCaption}</small>
        </div>
        <div className={styles.fields}>
          <div className={styles.logo}>
            <span className={styles.logoPreview}>
              {brand.logoUrl ? (
                <Image src={brand.logoUrl} alt="" fill={true} sizes="52px" />
              ) : (
                copy.logo.toUpperCase()
              )}
            </span>
            <label className={styles.logoButton} data-disabled={saving}>
              {copy.chooseLogo}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="sr-only"
                disabled={saving}
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  if (file) onLogo(file)
                  event.target.value = ''
                }}
              />
            </label>
          </div>
          <div className={styles.pair}>
            <label className={dialogStyles.field} htmlFor={`${id}-name`}>
              {copy.brandName}
              <input
                id={`${id}-name`}
                className={dialogStyles.input}
                value={brand.name}
                placeholder={projectName}
                maxLength={100}
                onChange={(event) => update('name', event.target.value)}
              />
            </label>
            <label className={dialogStyles.field} htmlFor={`${id}-font`}>
              {copy.font}
              <input
                id={`${id}-font`}
                className={dialogStyles.input}
                value={brand.fontFamily}
                maxLength={100}
                onChange={(event) =>
                  onBrand({
                    ...brand,
                    fontFamily: event.target.value,
                    subtitleFont: event.target.value
                  })
                }
              />
            </label>
          </div>
          <div className={styles.colors}>
            {copy.colors.map((color) => {
              const field = color.field as ColorField
              const value = brand[field]
              return (
                <label key={field} className={styles.color}>
                  <span
                    className={styles.swatch}
                    style={{ background: value }}
                    aria-hidden="true"
                  />
                  <span className={styles.colorName}>
                    <span className={styles.long}>{color.label}</span>
                    <span className={styles.short}>{color.short}</span>
                  </span>
                  <span className={styles.hex}>{value.toUpperCase()}</span>
                  <input
                    type="color"
                    className="sr-only"
                    aria-label={`${color.label} ${value.toUpperCase()}`}
                    value={value}
                    onChange={(event) => update(field, event.target.value)}
                  />
                </label>
              )
            })}
          </div>
        </div>
      </div>
      <footer className={styles.footer}>
        <button
          type="button"
          className={styles.discard}
          disabled={saving}
          onClick={() => onOpenChange(false)}
        >
          {copy.discard}
        </button>
        <button
          type="button"
          className={`${dialogStyles.primary} ${styles.save}`}
          disabled={saving}
          onClick={onSubmit}
        >
          {saving && <LoadingIndicator className="size-4" />}
          {copy.save}
        </button>
      </footer>
    </ClipsDialog>
  )
}
