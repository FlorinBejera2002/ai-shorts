import { proxyBackendResponse } from '@/lib/api'

export const runtime = 'nodejs'

export async function GET() {
  return proxyBackendResponse('/api/clips')
}
