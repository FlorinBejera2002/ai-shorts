/** A single YouTube video; the API independently validates and canonicalizes it. */
export function canonicalYouTubeLink(value: string): string | null {
  if (value.length > 2048) return null
  try {
    const url = new URL(value.trim())
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.port) return null
    let id = ''
    if (['youtu.be', 'www.youtu.be'].includes(url.hostname)) {
      id = url.pathname.slice(1)
    } else if (
      ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com'].includes(url.hostname)
    ) {
      if (url.pathname === '/watch' && url.searchParams.getAll('v').length === 1)
        id = url.searchParams.get('v') ?? ''
      else id = url.pathname.match(/^\/(?:shorts|live|embed)\/([\w-]{11})\/?$/)?.[1] ?? ''
    }
    return /^[\w-]{11}$/.test(id) ? `https://www.youtube.com/watch?v=${id}` : null
  } catch {
    return null
  }
}
