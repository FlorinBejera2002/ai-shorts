'use client'

import { useToast } from '@/components/ui/toast'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useEffect, useRef } from 'react'

const ANNOUNCED_KEY = 'sneepcut:checkout-return-announced'
const ANNOUNCED_LIMIT = 20

/** Checkout returns already announced in this tab, so a reload does not repeat the toast. */
function readAnnounced(): string[] {
  try {
    const stored = JSON.parse(window.sessionStorage.getItem(ANNOUNCED_KEY) ?? '[]')
    return Array.isArray(stored) ? stored.filter((value): value is string => typeof value === 'string') : []
  } catch {
    return []
  }
}

function rememberAnnounced(key: string) {
  try {
    window.sessionStorage.setItem(ANNOUNCED_KEY, JSON.stringify([...readAnnounced(), key].slice(-ANNOUNCED_LIMIT)))
  } catch {
    // Storage can be unavailable (private mode); the per-mount guard still prevents repeats.
  }
}

/**
 * Announces the outcome of a Stripe return once. Persistent checkout states stay in the notices;
 * the toast only confirms this return. A cancelled return drops its flag from the URL, and a
 * verified session is remembered for the tab, so neither re-renders nor reloads repeat a toast.
 */
export function useCheckoutReturnToast(verificationStatus: string | null | undefined, canceled: boolean) {
  const t = useTranslations('billing')
  const addToast = useToast((state) => state.add)
  const router = useRouter()
  const pathname = usePathname()
  const checkoutSessionId = useSearchParams().get('checkout_session_id')
  const announced = useRef(new Set<string>())

  useEffect(() => {
    if (!canceled || announced.current.has('canceled')) return
    announced.current.add('canceled')
    addToast('info', t('checkoutCanceled'))
    const params = new URLSearchParams(window.location.search)
    params.delete('canceled')
    const query = params.toString()
    router.replace(query ? `${pathname}?${query}` : pathname)
  }, [canceled, pathname, router, t, addToast])

  useEffect(() => {
    if (!checkoutSessionId || !verificationStatus) return
    const outcome = CHECKOUT_OUTCOMES[verificationStatus]
    if (!outcome) return
    const key = `${checkoutSessionId}:${verificationStatus}`
    if (announced.current.has(key) || readAnnounced().includes(key)) return
    announced.current.add(key)
    rememberAnnounced(key)
    addToast(outcome.type, t(outcome.message))
  }, [checkoutSessionId, verificationStatus, t, addToast])
}

const CHECKOUT_OUTCOMES: Record<string, { type: 'success' | 'error' | 'warning'; message: string }> = {
  complete: { type: 'success', message: 'canvas.checkoutSuccess' },
  invalid: { type: 'error', message: 'checkoutVerificationFailed' },
  unavailable: { type: 'warning', message: 'checkoutVerificationUnavailable' }
}
