'use client'

import { useToast } from '@/components/ui/toast'
import { apiFetch } from '@/lib/auth'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

/** Deletes one clip through the API and refreshes the caller's data. */
export function useDeleteClip({
  clipId,
  successMessage,
  errorMessage,
  onDeleted
}: {
  clipId: string
  successMessage: string
  errorMessage: string
  onDeleted?: () => void | Promise<void>
}) {
  const router = useRouter()
  const toast = useToast()
  const [deleting, setDeleting] = useState(false)

  async function deleteClip() {
    setDeleting(true)
    try {
      const response = await apiFetch(
        `/api/clips/${encodeURIComponent(clipId)}`,
        { method: 'DELETE' }
      )
      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        toast.add('error', data.error ?? errorMessage)
        return false
      }
      toast.add('success', successMessage)
      await onDeleted?.()
      router.refresh()
      return true
    } catch {
      toast.add('error', errorMessage)
      return false
    } finally {
      setDeleting(false)
    }
  }

  return { deleting, deleteClip }
}
