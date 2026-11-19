'use client'

import { CloseButton, OverlayActions, OverlayTitle, ReferenceOverlay } from '@/components/shared/reference-overlay'
import { Upload } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useState } from 'react'
import type { useCaptionFontLibrary } from './use-caption-font-library'
import styles from './caption-card.module.css'

type FontLibrary = ReturnType<typeof useCaptionFontLibrary>

/** "Încarcă fontul tău": choose a TTF/OTF, confirm the licence, upload and select it. */
export function FontUploadDialog({
  open,
  mobile,
  library,
  onClose
}: {
  open: boolean
  mobile: boolean
  library: FontLibrary
  onClose: () => void
}) {
  const t = useTranslations('brand')
  const common = useTranslations('common')
  const [dragActive, setDragActive] = useState(false)
  const file = library.pendingFile

  function close() {
    library.clearFile()
    library.setConfirmed(false)
    onClose()
  }

  async function upload() {
    if (await library.upload()) close()
  }

  return (
    <ReferenceOverlay open={open} mobile={mobile} busy={library.busy} described={false} onClose={close}>
      <div className={styles.dialogHead}>
        <OverlayTitle mobile={mobile}>{t('customFont')}</OverlayTitle>
        <CloseButton onClick={close} />
      </div>
      <label
        className={styles.dropZone}
        data-drag-active={dragActive ? '' : undefined}
        onDragOver={(event) => {
          event.preventDefault()
          setDragActive(true)
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={(event) => {
          event.preventDefault()
          setDragActive(false)
          library.chooseFile(event.dataTransfer.files[0])
        }}
      >
        <img src="/illustrations/brand-font.webp" alt={t('editor.fontIllustration')} width={140} height={140} />
        <b>
          <Upload aria-hidden="true" />
          <span data-brand-font-pending={file ? '' : undefined}>{file?.name ?? t('editorDesign.chooseFont')}</span>
        </b>
        <small className={styles.hash}>{t('editor.fontLimit')}</small>
        <input
          type="file"
          accept=".ttf,.otf"
          className="sr-only"
          aria-label={t('editorDesign.chooseFont')}
          disabled={library.busy}
          onChange={(event) => {
            library.chooseFile(event.target.files?.[0])
            event.target.value = ''
          }}
        />
      </label>
      <label className={styles.permission}>
        <input
          type="checkbox"
          checked={library.confirmed}
          disabled={library.busy}
          onChange={(event) => library.setConfirmed(event.target.checked)}
        />
        {t('fontPermission')}
      </label>
      {library.error && (
        <p role="alert" className={styles.alert}>
          {library.error}
        </p>
      )}
      <OverlayActions
        cancel={common('cancel')}
        confirm={t('fontUpload')}
        tone="primary"
        busy={library.busy}
        disabled={!file || !library.confirmed}
        onCancel={close}
        onConfirm={() => void upload()}
      />
    </ReferenceOverlay>
  )
}
