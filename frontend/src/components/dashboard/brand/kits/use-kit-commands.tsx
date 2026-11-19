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
  const errors = useToast()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [renaming, setRenaming] = useState<BrandKitSummary | null>(null)
  const [deleting, setDeleting] = useState<BrandKitSummary | null>(null)
  const imageInput = useRef<HTMLInputElement>(null)
  const imageTarget = useRef<BrandKitSummary | null>(null)
  const source = kits.find((kit) => kit.isDefault) ?? kits[0] ?? null

  function failure(reason: unknown) {
    return reason instanceof KitRequestError && reason.status === 409 ? t('nameTaken') : t('failed')
  }

  async function attempt(task: () => Promise<void>, inline: boolean) {
    setBusy(true)
    setError(null)
    try {
      await task()
    } catch (reason) {
      if (inline) setError(failure(reason))
      else errors.add('error', failure(reason))
    } finally {
      setBusy(false)
    }
  }

  function run(command: KitCommand, kit: BrandKitSummary) {
    setError(null)
    if (command === 'rename') setRenaming(kit)
    else if (command === 'delete') setDeleting(kit)
    else if (command === 'image') {
      imageTarget.current = kit
      imageInput.current?.click()
    } else if (command === 'default') void attempt(() => actions.setDefault(kit.id), false)
    else if (command === 'duplicate')
      void attempt(async () => {
        onOpen(await actions.duplicate(kit, copyName(kit.name, kits.map((item) => item.name))))
      }, false)
  }

  function submitNew(input: { name: string; fromKitId: string | null; image: File | null }) {
    void attempt(async () => {
      const id = await actions.create(input)
      setCreating(false)
      onOpen(id)
    }, true)
  }

  function submitRename(name: string) {
    const kit = renaming
    if (!kit) return
    void attempt(async () => {
      await actions.rename(kit.id, name)
      setRenaming(null)
    }, true)
  }

  function confirmDelete() {
    const kit = deleting
    if (!kit) return
    void attempt(async () => {
      await actions.remove(kit.id)
      onDeleted?.(kit.id)
      setDeleting(null)
    }, false)
  }

  function changeImage(file: File | undefined) {
    const kit = imageTarget.current
    if (file && kit) void attempt(() => actions.changeImage(kit.id, file), false)
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
        onSubmit={submitNew}
      />
      )}
      <KitRenameDialog
        kit={renaming}
        mobile={mobile}
        busy={busy}
        error={error}
        onClose={() => setRenaming(null)}
        onSubmit={submitRename}
      />
      <KitDeleteDialog
        kit={deleting}
        mobile={mobile}
        busy={busy}
        onClose={() => setDeleting(null)}
        onConfirm={confirmDelete}
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
