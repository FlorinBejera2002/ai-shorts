// Match the owned Studio inventory and the upload route's 500 MiB body limit.
export const STUDIO_UPLOAD_ACCEPT = '.png,.jpg,.jpeg,.webp,.gif,.mp3,.wav,.m4a,.ogg,.mp4,.webm,.mov,.woff,.woff2,.ttf,.otf'
const extensions = new Set(STUDIO_UPLOAD_ACCEPT.split(','))
const maxBodyBytes = 500 * 1024 ** 2
const multipartHeadroom = 64 * 1024

export function validStudioUpload(files: Pick<File, 'name' | 'size'>[]): boolean {
  if (!files.length || files.length > 8) return false
  if (files.some(file => !Number.isFinite(file.size) || file.size <= 0 || !extensions.has(file.name.slice(file.name.lastIndexOf('.')).toLowerCase()))) return false
  return files.reduce((total, file) => total + file.size, 0) < maxBodyBytes - multipartHeadroom
}
