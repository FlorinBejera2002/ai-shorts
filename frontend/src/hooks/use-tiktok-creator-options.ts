'use client'

import { extractApiError } from '@/lib/api-error'
import { apiFetch } from '@/lib/auth'
import type { CreatorOptions } from '@/lib/publishing'
import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'

export type TikTokCreatorOptionsState =
  | { status: 'idle'; value: null; error: null }
  | { status: 'loading'; value: null; error: null }
  | { status: 'ready'; value: CreatorOptions; error: null }
  | { status: 'error'; value: null; error: string }

function errorData(body: unknown): Record<string, unknown> {
  return body && typeof body === 'object'
    ? (body as Record<string, unknown>)
    : {}
}

export function useTikTokCreatorOptions(accountId?: string) {
  const t = useTranslations('publishing')
  const [requestRevision, setRequestRevision] = useState(0)
  const [state, setState] = useState<TikTokCreatorOptionsState>({
    status: 'idle',
    value: null,
    error: null
  })

  useEffect(() => {
    void requestRevision
    if (!accountId) {
      setState({ status: 'idle', value: null, error: null })
      return
    }

    const controller = new AbortController()
    setState({ status: 'loading', value: null, error: null })
    void apiFetch(`/api/publishing/accounts/${accountId}/options`, {
      signal: controller.signal,
      cache: 'no-store'
    })
      .then(async (response) => {
        const body: unknown = await response.json().catch(() => null)
        if (!response.ok) {
          throw new Error(extractApiError(errorData(body), t('optionsError')))
        }
        if (!controller.signal.aborted) {
          setState({
            status: 'ready',
            value: body as CreatorOptions,
            error: null
          })
        }
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        setState({
          status: 'error',
          value: null,
          error:
            error instanceof Error && error.message
              ? error.message
              : t('optionsError')
        })
      })

    return () => controller.abort()
  }, [accountId, requestRevision, t])

  return {
    state,
    retry: () => setRequestRevision((revision) => revision + 1)
  }
}
