import { auth } from '@/lib/auth'
import {
  parseCalendarRange,
  validateScheduledPostPayload
} from '@/lib/content-calendar'
import { createPrismaClient } from '@/lib/db'

import {
  CALENDAR_POST_LIMIT,
  clipValidationResponse,
  findOwnedPostClip,
  findOwnedPostClips,
  findRecentOwnedClips,
  isClipRelationRace,
  jsonResponse,
  mutationRateLimitResponse,
  payloadValidationResponse,
  readJsonBody,
  scheduledPostSelect,
  serializeScheduledPost
} from './_shared'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return jsonResponse({ error: 'Authentication required.' }, { status: 401 })
  }
  const prisma = createPrismaClient()

  const { searchParams } = new URL(request.url)
  const startValue = searchParams.get('start')
  const endValue = searchParams.get('end')
  const range = parseCalendarRange(startValue, endValue)
  if (!range.success) {
    return jsonResponse({ error: range.message }, { status: 400 })
  }

  const [storedPosts, clips] = await Promise.all([
    prisma.scheduledPost.findMany({
      where: {
        userId: session.user.id,
        scheduledAt: {
          gte: range.start,
          lt: range.end
        }
      },
      select: scheduledPostSelect,
      orderBy: [{ scheduledAt: 'asc' }, { id: 'asc' }],
      take: CALENDAR_POST_LIMIT + 1
    }),
    findRecentOwnedClips(prisma, session.user.id)
  ])

  const truncated = storedPosts.length > CALENDAR_POST_LIMIT
  const visiblePosts = storedPosts.slice(0, CALENDAR_POST_LIMIT)
  const referencedClipIds = [
    ...new Set(
      visiblePosts
        .map((post) => post.clipId)
        .filter((clipId): clipId is string => Boolean(clipId))
    )
  ]
  const referencedClips = await findOwnedPostClips(
    prisma,
    session.user.id,
    referencedClipIds
  )
  const clipsById = new Map(referencedClips.map((clip) => [clip.id, clip]))
  const posts = visiblePosts.map((post) =>
    serializeScheduledPost(
      post,
      post.clipId ? (clipsById.get(post.clipId) ?? null) : null
    )
  )

  return jsonResponse({
    posts,
    clips,
    meta: {
      truncated,
      limit: CALENDAR_POST_LIMIT
    }
  })
}

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return jsonResponse({ error: 'Authentication required.' }, { status: 401 })
  }
  const prisma = createPrismaClient()

  const limitedResponse = await mutationRateLimitResponse(
    request,
    session.user.id
  )
  if (limitedResponse) return limitedResponse

  const body = await readJsonBody(request)
  if (!body.success) return body.response

  const validation = validateScheduledPostPayload(body.value, 'create')
  if (!validation.success) {
    return payloadValidationResponse(validation.issues)
  }

  const { title, platforms, status, scheduledAt } = validation.data
  if (!title || !platforms || !status || !scheduledAt) {
    return payloadValidationResponse([
      { field: 'body', message: 'Required calendar fields are missing' }
    ])
  }

  const clip = validation.data.clipId
    ? await findOwnedPostClip(prisma, session.user.id, validation.data.clipId)
    : null
  if (validation.data.clipId && !clip) return clipValidationResponse()

  let created
  try {
    created = await prisma.scheduledPost.create({
      data: {
        userId: session.user.id,
        clipId: validation.data.clipId ?? null,
        clipOwnerId: validation.data.clipId ? session.user.id : null,
        title,
        caption: validation.data.caption ?? null,
        notes: validation.data.notes ?? null,
        platforms,
        status,
        scheduledAt
      },
      select: scheduledPostSelect
    })
  } catch (error) {
    if (isClipRelationRace(error)) return clipValidationResponse()
    throw error
  }

  return jsonResponse(
    { post: serializeScheduledPost(created, clip) },
    { status: 201 }
  )
}
