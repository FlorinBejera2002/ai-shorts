import { auth } from '@/lib/auth'
import { validateScheduledPostPayload } from '@/lib/content-calendar'
import { createPrismaClient } from '@/lib/db'

import {
  clipValidationResponse,
  findOwnedPostClip,
  findOwnedScheduledPost,
  isClipRelationRace,
  isValidId,
  jsonResponse,
  mutationRateLimitResponse,
  payloadValidationResponse,
  readJsonBody
} from '../_shared'

export const runtime = 'nodejs'

type RouteContext = {
  params: Promise<{ id: string }>
}

export async function PATCH(request: Request, { params }: RouteContext) {
  const [session, { id }] = await Promise.all([auth(), params])
  if (!session?.user?.id) {
    return jsonResponse({ error: 'Authentication required.' }, { status: 401 })
  }
  const prisma = createPrismaClient()
  if (!isValidId(id)) {
    return jsonResponse(
      { error: 'Calendar post ID is invalid.' },
      { status: 400 }
    )
  }

  const limitedResponse = await mutationRateLimitResponse(
    request,
    session.user.id
  )
  if (limitedResponse) return limitedResponse

  const body = await readJsonBody(request)
  if (!body.success) return body.response

  const validation = validateScheduledPostPayload(body.value, 'update')
  if (!validation.success) {
    return payloadValidationResponse(validation.issues)
  }

  if (validation.data.clipId) {
    const clip = await findOwnedPostClip(
      prisma,
      session.user.id,
      validation.data.clipId
    )
    if (!clip) return clipValidationResponse()
  }

  const updateData = {
    ...validation.data,
    ...('clipId' in validation.data
      ? {
          clipOwnerId: validation.data.clipId ? session.user.id : null
        }
      : {})
  }
  let result
  try {
    result = await prisma.scheduledPost.updateMany({
      where: { id, userId: session.user.id },
      data: updateData
    })
  } catch (error) {
    if (isClipRelationRace(error)) return clipValidationResponse()
    throw error
  }
  if (result.count === 0) {
    return jsonResponse({ error: 'Calendar post not found.' }, { status: 404 })
  }

  const post = await findOwnedScheduledPost(prisma, session.user.id, id)
  if (!post) {
    return jsonResponse({ error: 'Calendar post not found.' }, { status: 404 })
  }

  return jsonResponse({ post })
}

export async function DELETE(request: Request, { params }: RouteContext) {
  const [session, { id }] = await Promise.all([auth(), params])
  if (!session?.user?.id) {
    return jsonResponse({ error: 'Authentication required.' }, { status: 401 })
  }
  const prisma = createPrismaClient()
  if (!isValidId(id)) {
    return jsonResponse(
      { error: 'Calendar post ID is invalid.' },
      { status: 400 }
    )
  }

  const limitedResponse = await mutationRateLimitResponse(
    request,
    session.user.id
  )
  if (limitedResponse) return limitedResponse

  const result = await prisma.scheduledPost.deleteMany({
    where: { id, userId: session.user.id }
  })
  if (result.count === 0) {
    return jsonResponse({ error: 'Calendar post not found.' }, { status: 404 })
  }

  return jsonResponse({ deleted: true })
}
