import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import type { YouTubePublishingOptions } from '@/lib/content-calendar'
import { parseYouTubeTags } from '@/lib/youtube-post-settings'
import { useTranslations } from 'next-intl'
import theme from './publishing-theme.module.css'
import { useState } from 'react'

export function YouTubeAdvancedSettings({
  settings,
  onChange,
  idPrefix,
  disabled
}: {
  settings: YouTubePublishingOptions
  onChange: <Key extends keyof YouTubePublishingOptions>(
    key: Key,
    value: YouTubePublishingOptions[Key]
  ) => void
  idPrefix: string
  disabled: boolean
}) {
  const t = useTranslations('youtubePublishing')
  const [tagsText, setTagsText] = useState(() => settings.tags?.join(', ') ?? '')

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-tags`}>{t('tags')}</Label>
        <Input
          id={`${idPrefix}-tags`}
          value={tagsText}
          aria-describedby={`${idPrefix}-tags-hint`}
          onChange={event => {
            setTagsText(event.target.value)
            onChange('tags', parseYouTubeTags(event.target.value))
          }}
        />
        <p id={`${idPrefix}-tags-hint`} className="text-xs text-muted-foreground">
          {t('tagsHint')}
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-license`}>{t('license')}</Label>
        <Select
          disabled={disabled}
          value={settings.license ?? 'youtube'}
          onValueChange={value => onChange('license', value as YouTubePublishingOptions['license'])}
        >
          <SelectTrigger id={`${idPrefix}-license`} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className={theme.surface} data-publish-surface="">
            <SelectItem value="youtube">{t('standardLicense')}</SelectItem>
            <SelectItem value="creativeCommon">{t('creativeCommonsLicense')}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <label className="flex items-start gap-2 text-sm">
        <Switch
          disabled={disabled}
          checked={settings.embeddable ?? true}
          onCheckedChange={checked => onChange('embeddable', checked)}
        />
        {t('embeddable')}
      </label>
    </div>
  )
}
