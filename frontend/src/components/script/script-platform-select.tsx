import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { isPublishingProvider } from '@/lib/publishing'

const PLATFORMS = [
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
    <div>
      <Label htmlFor="script-platform">{label}</Label>
      <NativeSelect
        id="script-platform"
        value={supported ? value : ''}
        onChange={(event) => onValueChange(event.target.value)}
        className="mt-2 w-full"
      >
        {!supported && (
          <option value="" disabled>{placeholder}</option>
        )}
        {PLATFORMS.map((platform) => (
          <option key={platform.value} value={platform.value}>
            {platform.label}
          </option>
        ))}
      </NativeSelect>
    </div>
  )
}
