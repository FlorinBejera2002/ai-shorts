import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  DEFAULT_CAPTION_STYLE,
  legacyCaptionStyle
} from '@/components/dashboard/brand/caption-style'
import type { BrandKit } from '@/components/dashboard/brand/types'
import { authClient } from '@/lib/auth'
import { storyRequest } from './api'
import { storyCaptionMode, type StoryOptions } from './types'

export function useStoryAppearance(options: StoryOptions) {
  const [open, setOpen] = useState(false)
  const userID = authClient.getSnapshot().user?.id
  const kit = useQuery({
    queryKey: ['story-brand-preview', userID],
    queryFn: () => storyRequest<{ brandKit: BrandKit }>('/api/user/brand'),
    enabled: Boolean(options.use_brand_kit && open),
    staleTime: 30000
  })
  const style =
    options.use_brand_kit && kit.data?.brandKit
      ? legacyCaptionStyle(kit.data.brandKit)
      : (options.caption_style ?? DEFAULT_CAPTION_STYLE)
  const ratio: '9:16' | '1:1' | '16:9' =
    options.aspect_ratio === '1:1' || options.aspect_ratio === '16:9'
      ? options.aspect_ratio
      : '9:16'

  return {
    open,
    setOpen,
    visible: open && storyCaptionMode(options) !== 'off',
    kit,
    style,
    ratio
  }
}

export type StoryAppearanceState = ReturnType<typeof useStoryAppearance>
