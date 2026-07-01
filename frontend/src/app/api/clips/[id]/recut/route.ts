import { auth } from '@/lib/auth'
import { backendFetch } from '@/lib/api'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const body = await request.json()

  const res = await backendFetch(`/api/clips/${id}/recut`, {
    method: 'POST',
    body: JSON.stringify(body),
  })

  const data = await res.json()
  return NextResponse.json(data, { status: res.status })
}
