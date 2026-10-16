'use client'

import { Plus } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { AssistantChat } from '@/components/assistant/assistant-chat'
import { AIEditingDirection } from '@/components/create/ai-editing-direction'
import { ConfigurationPreview } from '@/components/create/configuration-preview'
import { SettingsPanel } from '@/components/create/settings-panel'
import { SourceBatch } from '@/components/create/source-batch'
import { SourceYoutube } from '@/components/create/source-youtube'
import { SummaryCard } from '@/components/create/summary-card'
import { useYoutubeCreation } from '@/components/create/use-youtube-creation'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

function StepHeading({ number, title }: { number: number; title: string }) {
  return (
    <div className="creation-step flex items-center gap-3">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-sm bg-muted text-[11px] font-bold tabular-nums text-foreground">
        {number}
      </span>
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
    </div>
  )
}

interface YouTubeCreationWorkflowProps {
  initialBatch?: boolean
}

export function YouTubeCreationWorkflow({
  initialBatch = false
}: YouTubeCreationWorkflowProps) {
  const t = useTranslations('create')
  const tAssistant = useTranslations('assistant')
  const workflow = useYoutubeCreation(initialBatch)

  return (
    <div className="creation-workbench">
      <Card
        as="section"
        className="creation-source block gap-0 overflow-hidden py-0 xl:col-start-1 xl:row-start-1"
      >
        <div className="creation-panel-bar">
          <StepHeading number={1} title={t('stepSource')} />
          <span className="creation-source-label">YouTube</span>
        </div>
        <div className="space-y-4 p-4 sm:p-6">
          {workflow.isBatch ? (
            <SourceBatch urls={workflow.urls} onChange={workflow.setUrls} />
          ) : (
            <>
              <SourceYoutube
                url={workflow.urls[0] ?? ''}
                onChange={(url) => workflow.setUrls([url])}
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => workflow.setUrls((urls) => [...urls, ''])}
              >
                <Plus className="size-4" aria-hidden="true" />
                {t('addUrl')}
              </Button>
            </>
          )}
        </div>
      </Card>

      <aside className="creation-inspector">
        <section className="creation-inspector-card">
          <div className="creation-panel-bar">
            <StepHeading number={2} title={t('stepDirection')} />
          </div>
          <AIEditingDirection
            value={workflow.aiInstructions}
            onChange={workflow.setAiInstructions}
          />
        </section>
        <section className="creation-inspector-card creation-style-card">
          <div className="creation-panel-bar">
            <StepHeading number={3} title={t('stepStyle')} />
          </div>
          <SettingsPanel
            settings={workflow.settings}
            onChange={workflow.setSettings}
          />
        </section>
        <section className="creation-inspector-card">
          <div className="creation-panel-bar">
            <StepHeading number={4} title={t('stepGenerate')} />
          </div>
          <SummaryCard
            videoCount={workflow.videoCount}
            creditCost={workflow.creditCost}
            canGenerate={workflow.canGenerate}
            busy={workflow.busy}
            isBatch={workflow.isBatch}
            onGenerate={() => void workflow.createJob()}
          />
        </section>
      </aside>

      <section className="creation-assistant xl:col-start-1 xl:row-start-2">
        <AssistantChat
          context="create"
          emptyPreview={<ConfigurationPreview settings={workflow.settings} />}
          getState={() => ({
            clips: workflow.settings.clips,
            aspect_ratio: workflow.settings.aspectRatio,
            subtitle_style: workflow.settings.subtitleStyle,
            include_brand: workflow.settings.includeBrand,
            language: workflow.settings.language || null,
            smart_crop: workflow.settings.smartCrop,
            audio_cleanup: {
              enabled: workflow.settings.reduceBackgroundNoise ?? false
            },
            instructions: workflow.aiInstructions.trim() || null
          })}
          onActions={workflow.handleAssistantActions}
          suggestions={[
            tAssistant('suggestCreate1'),
            tAssistant('suggestCreate2'),
            tAssistant('suggestCreate3')
          ]}
        />
      </section>
    </div>
  )
}
