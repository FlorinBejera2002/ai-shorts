/** Signing changes access, not the immutable recording at this media path. */
export function transcriptMediaIdentity(source: string) {
  try {
    const url = new URL(source, 'http://relative.invalid')
    for (const name of [...url.searchParams.keys()]) {
      const lower = name.toLowerCase()
      if (['expires', 'sig'].includes(lower) || lower.startsWith('x-amz-'))
        url.searchParams.delete(name)
    }
    url.hash = ''
    return url.href
  } catch {
    return source
  }
}
