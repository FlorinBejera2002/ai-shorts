import type { CalendarMutationStatus, ContentPlatform, PublishingMedia } from '@/lib/content-calendar'

export type PostComposerForm = {
  title: string
  caption: string
  notes: string
  platforms: ContentPlatform[]
  accountIds: string[]
  status: CalendarMutationStatus
  date: string
  time: string
  clipId: string
  media: PublishingMedia[]
}

export type PostComposerErrors = Partial<Record<
  keyof PostComposerForm | 'form' | 'tiktok' | 'instagram' | 'facebook' | 'youtube',
  string
>>
