import { proxyBackendResponse } from '@/lib/api'
import { auth } from '@/lib/auth'

export const runtime = 'nodejs'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session?.user?.id) {
    return Response.json({ error: 'Authentication required' }, { status: 401 })
  }

  const { id } = await params
  return proxyBackendResponse(`/api/clips/${id}/trim`, {
    method: 'POST',
    body: await request.text(),
  })
}
