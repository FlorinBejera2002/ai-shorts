/** Extract a readable message from our API routes and FastAPI error shapes. */
export function extractApiError(
  data: Record<string, unknown>,
  fallback: string
): string {
  if (typeof data.error === 'string') return data.error
  if (typeof data.detail === 'string') return data.detail
  if (Array.isArray(data.detail) && data.detail.length > 0) {
    return (
      data.detail
        .map((e: { msg?: string }) => e.msg ?? '')
        .filter(Boolean)
        .join('; ') || fallback
    )
  }
  return fallback
}
