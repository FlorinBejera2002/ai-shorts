import { proxyBackendResponse } from '@/lib/api'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'

export const runtime = 'nodejs'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  return proxyBackendResponse(`/api/clips/${id}`)
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  return proxyBackendResponse(`/api/clips/${id}`, {
    method: 'DELETE'
  })
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const [{ id }, session] = await Promise.all([params, auth()])
  if (!session?.user?.id) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const payload = await request.json()
  const title = String(payload.title ?? '').trim()
  const hookText = String(payload.hookText ?? '').trim()
  const transcriptText = String(payload.transcriptText ?? '').trim()

  if (
    !title ||
    title.length > 120 ||
    hookText.length > 220 ||
    transcriptText.length > 20000
  ) {
    return Response.json(
      { error: 'Title is required or edited text is too long' },
      { status: 400 },
    )
  }

  const clip = await prisma.clip.updateMany({
    where: { id, userId: session.user.id },
    data: {
      title,
      hookText: hookText || null,
      transcriptText: transcriptText || null,
    },
  })

  if (clip.count === 0) {
    return Response.json({ error: 'Clip not found' }, { status: 404 })
  }

  return Response.json({ ok: true })
}
