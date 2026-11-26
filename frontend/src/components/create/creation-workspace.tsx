import { useState } from 'react'
import { Upload, Youtube, type LucideIcon } from 'lucide-react'
import { pickInlineText } from '@/i18n/inline-text'
import { useLocale, useTranslations } from 'next-intl'
import { useSearchParams } from 'next/navigation'
import { useRouter } from '@/i18n/navigation'
import theme from '@/components/calendar/publishing-theme.module.css'
import { StoryBuilder } from '@/components/story/story-builder'
import { CreationStepper } from '@/components/story/create-stepper'
import {
  CreationStepperContext,
  type CreationStepperModel
} from '@/components/story/create-stepper-state'
import { YouTubeAccountPill } from './youtube-account-pill'
import { YouTubeCreationWorkflow } from './youtube-creation-workflow'
import './creation-workspace.css'

type CreationSource = 'upload' | 'youtube'

const sourceOptions = [
  { value: 'upload', Icon: Upload },
  { value: 'youtube', Icon: Youtube }
] as const satisfies ReadonlyArray<{ value: CreationSource; Icon: LucideIcon }>

function SourceSwitch({
  source,
  onSelect
}: {
  source: CreationSource
  onSelect: (value: CreationSource) => void
}) {
  const locale = useLocale()
  const labels: Record<CreationSource, string> = {
    upload: pickInlineText(locale, 'Upload videos', 'Încarcă filmări', 'Subir videos'),
    youtube: 'YouTube'
  }
  return (
    <div
      id="creation-source"
      role="radiogroup"
      aria-label={pickInlineText(locale, 'Video source', 'Sursa filmărilor', 'Fuente del video')}
      className="creation-source-switch"
    >
      {sourceOptions.map(({ value, Icon }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={source === value}
          data-creation-source={value}
          onClick={() => {
            if (source !== value) onSelect(value)
          }}
        >
          <Icon aria-hidden="true" />
          {labels[value]}
        </button>
      ))}
    </div>
  )
}

export function CreationWorkspace() {
  const t = useTranslations('create')
  const params = useSearchParams()
  const router = useRouter()
  const [stepper, setStepper] = useState<CreationStepperModel | null>(null)
  const requestedMode = params.get('mode')
  const requestedStory = params.get('story')
  // The Home shortcut "From my YouTube account" (?source=library) opens the YouTube path too.
  const opensYouTube = requestedMode === 'youtube' || params.get('source') === 'library'
  const source: CreationSource = !requestedStory && opensYouTube ? 'youtube' : 'upload'

  function selectSource(value: CreationSource) {
    const query = new URLSearchParams(params.toString())
    query.set('mode', value)
    if (value === 'youtube') query.delete('story')
    router.replace(`/dashboard/create?${query.toString()}`)
  }

  return (
    <CreationStepperContext.Provider value={setStepper}>
      <div
        className={`${theme.surface} creation-workspace`}
        data-reference-surface=""
      >
        <header className="creation-toolbar">
          {/* The page title lives in the dashboard header; keep it for screen readers only. */}
          <h1 className="sr-only">{t('title')}</h1>
          <div className="creation-toolbar-controls">
            <SourceSwitch source={source} onSelect={selectSource} />
            {source === 'upload' && stepper && <CreationStepper {...stepper} />}
            {source === 'youtube' && <YouTubeAccountPill className="creation-account-pill" />}
          </div>
        </header>

        <section hidden={source !== 'upload'} data-testid="creation-upload-workspace">
          <StoryBuilder />
        </section>
        <section hidden={source !== 'youtube'} data-testid="creation-youtube-workspace">
          <YouTubeCreationWorkflow active={source === 'youtube'} />
        </section>
      </div>
    </CreationStepperContext.Provider>
  )
}
