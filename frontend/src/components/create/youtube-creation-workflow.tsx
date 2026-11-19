'use client'

import { Plus } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useSearchParams } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { AIEditingDirection } from './ai-editing-direction'
import { CreationAssistant } from './creation-assistant'
import { SettingsPanel } from './settings-panel'
import { SourceBatch } from './source-batch'
import { SourceYoutube } from './source-youtube'
import { SourceYouTubeLibrary } from './source-youtube-library'
import { SummaryCard } from './summary-card'
import { useYoutubeCreation } from './use-youtube-creation'
import { useYouTubeImport } from './use-youtube-import'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import { useRouter } from '@/i18n/navigation'
import { extractYouTubeId } from '@/lib/youtube'

interface YouTubeCreationWorkflowProps {
  initialBatch?: boolean
  active?: boolean
}

export function YouTubeCreationWorkflow({
  initialBatch = false,
  active = true
}: YouTubeCreationWorkflowProps) {
  const t = useTranslations('create')
  const params = useSearchParams()
  const router = useRouter()
  const addToast = useToast((state) => state.add)
  const handledReturn = useRef<string | null>(null)
  const [source, setSource] = useState<'link' | 'library'>(() =>
    params.has('youtubeImport') || params.get('source') === 'library' ? 'library' : 'link'
  )
  const library = useYouTubeImport(active && source === 'library')
  // A link pasted on the dashboard arrives as ?url=… and prefills the single-link field.
  const prefilledUrl = params.get('url')
  const workflow = useYoutubeCreation(
    initialBatch,
    source === 'library'
      ? { type: 'upload', storageKey: library.selectedVideo?.source_storage_key ?? null }
      : { type: 'youtube' },
    prefilledUrl && extractYouTubeId(prefilledUrl) ? prefilledUrl : null
  )
  const importReturn = params.get('youtubeImport')

  useEffect(() => {
    if (!importReturn || handledReturn.current === importReturn) return
    handledReturn.current = importReturn
    addToast(
      importReturn === 'success' ? 'success' : 'error',
      t(importReturn === 'success' ? 'youtubeImport.authorized' : 'youtubeImport.authorizationFailed')
    )
    const query = new URLSearchParams(params.toString())
    query.delete('youtubeImport')
    router.replace(`/dashboard/create?${query.toString()}`, { scroll: false })
  }, [addToast, importReturn, params, router, t])

  return (
    <div className="creation-workbench">
      <section className="creation-source" data-testid="creation-source-media">
        <div className="youtube-import-source-switch" role="radiogroup" aria-label={t('youtubeImport.sourceLabel')}>
          {(['link', 'library'] as const).map((value) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={source === value}
              onClick={() => setSource(value)}
            >
              {t(value === 'link' ? 'youtubeImport.linkSource' : 'youtubeImport.librarySource')}
            </button>
          ))}
        </div>
        <div hidden={source !== 'link'}>
          {initialBatch || workflow.urls.length > 1 ? (
            <SourceBatch urls={workflow.urls} onChange={workflow.setUrls} />
          ) : (
            <SourceYoutube
              url={workflow.urls[0] ?? ''}
              onChange={(url) => workflow.setUrls([url])}
              actions={
                <Button
                  type="button"
                  variant="ghost"
                  className="creation-add-url"
                  onClick={() => workflow.setUrls((urls) => [...urls, ''])}
                >
                  <Plus className="size-4" aria-hidden="true" />
                  {t('addUrl')}
                </Button>
              }
            />
          )}
        </div>
        <div hidden={source !== 'library'}>
          <SourceYouTubeLibrary library={library} />
        </div>
      </section>
      <aside className="creation-inspector" data-testid="creation-settings-inspector">
        <SettingsPanel settings={workflow.settings} onChange={workflow.setSettings} />
      </aside>
      <div className="creation-direction" data-testid="creation-direction">
        <AIEditingDirection
          value={workflow.aiInstructions}
          onChange={workflow.setAiInstructions}
          action={
            <CreationAssistant
              settings={workflow.settings}
              instructions={workflow.aiInstructions}
              onActions={workflow.handleAssistantActions}
            />
          }
        />
      </div>
      <div className="creation-submit">
        <SummaryCard
          videoCount={workflow.videoCount}
          creditCost={workflow.creditCost}
          canGenerate={workflow.canGenerate}
          busy={workflow.busy}
          isBatch={workflow.isBatch}
          onGenerate={() => void workflow.createJob()}
        />
      </div>
    </div>
  )
}
