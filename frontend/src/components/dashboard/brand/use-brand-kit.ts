'use client'

import { useToast } from '@/components/ui/toast'
import { useAuth } from '@/components/auth/use-auth'
import { apiFetch } from '@/lib/auth'
import { useCallback, useEffect, useMemo, useState } from 'react'

import {
  BRAND_DEFAULTS,
  LOGO_MAX_BYTES,
  LOGO_TYPES,
  WHITE_LABEL_PLAN
} from './constants'
import type { BrandKit } from './types'
import { useLogoPreview } from './use-logo-preview'
import { HEX_RE, normalizeHex } from './utils'

type Translate = (key: string) => string

/** Identity of the kit being edited (from the kits API). */
export type BrandKitMeta = { id: string; name: string; isDefault: boolean; imageUrl: string | null }

function kitEndpoints(kitId: string | null) {
  const id = kitId ? encodeURIComponent(kitId) : null
  return {
    kit: id ? `/api/brand-kits/${id}` : '/api/user/brand',
    logo: id ? `/api/user/brand/logo?kit=${id}` : '/api/user/brand/logo'
  }
}

function readMeta(value: unknown): BrandKitMeta | null {
  const kit = value as { id?: unknown; name?: unknown; isDefault?: unknown; imageUrl?: unknown } | null
  if (!kit || typeof kit.id !== 'string') return null
  return {
    id: kit.id,
    name: typeof kit.name === 'string' ? kit.name : '',
    isDefault: kit.isDefault === true,
    imageUrl: typeof kit.imageUrl === 'string' ? kit.imageUrl : null
  }
}

function errorMessage(data: unknown, fallback: string) {
  if (!data || typeof data !== 'object') return fallback
  const payload = data as {
    detail?: string | Array<{ msg?: string }>
    error?: string
  }
  if (typeof payload.detail === 'string') return payload.detail
  if (Array.isArray(payload.detail)) {
    const details = payload.detail
      .flatMap((entry) => (entry.msg ? [entry.msg] : []))
      .join('; ')
    if (details) return details
  }
  return payload.error || fallback
}

