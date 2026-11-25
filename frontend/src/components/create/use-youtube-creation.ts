'use client'

import { useMemo, useRef, useState } from 'react'
import { useLocale } from 'next-intl'

import type { CreateSettings } from '@/components/create/settings-panel'
import { apiFetch } from '@/lib/auth'
import { AUTO_CLIP_COUNT, isGoogleAuthorizationUrl } from './youtube-creation-model'
import { classifySelectionFailure, type SelectionFailure } from './youtube-import-model'

/** Credits charged per clip; mirrors the backend price. */
export const CREDITS_PER_CLIP = 10

export const DEFAULT_YOUTUBE_SETTINGS: CreateSettings = {
  clips: AUTO_CLIP_COUNT,
  aspectRatio: '9:16',
  subtitleStyle: 'bold',
  includeBrand: false,
  language: '',
  smartCrop: true,
  reduceBackgroundNoise: false
}

/** Job options the selection request carries. They match the fields POST /api/jobs takes, minus the source. */
export function buildYouTubeJobOptions(settings: CreateSettings) {
  return {
    num_clips_requested: settings.clips,
    aspect_ratio: settings.aspectRatio,
    subtitle_style: settings.subtitleStyle,
    include_brand: settings.includeBrand,
    ...(settings.includeBrand && settings.brandKitId ? { brand_kit_id: settings.brandKitId } : {}),
    burn_subtitles: settings.subtitleStyle !== 'none',
    smart_crop: settings.smartCrop,
    audio_cleanup: { enabled: settings.reduceBackgroundNoise ?? false },
    ...(settings.language ? { language: settings.language } : {})
  }
}

export type SelectionOutcome = { ok: true; url: string } | { ok: false; failure: SelectionFailure }

/** Starts an import for the chosen videos. The success URL is Google's data-export consent page. */
export async function requestSelectionImport(body: unknown): Promise<SelectionOutcome> {
  let response: Response
  try {
    response = await apiFetch('/api/youtube/imports/selection', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
  } catch {
    return { ok: false, failure: { kind: 'generic' } }
  }
  const data: unknown = await response.json().catch(() => null)
  if (!response.ok) return { ok: false, failure: classifySelectionFailure(response.status, data) }
  const url = typeof data === 'object' && data !== null ? (data as { url?: unknown }).url : undefined
  if (typeof url !== 'string' || !isGoogleAuthorizationUrl(url)) return { ok: false, failure: { kind: 'generic' } }
  return { ok: true, url }
}

/**
 * Settings and the generate action for the channel selection. Generate sends the chosen video
 * ids with the job options; a successful request hands the browser to Google's consent page.
 */
export function useYouTubeGenerate(selectedIds: readonly string[]) {
  const locale = useLocale()
  const [settings, setSettings] = useState<CreateSettings>(DEFAULT_YOUTUBE_SETTINGS)
  const [consented, setConsented] = useState(false)
  const [busy, setBusy] = useState(false)
  const [limitReached, setLimitReached] = useState(false)
  // Read synchronously so a second click before the state update cannot start a second request.
  const inFlight = useRef(false)

  const videoCount = selectedIds.length
  // Auto lets the backend choose the clip count, so the gate prices at least one clip per video.
  const clipsToPrice = settings.clips === AUTO_CLIP_COUNT ? 1 : settings.clips
  const creditCost = clipsToPrice * CREDITS_PER_CLIP * Math.max(videoCount, 1)
  const canGenerate = videoCount > 0 && consented && !limitReached

  const jobOptions = useMemo(() => buildYouTubeJobOptions(settings), [settings])

  /** Resolves to the refusal when the request did not start an import; the caller decides what to show. */
  async function generate(): Promise<SelectionFailure | null> {
    if (inFlight.current || !canGenerate) return null
    inFlight.current = true
    setBusy(true)
    try {
      const outcome = await requestSelectionImport({
        video_ids: [...selectedIds],
        job: jobOptions,
        consent: consented,
        locale
      })
      if (outcome.ok) {
        window.location.assign(outcome.url)
        return null
      }
      if (outcome.failure.kind === 'limit') setLimitReached(true)
      return outcome.failure
    } finally {
      // Released on every path, including a navigation that the browser blocks or delays.
      inFlight.current = false
      setBusy(false)
    }
  }

  return {
    settings,
    setSettings,
    consented,
    setConsented,
    busy,
    limitReached,
    videoCount,
    creditCost,
    canGenerate,
    generate
  }
}
