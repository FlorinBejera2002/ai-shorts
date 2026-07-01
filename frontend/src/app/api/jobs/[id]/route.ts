import { proxyBackendResponse } from '@/lib/api'

export const runtime = 'nodejs'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  return proxyBackendResponse(`/api/jobs/${id}`)
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  return proxyBackendResponse(`/api/jobs/${id}/cancel`, {
    method: 'POST'
  })
}
