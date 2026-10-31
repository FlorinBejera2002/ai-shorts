'use client'

import { Plus } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { AIEditingDirection } from './ai-editing-direction'
import { CreationAssistant } from './creation-assistant'
import { SettingsPanel } from './settings-panel'
import { SourceBatch } from './source-batch'
import { SourceYoutube } from './source-youtube'
import { SummaryCard } from './summary-card'
import { useYoutubeCreation } from './use-youtube-creation'
import { Button } from '@/components/ui/button'

interface YouTubeCreationWorkflowProps {
  initialBatch?: boolean
}

export function YouTubeCreationWorkflow({
  initialBatch = false
}: YouTubeCreationWorkflowProps) {
  const t = useTranslations('create')
  const workflow = useYoutubeCreation(initialBatch)

  return (
    <div className="creation-workbench">
      <section className="creation-source" data-testid="creation-source-media">
        {workflow.isBatch ? (
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