/** Loads and edits one brand kit; `kitId` null edits the account's default kit. */
export function useBrandKit(t: Translate, kitId: string | null = null) {
  const endpoints = useMemo(() => kitEndpoints(kitId), [kitId])
  const [meta, setMeta] = useState<BrandKitMeta | null>(null)
  const toast = useToast()
  const { user } = useAuth()
  const [kit, setKit] = useState<BrandKit>(BRAND_DEFAULTS)
  const [persistedKit, setPersistedKit] = useState<BrandKit>(BRAND_DEFAULTS)
  const [plan, setPlan] = useState('free')
  const [canWhiteLabel, setCanWhiteLabel] = useState<boolean | undefined>()
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [logoBusy, setLogoBusy] = useState(false)
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const logoPreviewUrl = useLogoPreview(logoFile, kit.logoUrl)

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(false)
    try {
      const response = await apiFetch(endpoints.kit)
      if (!response.ok) throw new Error('Brand kit unavailable')
      const data = await response.json()
      setMeta(readMeta(data.brandKit))
      const nextKit = Object.fromEntries(
        Object.entries(BRAND_DEFAULTS).map(([key, fallback]) => [
          key,
          data.brandKit?.[key] ?? fallback
        ])
      ) as BrandKit
      setKit(nextKit)
      setPersistedKit(nextKit)
      if (data.plan) setPlan(data.plan)
      setCanWhiteLabel(
        typeof data.canWhiteLabel === 'boolean' ? data.canWhiteLabel : undefined
      )
    } catch {
      setLoadError(true)
    } finally {
      setLoading(false)
    }
  }, [endpoints])

  useEffect(() => {
    void load()
  }, [load])

  const hasInvalidColor = ![
    kit.primaryColor,
    kit.secondaryColor,
    kit.subtitleColor,
    kit.subtitleBgColor,
    ...(kit.captionStyle
      ? [
          kit.captionStyle.text_color,
          kit.captionStyle.outline_color,
          kit.captionStyle.background_color,
          kit.captionStyle.highlight_color
        ]
      : [])
  ].every((color) => HEX_RE.test(color))

  const dirty = useMemo(
    () => JSON.stringify(kit) !== JSON.stringify(persistedKit),
    [kit, persistedKit]
  )

  function update<K extends keyof BrandKit>(key: K, value: BrandKit[K]) {
    setSaved(false)
    setKit((current) => ({ ...current, [key]: value }))
  }

  function reset() {
    setSaved(false)
    setKit({ ...BRAND_DEFAULTS, logoUrl: kit.logoUrl })
  }

  function discard() {
    setSaved(false)
    setKit(persistedKit)
  }

  function payloadFor(current: BrandKit) {
    return {
      ...Object.fromEntries(Object.keys(BRAND_DEFAULTS).map((key) => [key, current[key as keyof BrandKit]])),
      logoUrl: undefined,
      primaryColor: normalizeHex(current.primaryColor),
      secondaryColor: normalizeHex(current.secondaryColor),
      subtitleColor: normalizeHex(current.subtitleColor),
      subtitleBgColor: normalizeHex(current.subtitleBgColor)
    }
  }

  /**
   * "Salvează ca kit nou": creates a kit from the saved one, writes the current edits into it
   * and leaves this kit unchanged. Returns the new kit's id, or null on failure.
   */
  async function saveAsNew(name: string, makeDefault: boolean): Promise<{ id: string } | { error: string } | null> {
    if (hasInvalidColor) {
      toast.add('error', t('fixColors'))
      return null
    }
    setSaving(true)
    try {
      const created = await apiFetch('/api/brand-kits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, fromKitId: meta?.id ?? null, imagePath: null })
      })
      const data = await created.json().catch(() => null)
      if (!created.ok) return { error: created.status === 409 ? t('kitNameTaken') : errorMessage(data, t('saveFailed')) }
      const id = data.brandKit.id as string
      const saved = await apiFetch(`/api/brand-kits/${encodeURIComponent(id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payloadFor(kit))
      })
      if (!saved.ok) return { error: t('saveFailed') }
      if (makeDefault)
        await apiFetch(`/api/brand-kits/${encodeURIComponent(id)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ isDefault: true })
        })
      setKit(persistedKit)
      return { id }
    } catch {
      return { error: t('saveFailed') }
    } finally {
      setSaving(false)
    }
  }

  async function save() {
    if (hasInvalidColor) {
      toast.add('error', t('fixColors'))
      return
    }
    setSaving(true)
    try {
      const payload = payloadFor(kit)
      const response = await apiFetch(endpoints.kit, {
        method: 'PUT',
        body: JSON.stringify(payload),
        headers: { 'Content-Type': 'application/json' }
      })
      const data = await response.json().catch(() => null)
      if (!response.ok) {
        toast.add('error', errorMessage(data, t('saveFailed')))
        return
      }
      const nextKit = { ...kit, ...(data?.brandKit ?? payload) }
      setKit(nextKit)
      setPersistedKit(nextKit)
      setSaved(true)
      toast.add('success', t('kitSaved'))
    } catch {
      toast.add('error', t('saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  async function uploadLogo(file: File) {
    if (logoBusy || saving) return
    if (!LOGO_TYPES.includes(file.type)) {
      toast.add('error', t('useFormats'))
      return
    }
    if (file.size > LOGO_MAX_BYTES) {
      toast.add('error', t('logoTooLarge'))
      return
    }
    const previousFile = logoFile
    setLogoFile(file)
    setLogoBusy(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const response = await apiFetch(endpoints.logo, {
        method: 'POST',
        body: formData
      })
      const data = await response.json().catch(() => null)
      if (!response.ok) {
        setLogoFile(previousFile)
        toast.add('error', errorMessage(data, t('uploadFailed')))
        return
      }
      const logoUrl = data?.brandKit?.logoUrl ?? null
      setKit((current) => ({ ...current, logoUrl }))
      setPersistedKit((current) => ({ ...current, logoUrl }))
      toast.add('success', t('logoUploaded'))
    } catch {
      setLogoFile(previousFile)
      toast.add('error', t('uploadFailed'))
    } finally {
      setLogoBusy(false)
    }
  }

  async function removeLogo() {
    if (logoBusy || saving) return
    setLogoBusy(true)
    try {
      const response = await apiFetch(endpoints.logo, {
        method: 'DELETE'
      })
      if (!response.ok) {
        toast.add('error', t('uploadFailed'))
        return
      }
      setKit((current) => ({ ...current, logoUrl: null }))
      setPersistedKit((current) => ({ ...current, logoUrl: null }))
      setLogoFile(null)
    } catch {
      toast.add('error', t('uploadFailed'))
    } finally {
      setLogoBusy(false)
    }
  }

  return {
    kit,
    meta,
    setMeta,
    saveAsNew,
    plan,
    loading,
    loadError,
    saving,
    saved,
    logoBusy,
    logoPreviewUrl,
    logoName: logoFile?.name,
    dirty,
    hasInvalidColor,
    canWhiteLabel:
      canWhiteLabel ?? (user?.access_role === 'admin' || plan === WHITE_LABEL_PLAN),
    update,
    reset,
    discard,
    save,
    uploadLogo,
    removeLogo,
    retry: load
  }
}
