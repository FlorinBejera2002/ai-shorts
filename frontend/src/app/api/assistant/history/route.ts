import { proxyBackendResponse } from '@/lib/api'
import { auth } from '@/lib/auth'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

function backendPath(request: Request): string {
  const url = new URL(request.url)
  const params = new URLSearchParams()
  const context = url.searchParams.get('context')
  const clipId = url.searchParams.get('clip_id')
  if (context) params.set('context', context)
  if (clipId) params.set('clip_id', clipId)
  return `/api/assistant/history?${params.toString()}`
}

export async function GET(request: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return proxyBackendResponse(backendPath(request))
}

export async function DELETE(request: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return proxyBackendResponse(backendPath(request), { method: 'DELETE' })
}
