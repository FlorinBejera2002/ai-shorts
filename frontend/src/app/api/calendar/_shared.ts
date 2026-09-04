import type {
  CalendarClipOption,
  ContentPlatform,
  ContentPostStatus,
  ScheduledPostRecord,
  ValidationIssue
} from '@/lib/content-calendar'
import { rateLimit, rateLimitKey, rateLimitedResponse } from '@/lib/rate-limit'
import { Prisma, type PrismaClient } from '@prisma/client'

export const CALENDAR_POST_LIMIT = 500
export const RECENT_CLIP_LIMIT = 100

const MUTATION_LIMIT = 120
const MUTATION_WINDOW_MS = 60 * 60 * 1000
const MAX_BODY_BYTES = 32_000
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export const scheduledPostSelect = {
  id: true,
  clipId: true,
  title: true,
  caption: true,
  notes: true,
  platforms: true,
  status: true,
  scheduledAt: true,
  createdAt: true,
  updatedAt: true
} as const

export const postClipSelect = {
  id: true,
  title: true,
  viralScore: true,
  thumbnailUrl: true
} as const

export const calendarClipSelect = {
  ...postClipSelect,
  captionTiktok: true,
  captionInstagram: true,
  captionYoutube: true
} as const

type StoredPost = {
  id: string
  clipId: string | null
  title: string
  caption: string | null
  notes: string | null
  platforms: string[]
  status: string
  scheduledAt: Date
  createdAt: Date
  updatedAt: Date
}

export type PostClip = {
  id: string
  title: string
  viralScore: number
  thumbnailUrl: string | null
}

type JsonBodyResult =
  | { success: true; value: unknown }
  | { success: false; response: Response }

export function jsonResponse(
  body: unknown,
  init?: { status?: number; headers?: HeadersInit }
) {
  const headers = new Headers(init?.headers)
  headers.set('Cache-Control', 'private, no-store')
  return Response.json(body, { ...init, headers })
}

export function isValidId(id: string) {
  return UUID_PATTERN.test(id)
}

export async function readJsonBody(request: Request): Promise<JsonBodyResult> {
  const contentLength = Number(request.headers.get('content-length'))
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return {
      success: false,
      response: jsonResponse(
        { error: 'Request body is too large.' },
        { status: 413 }
      )
    }
  }

  let rawBody: string
  try {
    rawBody = await request.text()
  } catch {
    return {
      success: false,
      response: jsonResponse(
        { error: 'Request body could not be read.' },
        { status: 400 }
      )
    }
  }

  if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) {
    return {
      success: false,
      response: jsonResponse(
        { error: 'Request body is too large.' },
        { status: 413 }
      )
    }
  }

  try {
    return { success: true, value: JSON.parse(rawBody) }
  } catch {
    return {
      success: false,
      response: jsonResponse(
        { error: 'Request body must be valid JSON.' },
        { status: 400 }
      )
    }
  }
}

export function payloadValidationResponse(issues: ValidationIssue[]) {
  return jsonResponse(
    {
      error: 'Please correct the highlighted fields.',
      issues
    },
    { status: 400 }
  )
}

export function clipValidationResponse() {
  return payloadValidationResponse([
    {
      field: 'clipId',
      message: 'Choose a clip from your library or remove the selected clip'
    }
  ])
}

export function isClipRelationRace(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2003'
  )
}

export async function mutationRateLimitResponse(
  request: Request,
  userId: string
) {
  const result = await rateLimit({
    key: rateLimitKey(request, `calendar:mutations:${userId}`),
    limit: MUTATION_LIMIT,
    windowMs: MUTATION_WINDOW_MS
  })

  return result.limited ? rateLimitedResponse(result.resetAt) : null
}

export async function findOwnedPostClip(
  prisma: PrismaClient,
  userId: string,
  clipId: string
): Promise<PostClip | null> {
  return prisma.clip.findFirst({
    where: { id: clipId, userId },
    select: postClipSelect
  })
}

export async function findOwnedPostClips(
  prisma: PrismaClient,
  userId: string,
  clipIds: string[]
) {
  if (clipIds.length === 0) return []

  return prisma.clip.findMany({
    where: {
      userId,
      id: { in: clipIds }
    },
    select: postClipSelect
  })
}

export async function findRecentOwnedClips(
  prisma: PrismaClient,
  userId: string
): Promise<CalendarClipOption[]> {
  return prisma.clip.findMany({
    where: { userId },
    select: calendarClipSelect,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: RECENT_CLIP_LIMIT
  })
}

export function serializeScheduledPost(
  post: StoredPost,
  clip: PostClip | null
): ScheduledPostRecord {
  return {
    id: post.id,
    title: post.title,
    caption: post.caption,
    notes: post.notes,
    platforms: post.platforms as ContentPlatform[],
    status: post.status as ContentPostStatus,
    scheduledAt: post.scheduledAt.toISOString(),
    createdAt: post.createdAt.toISOString(),
    updatedAt: post.updatedAt.toISOString(),
    clip
  }
}

export async function findOwnedScheduledPost(
  prisma: PrismaClient,
  userId: string,
  postId: string
): Promise<ScheduledPostRecord | null> {
  const post = await prisma.scheduledPost.findFirst({
    where: { id: postId, userId },
    select: scheduledPostSelect
  })
  if (!post) return null

  const clip = post.clipId
    ? await findOwnedPostClip(prisma, userId, post.clipId)
    : null
  return serializeScheduledPost(post, clip)
}
