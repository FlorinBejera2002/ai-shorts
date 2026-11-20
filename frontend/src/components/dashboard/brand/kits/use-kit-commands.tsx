'use client'

import { useToast } from '@/components/ui/toast'
import { useTranslations } from 'next-intl'
import { useRef, useState } from 'react'
import { LOGO_TYPES } from '../constants'
import { KitDeleteDialog, KitNewDialog, KitRenameDialog } from './kit-dialogs'
import type { KitCommand } from './kit-menu'
import { copyName, type BrandKitSummary } from './kit-model'
import { KitRequestError, type BrandKitsActions } from './use-brand-kits'

/**
 * Runs the kit menu commands and "Kit nou" with their dialogs. `overlays` must be rendered once
 * by the page; `onOpen` receives a kit id to navigate to after creating or duplicating.
 */
export function useKitCommands({
  kits,
  actions,
  mobile,
  onOpen,
  onDeleted
}: {
  kits: BrandKitSummary[]
  actions: BrandKitsActions
  mobile: boolean
  onOpen: (id: string) => void
  onDeleted?: (id: string) => void
}) {
  const t = useTranslations('brandKits')
  const brand = useTranslations('brand')
  const addToast = useToast((state) => state.add)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [renaming, setRenaming] = useState<BrandKitSummary | null>(null)
  const [deleting, setDeleting] = useState<BrandKitSummary | null>(null)
  const imageInput = useRef<HTMLInputElement>(null)
  const imageTarget = useRef<BrandKitSummary | null>(null)
  const source = kits.find((kit) => kit.isDefault) ?? kits[0] ?? null

  function failure(reason: unknown) {
    if (!(reason instanceof KitRequestError)) return t('failed')
    if (reason.image === 'type') return brand('useFormats')
    if (reason.image === 'size') return brand('logoTooLarge')
    return reason.status === 409 ? t('nameTaken') : t('failed')
  }

  /**
   * Runs one request with the busy flag. A taken name stays inline in its dialog; every other
   * outcome is a toast. Resolves to `{ ok: true, value }` so callers update their own state afterwards.
   */
  async function perform<T>(
    request: () => Promise<T>,
    { inline = false, success }: { inline?: boolean; success?: string } = {}
  ): Promise<{ ok: true; value: T } | { ok: false }> {
    setBusy(true)
    setError(null)
    try {
      const value = await request()
      if (success) addToast('success', success)
      return { ok: true, value }
    } catch (reason) {
      if (inline && reason instanceof KitRequestError && reason.status === 409) setError(failure(reason))
      else addToast('error', failure(reason))
      return { ok: false }
    } finally {
      setBusy(false)
    }
  }

  async function duplicate(kit: BrandKitSummary) {
    const name = copyName(kit.name, kits.map((item) => item.name))
    const result = await perform(() => actions.duplicate(kit, name), { success: t('duplicated', { name }) })
    if (result.ok) onOpen(result.value)
  }

  function run(command: KitCommand, kit: BrandKitSummary) {
    setError(null)
    if (command === 'rename') setRenaming(kit)
    else if (command === 'delete') setDeleting(kit)
    else if (command === 'image') {
      imageTarget.current = kit
      imageInput.current?.click()
    } else if (command === 'default') void perform(() => actions.setDefault(kit.id), { success: t('defaultSet', { name: kit.name }) })
    else if (command === 'duplicate') void duplicate(kit)
  }

  async function submitNew(input: { name: string; fromKitId: string | null; image: File | null }) {
    const result = await perform(() => actions.create(input), { inline: true, success: t('created', { name: input.name }) })
    if (!result.ok) return
    setCreating(false)
    onOpen(result.value)
  }

  async function submitRename(name: string) {
    const kit = renaming
    if (!kit) return
    const result = await perform(() => actions.rename(kit.id, name), { inline: true, success: t('renamed') })
    if (result.ok) setRenaming(null)
  }

  async function confirmDelete() {
    const kit = deleting
    if (!kit) return
    const result = await perform(() => actions.remove(kit.id), { success: t('deleted', { name: kit.name }) })
    if (!result.ok) return
    onDeleted?.(kit.id)
    setDeleting(null)
  }

  function changeImage(file: File | undefined) {
    const kit = imageTarget.current
    if (file && kit) void perform(() => actions.changeImage(kit.id, file), { success: t('imageChanged') })
  }

  const overlays = (
    <>
      <input
        ref={imageInput}
        type="file"
        accept={LOGO_TYPES.join(',')}
        hidden
        data-kit-image-input=""
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = ''
          changeImage(file)
        }}
      />
      {creating && (
      <KitNewDialog
        open
        source={source}
        mobile={mobile}
        busy={busy}
        error={error}
        onClose={() => setCreating(false)}
        onSubmit={(input) => void submitNew(input)}
      />
      )}
      <KitRenameDialog
        kit={renaming}
        mobile={mobile}
        busy={busy}
        error={error}
        onClose={() => setRenaming(null)}
        onSubmit={(name) => void submitRename(name)}
      />
      <KitDeleteDialog
        kit={deleting}
        mobile={mobile}
        busy={busy}
        onClose={() => setDeleting(null)}
        onConfirm={() => void confirmDelete()}
      />
    </>
  )

  return {
    run,
    openNew: () => {
      setError(null)
      setCreating(true)
    },
    overlays
  }
}
