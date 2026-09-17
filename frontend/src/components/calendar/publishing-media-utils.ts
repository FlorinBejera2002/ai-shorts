import type { ContentPlatform, PublishingMedia } from '@/lib/content-calendar'

export const MAX_PUBLISHING_MEDIA = 35
export const PUBLISHING_FILE_ACCEPT =
  '.jpg,.jpeg,.png,.webp,.mp4,.mov,.webm,.avi,.mkv,image/jpeg,image/png,image/webp,video/*'

// Some mobile file providers omit MIME types. The server verifies the bytes.
export function publishingFileType(file: Pick<File, 'name'>) {
  const extension = file.name.split('.').pop()?.toLowerCase()
  if (['jpg', 'jpeg', 'png', 'webp'].includes(extension ?? '')) return 'image'
  if (['mp4', 'mov', 'webm', 'avi', 'mkv'].includes(extension ?? ''))
    return 'video'
  return null
}

export function movePublishingMedia(
  media: PublishingMedia[],
  reference: string,
  targetIndex: number
): PublishingMedia[] {
  const sourceIndex = media.findIndex((item) => item.reference === reference)
  if (
    sourceIndex < 0 ||
    targetIndex < 0 ||
    targetIndex >= media.length ||
    sourceIndex === targetIndex
  )
    return media
  const reordered = [...media]
  const [moved] = reordered.splice(sourceIndex, 1)
  if (!moved) return media
  reordered.splice(targetIndex, 0, moved)
  return reordered
}

export function incompatibleMediaPlatforms(
  media: PublishingMedia[],
  platforms: ContentPlatform[]
) {
  if (media.length === 0) return []
  return platforms.filter((platform) => {
    if (platform === 'instagram') return media.length > 10
    if (platform === 'facebook')
      return (
        media.length > 10 ||
        (media.length > 1 && media.some((item) => item.type === 'video'))
      )
    if (platform === 'tiktok')
      return !(
        (media.length <= 35 && media.every((item) => item.type === 'image')) ||
        (media.length === 1 &&
          media[0]?.type === 'video' &&
          /\.(mp4|mov|webm)$/i.test(media[0].name))
      )
    return media.length !== 1 || media[0]?.type !== 'video'
  })
}

export function unsupportedMetaVideos(
  media: PublishingMedia[],
  platforms: ContentPlatform[]
) {
  if (
    !platforms.some(
      (platform) => platform === 'instagram' || platform === 'facebook'
    )
  )
    return []
  return media
    .filter((item) => item.type === 'video' && !/\.(mp4|mov)$/i.test(item.name))
    .map((item) => item.name)
}

export class PublishingUploadError extends Error {
  constructor(readonly status: number) {
    super(`publishing upload failed (${status})`)
  }
}

export function publishingUploadErrorKey(cause: unknown) {
  const status = cause instanceof PublishingUploadError ? cause.status : 0
  if (status === 413) return 'mediaTooLarge'
  if (status === 400 || status === 415 || status === 422)
    return 'mediaUnsupported'
  if (status === 429) return 'mediaRateLimit'
  if (status === 401) return 'mediaAuthRequired'
  // A missing route or server failure is unrelated to the selected file.
  if (status === 404 || status === 405 || status >= 500)
    return 'mediaTemporarilyUnavailable'
  return 'mediaUploadFailed'
}

export async function uploadPublishingFile(
  file: File,
  request: (url: string, init?: RequestInit) => Promise<Response>,
  signal: AbortSignal
): Promise<PublishingMedia> {
  const body = new FormData()
  body.append('file', file)
  const response = await request('/api/publishing/media', {
    method: 'POST',
    body,
    signal
  })
  if (!response.ok) throw new PublishingUploadError(response.status)
  const uploaded = (await response.json()) as PublishingMedia
  if (
    !uploaded.reference ||
    !uploaded.name ||
    !['image', 'video'].includes(uploaded.type)
  ) {
    throw new PublishingUploadError(502)
  }
  return {
    type: uploaded.type,
    reference: uploaded.reference,
    name: uploaded.name
  }
}
