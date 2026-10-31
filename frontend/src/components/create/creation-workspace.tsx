import { Upload, Youtube } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useSearchParams } from 'next/navigation'
import { useRouter } from '@/i18n/navigation'
import theme from '@/components/calendar/publishing-theme.module.css'
import { StoryBuilder } from '@/components/story/story-builder'
import { YouTubeCreationWorkflow } from './youtube-creation-workflow'

type CreationSource = 'upload' | 'youtube'

export function CreationWorkspace() {
  const ro = useLocale() === 'ro'
  const t = useTranslations('create')
  const params = useSearchParams()
  const router = useRouter()
  const requestedMode = params.get('mode')
  const requestedStory = params.get('story')
  const source: CreationSource =
    !requestedStory && (requestedMode === 'youtube' || requestedMode === 'batch')
      ? 'youtube'
      : 'upload'

  function selectSource(value: CreationSource) {
    const query = new URLSearchParams(params.toString())
    query.set('mode', value)
    if (value === 'youtube') query.delete('story')
    router.replace(`/dashboard/create?${query.toString()}`)
  }

  return (
    <div
      className={`${theme.surface} creation-workspace space-y-6`}
      data-reference-surface=""
    >
      <header className="creation-workspace-header">
        <h1>
          {t('title')}
        </h1>
        <div className="creation-source-switcher">
          <div
            id="creation-source"
            role="radiogroup"
            aria-label={ro ? 'Sursa filmărilor' : 'Video source'}
            className="creation-source-segment"
          >
            {(
              [
                ['upload', Upload, ro ? 'Încarcă filmări' : 'Upload videos'],
                ['youtube', Youtube, 'YouTube']
              ] as const
            ).map(([value, Icon, label]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={source === value}
                data-creation-source={value}
                onClick={() => {
                  if (source !== value) selectSource(value)
                }}
              >
                <Icon aria-hidden="true" />
                {label}
              </button>
            ))}
          </div>
        </div>
      </header>

      <section hidden={source !== 'upload'} data-testid="creation-upload-workspace">
        <StoryBuilder />
      </section>
      <section hidden={source !== 'youtube'} data-testid="creation-youtube-workspace">
        <YouTubeCreationWorkflow initialBatch={requestedMode === 'batch'} />
      </section>
    </div>
  )
}
