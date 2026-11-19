'use client'

import { useIsMobile } from '@/hooks/use-mobile'
import { useRouter } from '@/i18n/navigation'
import { useState } from 'react'
import type { BrandKitController } from './brand-workspace-types'
import { CaptionCard } from './caption-card'
import { KitCreatedNotice } from './kits/kit-created-notice'
import { KitSaveAsDialog } from './kits/kit-dialogs'
import { KitHeader } from './kits/kit-header'
import { kitHref } from './kits/kit-model'
import { LogoSummaryCard, LogoUploadCard } from './logo-card'
import { LogoScreen } from './logo-screen'
import { PreviewCard } from './preview-card'
import { SaveCard, SavedNotice } from './save-card'
import { useBrandPreviewMedia } from './use-brand-preview-media'
import { useBrandPreviewPlayer } from './use-brand-preview-player'
import styles from './brand-editor.module.css'

/** "Ana Creator" → "ana.creator", the handle shown in the social simulation. */
function handleFor(name: string | undefined) {
  const handle = name
    ?.normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.|\.$/g, '')
  return handle || undefined
}

/** "Salvează ca kit nou": create the kit, then open it with the "created" notice. */
function useSaveAs(brand: BrandKitController) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function submit(name: string, makeDefault: boolean) {
    setError(null)
    const result = await brand.saveAsNew(name, makeDefault)
    if (!result) return
    if ('error' in result) return setError(result.error)
    setOpen(false)
    router.push(`${kitHref(result.id)}?created=1`)
  }
  return {
    open,
    error,
    start: () => {
      setError(null)
      setOpen(true)
    },
    close: () => setOpen(false),
    submit
  }
}

/** Canvas Br-Main and Br-Logo: caption and logo settings beside the live preview and save state. */
export function BrandEditor({ brand }: { brand: BrandKitController }) {
  const mobile = useIsMobile()
  const [view, setView] = useState<'main' | 'logo'>('main')
  const [fontBusy, setFontBusy] = useState(false)
  const saveAs = useSaveAs(brand)
  const source = useBrandPreviewMedia()
  const player = useBrandPreviewPlayer(source.media?.url)
  const busy = brand.saving || brand.logoBusy
  const logoUrl = brand.logoPreviewUrl

  return (
    <div className={styles.page} data-brand-workspace="" data-view={view}>
      <KitHeader meta={brand.meta} />
      <KitCreatedNotice name={brand.meta?.name} />
      <div className={styles.layout}>
        <fieldset className={styles.controls} disabled={busy}>
          {view === 'logo' ? (
            <LogoScreen brand={brand} busy={busy || fontBusy} poster={source.media?.poster ?? source.media?.url} onBack={() => setView('main')} />
          ) : (
            <>
              <CaptionCard kit={brand.kit} update={brand.update} onBusyChange={setFontBusy} />
              {logoUrl ? (
                <LogoSummaryCard kit={brand.kit} logoUrl={logoUrl} onOpen={() => setView('logo')} />
              ) : (
                <LogoUploadCard busy={busy || fontBusy} onUpload={brand.uploadLogo} />
              )}
            </>
          )}
        </fieldset>
        <div className={styles.side}>
          <PreviewCard
            kit={brand.kit}
            logoUrl={logoUrl}
            update={brand.saving ? () => {} : brand.update}
            accountName={handleFor(brand.meta?.name)}
            safeZone={view === 'logo'}
            source={source}
            player={player}
          />
          {brand.savedAt !== null && <SavedNotice key={brand.savedAt} />}
          <SaveCard brand={brand} fontBusy={fontBusy} onSaveAs={brand.meta ? saveAs.start : undefined} />
        </div>
      </div>
      <KitSaveAsDialog
        open={saveAs.open}
        mobile={mobile}
        busy={brand.saving}
        error={saveAs.error}
        onClose={saveAs.close}
        onSubmit={(name, makeDefault) => void saveAs.submit(name, makeDefault)}
      />
    </div>
  )
}
