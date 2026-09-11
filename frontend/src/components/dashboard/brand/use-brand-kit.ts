'use client'

import { useToast } from '@/components/ui/toast'
import { apiFetch } from '@/lib/auth'
import { useCallback, useEffect, useMemo, useState } from 'react'

import {
  BRAND_DEFAULTS,
  LOGO_MAX_BYTES,
  LOGO_TYPES,
  WHITE_LABEL_PLAN
} from './constants'
import type { BrandKit } from './types'
import { HEX_RE, normalizeHex } from './utils'

type Translate = (key: string) => string

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

export function useBrandKit(t: Translate) {
  const toast = useToast()
  const [kit, setKit] = useState<BrandKit>(BRAND_DEFAULTS)
  const [persistedKit, setPersistedKit] = useState<BrandKit>(BRAND_DEFAULTS)
  const [plan, setPlan] = useState('free')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [logoBusy, setLogoBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(false)
    try {
      const response = await apiFetch('/api/user/brand')
      if (!response.ok) throw new Error('Brand kit unavailable')
      const data = await response.json()
      const nextKit = { ...BRAND_DEFAULTS, ...(data.brandKit ?? {}) }
      setKit(nextKit)
      setPersistedKit(nextKit)
      if (data.plan) setPlan(data.plan)
    } catch {
      setLoadError(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const hasInvalidColor = ![
    kit.primaryColor,
    kit.secondaryColor,
    kit.subtitleColor,
    kit.subtitleBgColor
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

  async function save() {
    if (hasInvalidColor) {
      toast.add('error', t('fixColors'))
      return
    }
    setSaving(true)
    try {
      const payload = {
        ...kit,
        logoUrl: undefined,
        primaryColor: normalizeHex(kit.primaryColor),
        secondaryColor: normalizeHex(kit.secondaryColor),
        subtitleColor: normalizeHex(kit.subtitleColor),
        subtitleBgColor: normalizeHex(kit.subtitleBgColor)
      }
      const response = await apiFetch('/api/user/brand', {
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
    if (!LOGO_TYPES.includes(file.type)) {
      toast.add('error', t('useFormats'))
      return
    }
    if (file.size > LOGO_MAX_BYTES) {
      toast.add('error', t('logoTooLarge'))
      return
    }
    setLogoBusy(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const response = await apiFetch('/api/user/brand/logo', {
        method: 'POST',
        body: formData
      })
      const data = await response.json().catch(() => null)
      if (!response.ok) {
        toast.add('error', errorMessage(data, t('uploadFailed')))
        return
      }
      const logoUrl = data?.brandKit?.logoUrl ?? null
      setKit((current) => ({ ...current, logoUrl }))
      setPersistedKit((current) => ({ ...current, logoUrl }))
      toast.add('success', t('logoUploaded'))
    } catch {
      toast.add('error', t('uploadFailed'))
    } finally {
      setLogoBusy(false)
    }
  }

  async function removeLogo() {
    setLogoBusy(true)
    try {
      const response = await apiFetch('/api/user/brand/logo', {
        method: 'DELETE'
      })
      if (!response.ok) {
        toast.add('error', t('uploadFailed'))
        return
      }
      setKit((current) => ({ ...current, logoUrl: null }))
      setPersistedKit((current) => ({ ...current, logoUrl: null }))
    } catch {
      toast.add('error', t('uploadFailed'))
    } finally {
      setLogoBusy(false)
    }
  }

  return {
    kit,
    plan,
    loading,
    loadError,
    saving,
    saved,
    logoBusy,
    dirty,
    hasInvalidColor,
    canWhiteLabel: plan === WHITE_LABEL_PLAN,
    update,
    reset,
    discard,
    save,
    uploadLogo,
    removeLogo,
    retry: load
  }
}
