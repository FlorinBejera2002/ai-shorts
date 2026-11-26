'use client'

import { useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'

import { useRouter } from '@/i18n/navigation'
import type { CreateSettings } from './settings-panel'
import { buildYouTubeJobOptions, CREDITS_PER_CLIP, DEFAULT_YOUTUBE_SETTINGS } from './use-youtube-creation'
import { canonicalYouTubeLink } from './youtube-link-model'
import { requestYouTubeLink } from './youtube-link-request'

export function useYouTubeLink() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [url, setUrl] = useState('')
  const [settings, setSettings] = useState<CreateSettings>(DEFAULT_YOUTUBE_SETTINGS)
  const [error, setError] = useState<'invalid' | 'failed' | 'rateLimited' | null>(null)
  const [busy, setBusy] = useState(false)
  const [limitReached, setLimitReached] = useState(false)
  const inFlight = useRef(false)
  const canonical = canonicalYouTubeLink(url)
  const creditCost = (settings.clips || 5) * CREDITS_PER_CLIP

  function changeUrl(value: string) {
    setUrl(value)
    setError(null)
  }

  async function generate() {
    if (inFlight.current || limitReached) return
    if (!canonical) {
      setError('invalid')
      return
    }
    inFlight.current = true
    setBusy(true)
    setError(null)
    const outcome = await requestYouTubeLink({
      source_type: 'youtube',
      source_url: canonical,
      ...buildYouTubeJobOptions(settings)
    })
    inFlight.current = false
    setBusy(false)
    if (outcome.kind === 'limit') {
      setLimitReached(true)
      return
    }
    if (outcome.kind !== 'queued') {
      setError(outcome.kind)
      return
    }
    void queryClient.invalidateQueries({ queryKey: ['jobs'] })
    void queryClient.invalidateQueries({ queryKey: ['credits'] })
    router.push(`/dashboard/jobs/${outcome.id}`)
  }

  return {
    url,
    changeUrl,
    settings,
    setSettings,
    error,
    busy,
    limitReached,
    creditCost,
    valid: canonical !== null,
    generate
  }
}
