'use client'

import { useToast } from '@/components/ui/toast'
import { extractApiError } from '@/lib/api-error'
import { apiFetch } from '@/lib/auth'
import type { PublishingAccount } from '@/lib/publishing'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

/** Disconnect flow shared by the account popover, the phone sheet and the connection list. */
export function useAccountDisconnect(onDisconnected: () => void) {
  const t = useTranslations('contentCalendar.connections')
  const toast = useToast()
  const [account, setAccount] = useState<PublishingAccount | null>(null)
  const [busy, setBusy] = useState(false)

  async function confirm() {
    if (!account || busy) return
    setBusy(true)
    try {
      const response = await apiFetch(
        `/api/publishing/accounts/${account.id}`,
        { method: 'DELETE' }
      )
      const result = (await response.json().catch(() => ({}))) as Record<
        string,
        unknown
      >
      if (!response.ok)
        throw new Error(extractApiError(result, t('disconnectFailed')))
      setAccount(null)
      onDisconnected()
      toast.add('success', t('disconnected'))
    } catch (caught) {
      toast.add(
        'error',
        caught instanceof Error ? caught.message : t('disconnectFailed')
      )
    } finally {
      setBusy(false)
    }
  }

  return {
    account,
    busy,
    request: setAccount,
    cancel: () => {
      if (!busy) setAccount(null)
    },
    confirm
  }
}
