import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { LoadingIndicator } from '@/components/ui/loading-indicator'
import { Link } from '@/i18n/navigation'
import { authClient } from '@/lib/auth'
import {
  createStudioClient,
  prepareStudioWorkspace
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
    void prepareStudioWorkspace(client, { clipId, projectId }, signal)
      .then((url) => {
        if (!signal.aborted) window.location.replace(url)
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true)
      })
    return () => controller.abort()
  }, [clipId, projectId, attempt])

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4">
      {origin && !failed && <LoadingIndicator className="size-6" />}
      <p role={!origin || failed ? 'alert' : 'status'}>
        {t(!origin ? 'unavailable' : failed ? 'openError' : 'opening')}
      </p>
      {failed && (
        <Button
          onClick={() => {
            setFailed(false)
            setAttempt((value) => value + 1)
          }}
        >
          {t('retry')}
        </Button>
      )}
      <Button asChild variant="outline">
        <Link href="/dashboard/clips">{t('backToClips')}</Link>
      </Button>
    </div>
  )
}
