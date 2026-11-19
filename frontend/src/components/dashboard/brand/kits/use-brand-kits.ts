'use client'

import { apiFetch } from '@/lib/auth'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo } from 'react'
import { LOGO_MAX_BYTES, LOGO_TYPES } from '../constants'
import type { BrandKitSummary } from './kit-model'

export const KITS_KEY = ['api-resource', '/api/brand-kits']

type KitsResponse = { kits: BrandKitSummary[]; plan?: string; canWhiteLabel?: boolean }

export class KitRequestError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message)
  }
}

async function send(path: string, method: string, body?: unknown) {
  const response = await apiFetch(path, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body)
  })
  const data = response.status === 204 ? null : await response.json().catch(() => null)
  if (!response.ok) throw new KitRequestError(typeof data?.error === 'string' ? data.error : 'Request failed', response.status)
  return data as { brandKit?: BrandKitSummary } | null
}

/** Uploads a kit image into the user's brand folder and returns its storage path. */
async function uploadImage(file: File) {
  if (!LOGO_TYPES.includes(file.type) || file.size > LOGO_MAX_BYTES) throw new KitRequestError('Unsupported image', 400)
  const form = new FormData()
  form.append('file', file)
  const response = await apiFetch('/api/brand/logo', { method: 'POST', body: form })
  const data = await response.json().catch(() => null)
  if (!response.ok || typeof data?.logo_path !== 'string') throw new KitRequestError('Upload failed', response.status)
  return data.logo_path as string
}

export type BrandKitsActions = {
  create: (input: { name: string; fromKitId: string | null; image: File | null }) => Promise<string>
  rename: (id: string, name: string) => Promise<void>
  changeImage: (id: string, image: File) => Promise<void>
  duplicate: (kit: BrandKitSummary, name: string) => Promise<string>
  setDefault: (id: string) => Promise<void>
  remove: (id: string) => Promise<void>
}

/** Lists the account's brand kits and exposes the kit-level actions. */
export function useBrandKits() {
  const client = useQueryClient()
  const query = useQuery({
    queryKey: KITS_KEY,
    queryFn: async () => {
      const response = await apiFetch('/api/brand-kits')
      if (!response.ok) throw new Error('Brand kits unavailable')
      return (await response.json()) as KitsResponse
    }
  })

  const actions = useMemo<BrandKitsActions>(() => {
    async function refresh() {
      await Promise.all([
        client.invalidateQueries({ queryKey: KITS_KEY }),
        client.invalidateQueries({ queryKey: ['api-resource', '/api/user/brand'] })
      ])
    }
    async function created(data: { brandKit?: BrandKitSummary } | null) {
      await refresh()
      return data?.brandKit?.id ?? ''
    }
    return {
      async create({ name, fromKitId, image }) {
        const imagePath = image ? await uploadImage(image) : null
        return created(await send('/api/brand-kits', 'POST', { name, fromKitId, imagePath }))
      },
      async rename(id, name) {
        await send(`/api/brand-kits/${encodeURIComponent(id)}`, 'PATCH', { name })
        await refresh()
      },
      async changeImage(id, image) {
        const imagePath = await uploadImage(image)
        await send(`/api/brand-kits/${encodeURIComponent(id)}`, 'PATCH', { imagePath })
        await refresh()
      },
      async duplicate(kit, name) {
        return created(await send('/api/brand-kits', 'POST', { name, fromKitId: kit.id, imagePath: kit.imagePath ?? null }))
      },
      async setDefault(id) {
        await send(`/api/brand-kits/${encodeURIComponent(id)}`, 'PATCH', { isDefault: true })
        await refresh()
      },
      async remove(id) {
        await send(`/api/brand-kits/${encodeURIComponent(id)}`, 'DELETE')
        await refresh()
      }
    }
  }, [client])

  return {
    kits: query.data?.kits ?? null,
    isPending: query.isPending,
    isError: query.isError && !query.data,
    reload: () => void query.refetch(),
    actions
  }
}
