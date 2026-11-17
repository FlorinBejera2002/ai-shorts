import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { PublishingMedia } from '@/lib/content-calendar'
import type { TikTokDirectPostSettings } from '@/lib/tiktok-direct-post'
import { useTranslations } from 'next-intl'
import theme from './publishing-theme.module.css'

export function TikTokCoverSettings({
  idPrefix,
  media,
  isPhotoPost,
  disabled,
  maxDuration,
  settings,
  onChange
}: {
  idPrefix: string
  media: PublishingMedia[]
  isPhotoPost: boolean
  disabled: boolean
  maxDuration?: number
  settings: TikTokDirectPostSettings
  onChange: <Key extends keyof TikTokDirectPostSettings>(key: Key, value: TikTokDirectPostSettings[Key]) => void
}) {
  const t = useTranslations('publishing')
  const id = `${idPrefix}-cover`

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>
        {t(isPhotoPost ? 'tiktokPhotoCover' : 'tiktokVideoCover')}
      </Label>
      {isPhotoPost ? (
        <Select
          disabled={disabled}
          value={String(settings.photoCoverIndex)}
          onValueChange={value => onChange('photoCoverIndex', Number(value))}
        >
          <SelectTrigger id={id} className="w-full" aria-describedby={`${id}-hint`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent className={theme.surface} data-publish-surface="">
            {media.map((item, index) => (
              <SelectItem key={item.reference} value={String(index)}>
                {index + 1}. {item.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <Input
          id={id}
          type="number"
          min="0"
          max={maxDuration && maxDuration > 0 ? maxDuration : undefined}
          step="0.001"
          value={settings.videoCoverSeconds}
          disabled={disabled}
          aria-describedby={`${id}-hint`}
          onChange={event => onChange('videoCoverSeconds', event.target.value)}
        />
      )}
      <p id={`${id}-hint`} className="text-xs text-muted-foreground">
        {t(isPhotoPost ? 'tiktokPhotoCoverHint' : 'tiktokVideoCoverHint')}
      </p>
    </div>
  )
}
