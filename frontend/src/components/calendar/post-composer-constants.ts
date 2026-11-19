import type { CalendarMutationStatus, ContentPlatform } from '@/lib/content-calendar'

/** Platform order used across the composer: Instagram, Facebook, TikTok, YouTube. */
export const providerOrder: ContentPlatform[] = ['instagram', 'facebook', 'tiktok', 'youtube']
export const modes: CalendarMutationStatus[] = ['draft', 'scheduled', 'publish']
export const commonZones = ['Europe/Bucharest', 'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'America/New_York', 'America/Los_Angeles', 'Asia/Dubai', 'Asia/Tokyo', 'UTC']
