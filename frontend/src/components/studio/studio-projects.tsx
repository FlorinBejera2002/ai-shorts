'use client'

import { Button } from '@/components/ui/button'
import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'
import { LoadingIndicator } from '@/components/ui/loading-indicator'
import { StudioLibrary } from './studio-library'
import { StudioWorkspace } from './studio-workspace'
import { useStudioWorkspace } from './use-studio-workspace'

export function StudioProjects({ initialClipId, initialProjectId }: { initialClipId?: string; initialProjectId?: string }) {
  const studio = useStudioWorkspace(initialClipId, initialProjectId)
  const t = useTranslations('studioWorkspace')
  const [libraryOpen, setLibraryOpen] = useState(true)
  if (!studio.origin) return <p role="status">{t('unavailable')}</p>
  if (!studio.active)
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4">
        {!studio.error && <LoadingIndicator className="size-6" />}
        <p role={studio.error ? 'alert' : 'status'}>{studio.error || t('opening')}</p>
        {studio.error && (
          <Button variant="outline" onClick={studio.reconnect}>
            {t('reconnect')}
          </Button>
        )}
        <Button asChild variant="ghost">
          <Link href="/dashboard/studio">{t('backToLibrary')}</Link>
        </Button>
      </div>
    )
  return (
    <StudioWorkspace
      key={studio.active.id}
      origin={studio.origin}
      project={studio.active}
      onBack={() => setLibraryOpen((value) => !value)}
      onReconnect={studio.reconnect}
      libraryOpen={libraryOpen}
      notice={studio.busy ? t(studio.busy === 'reconnect' ? 'opening' : 'preparing') : ''}
      error={studio.error}
      library={
        libraryOpen ? (
          <StudioLibrary
            projects={studio.projects}
            activeId={studio.active.id}
            busy={studio.busy}
            onSelect={studio.select}
            onOpen={(id, title) => {
              void studio.open(id, title)
            }}
          />
        ) : null
      }
    />
  )
}
