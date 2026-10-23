'use client'

import { PlatformBrandIcon } from '@/components/publishing/platform-brand-icon'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { isPublishingProvider, type PublishingProvider } from '@/lib/publishing'
import styles from './script-platform-select.module.css'

const PLATFORMS: { value: PublishingProvider; label: string }[] = [
  { value: 'tiktok', label: 'TikTok' },
  { value: 'instagram', label: 'Instagram Reels' },
  { value: 'facebook', label: 'Facebook' },
  { value: 'youtube', label: 'YouTube Shorts' }
]

type ScriptPlatformSelectProps = {
  value: string
  onValueChange: (value: string) => void
  label: string
  placeholder: string
}

export function ScriptPlatformSelect({
  value,
  onValueChange,
  label,
  placeholder
}: ScriptPlatformSelectProps) {
  const supported = isPublishingProvider(value)

  return (
    <div className={styles.field}>
      <Label htmlFor="script-platform" className={styles.label}>
        {label}
      </Label>
      <Select
        value={supported ? value : ''}
        onValueChange={onValueChange}
        required
      >
        <SelectTrigger id="script-platform" className={styles.trigger}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent position="popper" className={styles.content}>
          {PLATFORMS.map((platform) => (
            <SelectItem
              key={platform.value}
              value={platform.value}
              textValue={platform.label}
              className={styles.item}
            >
              <PlatformBrandIcon
                provider={platform.value}
                className={styles.icon}
              />
              {platform.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
