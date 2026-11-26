'use client'

import { useQueryClient } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { useToast } from '@/components/ui/toast'
import { SettingsPanel } from './settings-panel'
import { SummaryCard } from './summary-card'
import { SourceYouTubeLibrary } from './source-youtube-library'
import { YouTubeAccessState } from './youtube-access-state'
import { YouTubeImportProgress } from './youtube-import-progress'
import { useYouTubeImportReturn } from './use-youtube-imports'
import { useYouTubeGenerate } from './use-youtube-creation'
import { MAX_SELECTED_VIDEOS, toggleVideoSelection } from './youtube-creation-model'
import type { SelectionFailure } from './youtube-import-model'
import { YouTubeSourceCard } from './youtube-source-card'
import { YouTubeLinkWorkflow } from './youtube-link-workflow'
import { useYouTubeChannel, useYouTubeChannelReturn, useYouTubeLibrary, type YouTubeChannelVideo } from './use-youtube-channel'
import './youtube-path.css'

interface YouTubeCreationWorkflowProps {
  active?: boolean
}

/** Message key under `create.youtubeImport.errors` for each refusal that shows a toast. */
const FAILURE_MESSAGE_KEYS = {
  generic: 'generic',
  forbidden: 'forbidden',
  'rate-limited': 'rateLimited',
  unavailable: 'unavailable',
  'invalid-selection': 'invalidSelection',
  'invalid-options': 'invalidOptions',
  'invalid-request': 'invalidRequest',
  'invalid-videos': 'invalidVideos',
  connect: 'connectAgain',
  active: 'active'
} as const satisfies Record<Exclude<SelectionFailure['kind'], 'limit'>, string>

/** Keep both source forms mounted so switching preserves their input and settings. */
export function YouTubeCreationWorkflow({ active = true }: YouTubeCreationWorkflowProps) {
  const t = useTranslations('create.youtubeLink')
  const [source, setSource] = useState<'channel' | 'link'>('channel')
  return (
    <div className="yt-source-path">
      <div className="yt-source-switch" role="group" aria-label={t('sourceLabel')}>
        <button type="button" aria-pressed={source === 'channel'} onClick={() => setSource('channel')}>{t('channel')}</button>
        <button type="button" aria-pressed={source === 'link'} onClick={() => setSource('link')}>{t('pasteLink')}</button>
      </div>
      <div hidden={source !== 'channel'}><YouTubeChannelWorkflow active={active && source === 'channel'} /></div>
      <div hidden={source !== 'link'}><YouTubeLinkWorkflow active={active && source === 'link'} /></div>
    </div>
  )
}

/** Connected-channel library and Google export consent retain their existing flow. */
function YouTubeChannelWorkflow({ active = true }: YouTubeCreationWorkflowProps) {
  const t = useTranslations('create')
  const tImport = useTranslations('create.youtubeImport')
  const toast = useToast((state) => state.add)
  const queryClient = useQueryClient()
  const channel = useYouTubeChannel(active)
  useYouTubeChannelReturn()
  const importReturn = useYouTubeImportReturn()

  const [selectedIds, setSelectedIds] = useState<string[]>([])
  // Videos the backend refused, with the visibility they had at that moment. A refusal lifts once the
  // list shows a different visibility for the video, for example after it was changed on YouTube.
  const [refusedVideos, setRefusedVideos] = useState<ReadonlyMap<string, string>>(() => new Map())
  // Set when a generate attempt finds an import already running; the card then shows its progress.
  const [activeImportOpen, setActiveImportOpen] = useState(false)

  const connected = channel.status.enabled && channel.status.connected
  const progressVisible = connected && (importReturn.success || activeImportOpen)
  const library = useYouTubeLibrary(connected && !progressVisible)
  const generate = useYouTubeGenerate(selectedIds)

  function toggleVideo(video: YouTubeChannelVideo) {
    setSelectedIds((current) => toggleVideoSelection(current, video.id))
  }

  function chooseAnother() {
    setActiveImportOpen(false)
    importReturn.dismiss()
  }

  function markRefused(videoIds: readonly string[]) {
    const visibilityById = new Map(library.videos.map((video) => [video.id, video.visibility]))
    setRefusedVideos((current) => {
      const next = new Map(current)
      for (const id of videoIds) next.set(id, visibilityById.get(id) ?? '')
      return next
    })
    const refused = new Set(videoIds)
    setSelectedIds((current) => current.filter((id) => !refused.has(id)))
  }

  async function handleGenerate() {
    const failure = await generate.generate()
    if (!failure || failure.kind === 'limit') return
    if (failure.kind === 'invalid-videos') markRefused(failure.videoIds)
    if (failure.kind === 'connect') void queryClient.invalidateQueries({ queryKey: ['youtube-channel'] })
    if (failure.kind === 'active') {
      setActiveImportOpen(true)
      void queryClient.invalidateQueries({ queryKey: ['youtube-imports'] })
    }
    toast('error', tImport(`errors.${FAILURE_MESSAGE_KEYS[failure.kind]}`))
  }

  // Canvas "Conectează contul YouTube": until a channel is connected the connect gate is the whole card.
  if (!connected) {
    return (
      <div className="yt-path yt-path--gate">
        <YouTubeAccessState channel={channel} onConnect={channel.connect} />
      </div>
    )
  }

  if (progressVisible) {
    // The progress card sits inside the YouTube path root so the scoped button and colour tokens apply.
    return (
      <div className="yt-path yt-path--gate">
        <YouTubeImportProgress onChooseAnother={chooseAnother} />
      </div>
    )
  }

  return (
    <div className="yt-path">
      <div className="yt-path__main">
        <YouTubeSourceCard
          title={t('sourceCardTitle')}
          aside={t('youtubeLibrary.selectedCount', { count: selectedIds.length, max: MAX_SELECTED_VIDEOS })}
        >
          <SourceYouTubeLibrary
            library={library}
            selectedIds={selectedIds}
            refusedVideos={refusedVideos}
            selectionFull={selectedIds.length >= MAX_SELECTED_VIDEOS}
            onToggle={toggleVideo}
          />
        </YouTubeSourceCard>
      </div>
      <aside className="yt-inspector" data-testid="creation-settings-inspector">
        <SettingsPanel settings={generate.settings} onChange={generate.setSettings} />
        <SummaryCard
          videoCount={generate.videoCount}
          creditCost={generate.creditCost}
          consented={generate.consented}
          onConsentChange={generate.setConsented}
          canGenerate={generate.canGenerate}
          busy={generate.busy}
          limitReached={generate.limitReached}
          onGenerate={() => void handleGenerate()}
        />
      </aside>
    </div>
  )
}
