import { FileText, Upload, Youtube } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useSearchParams } from 'next/navigation'
import { Link, useRouter } from '@/i18n/navigation'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { StoryBuilder } from '@/components/story/story-builder'
import { YouTubeCreationWorkflow } from './youtube-creation-workflow'

type CreationSource = 'upload' | 'youtube'

export function CreationWorkspace() {
  const ro = useLocale() === 'ro'
  const t = useTranslations('create')
  const sections = useTranslations('dashboardSections')
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
    <div className="creation-workspace space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
          {t('title')}
        </h1>
        <Button asChild variant="ghost" size="sm">
          <Link href="/dashboard/script-generator">
            <FileText className="size-4" />
            {sections('writeScript')}
          </Link>
        </Button>
      </header>

      <Card className="gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div className="min-w-0 space-y-1">
          <Label htmlFor="creation-source">
            {ro ? 'Sursa filmărilor' : 'Video source'}
          </Label>
          <p id="creation-source-hint" className="text-sm text-muted-foreground">
            {ro
              ? 'Alege filmări de pe telefon sau calculator, ori un link YouTube.'
              : 'Choose videos from your phone or computer, or a YouTube link.'}
          </p>
        </div>
        <Select
          value={source}
          onValueChange={(value) => {
            if (value === 'upload' || value === 'youtube') selectSource(value)
          }}
        >
          <SelectTrigger
            id="creation-source"
            aria-describedby="creation-source-hint"
            className="min-h-11 w-full shrink-0 bg-background hover:bg-muted focus-visible:ring-2 focus-visible:ring-foreground sm:w-56"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper">
            <SelectItem value="upload">
              <Upload />{ro ? 'Încarcă filmări' : 'Upload videos'}
            </SelectItem>
            <SelectItem value="youtube"><Youtube />YouTube</SelectItem>
          </SelectContent>
        </Select>
      </Card>

      <section hidden={source !== 'upload'} data-testid="creation-upload-workspace">
        <StoryBuilder />
      </section>
      <section hidden={source !== 'youtube'} data-testid="creation-youtube-workspace">
        <YouTubeCreationWorkflow initialBatch={requestedMode === 'batch'} />
      </section>
    </div>
  )
}
