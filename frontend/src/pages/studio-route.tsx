import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { LoadingIndicator } from '@/components/ui/loading-indicator'
import { Link } from '@/i18n/navigation'
import { RotateCcw } from 'lucide-react'
import theme from '@/components/calendar/publishing-theme.module.css'
import { ThemeBrandLogo } from '@/components/shared/brand-logo'
import { authClient } from '@/lib/auth'
import {
  createStudioClient,
  prepareStudioWorkspace,
  readStudioPreferences
} from '@/components/studio/studio-client'
import { configuredStudioOrigin } from '@/components/studio/studio-config'

const origin = configuredStudioOrigin(
  process.env.NEXT_PUBLIC_STUDIO_URL,
  process.env.NODE_ENV === 'production'
)

/** Compatibility URLs establish the session, then open the only Studio. */
export function StudioRoute() {
  const { id } = useParams<{ id: string }>()
  const [search] = useSearchParams()
  const clipId = id ?? search.get('clip') ?? undefined
  const projectId = search.get('project') ?? undefined
  return (
    <StudioLauncher
      key={`${clipId ?? ''}:${projectId ?? ''}`}
      clipId={clipId}
      projectId={projectId}
    />
  )
}

function StudioLauncher({
  clipId,
  projectId
}: {
  clipId?: string
  projectId?: string
}) {
  const t = useTranslations('studioEditor')
  const [attempt, setAttempt] = useState(0)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!origin) return
    const controller = new AbortController()
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(150000)])
    const client = createStudioClient(origin, authClient)
    void prepareStudioWorkspace(client, { clipId, projectId }, signal, readStudioPreferences())
      .then((url) => {
        if (!signal.aborted) window.location.replace(url)
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true)
      })
    return () => controller.abort()
  }, [clipId, projectId, attempt])

  const state = !origin ? 'unavailable' : failed ? 'failed' : 'opening'
  const illustration = {
    opening: '/illustrations/studio-opening.webp',
    failed: '/illustrations/studio-preview-error.webp',
    unavailable: '/illustrations/studio-offline.webp'
  }[state]

  // St-Shell-Unavailable / St-Shell-OpenFailed: a 560px card on the canvas with the logo, the
  // Ana și Radu illustration, one title and pill actions.
  return (
    <div
      className={`${theme.surface} flex min-h-[70vh] w-full items-center justify-center p-4`}
      data-reference-surface=""
      data-studio-launcher={state}
    >
      <section className="flex w-[560px] max-w-full flex-col items-center gap-5 rounded-[24px] bg-card px-6 py-8 text-center text-card-foreground shadow-[0_10px_40px_rgba(21,32,53,0.08)]">
        <ThemeBrandLogo size="sm" />
        <img
          src={illustration}
          alt=""
          aria-hidden="true"
          width={160}
          height={160}
          className="size-40 object-contain"
        />
        <h1
          role={state === 'opening' ? 'status' : 'alert'}
          className="max-w-[320px] text-lg font-semibold leading-snug [text-wrap:balance]"
        >
          {t(state === 'unavailable' ? 'unavailable' : state === 'failed' ? 'openError' : 'opening')}
        </h1>
        <div className="flex flex-wrap justify-center gap-2">
          {state === 'opening' && <LoadingIndicator className="size-6" />}
          {state !== 'opening' && (
            <Button asChild variant="outline" className="h-11 rounded-full px-5">
              <Link href="/dashboard/clips">{t('backToClips')}</Link>
            </Button>
          )}
          {state === 'failed' && (
            <Button
              className="h-11 rounded-full px-5"
              onClick={() => {
                setFailed(false)
                setAttempt((value) => value + 1)
              }}
            >
              <RotateCcw aria-hidden="true" />
              {t('retry')}
            </Button>
          )}
        </div>
      </section>
    </div>
  )
}
