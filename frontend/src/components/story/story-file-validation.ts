import type { StoryProject } from './types'

const supportedFormat = /\.(mp4|mov|webm|mkv)$/i

/** Per-file rule shared by the picker and the source list: format, non-empty and within the per-file limit. */
export function isAcceptedStoryFile(
  file: Pick<File, 'name' | 'size'>,
  limits: StoryProject['limits']
) {
  return supportedFormat.test(file.name) && file.size > 0 && file.size <= limits.max_file_bytes
}

/** Source collections are bounded by byte budgets, not an arbitrary clip count. */
export function validateStoryFiles(
  files: File[],
  assets: Array<{ size: number }>,
  pending: File[],
  limits: StoryProject['limits']
) {
  if (!files.length) return ''
  const invalid = files.find((file) => !isAcceptedStoryFile(file, limits))
  if (invalid)
    return `${invalid.name}: unsupported format, empty file, or file size exceeds the limit.`
  const bytes =
    assets.reduce((sum, asset) => sum + asset.size, 0) +
    [...pending, ...files].reduce((sum, file) => sum + file.size, 0)
  return bytes > limits.max_total_bytes
    ? 'The selected files exceed the total size limit.'
    : ''
}
