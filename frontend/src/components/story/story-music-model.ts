import type { StoryMusicOptions } from './types'

export const musicUploadMaximum = 128 * 1024 * 1024
export const musicUploadAccept = '.mp3,.wav,.m4a,.mp4,.ogg,.opus,.webm,.flac'

type MusicText = (english: string, romanian: string) => string
const englishText: MusicText = (english) => english

export function musicRangeProblem(
  music?: StoryMusicOptions | null,
  text: MusicText = englishText
): string | null {
  if (!music) return null
  const start = music.start_seconds ?? 0
  const end = music.end_seconds ?? 0
  if (!Number.isFinite(start) || start < 0 || start >= 1800)
    return text(
      'Choose a start between 0 and 1799 seconds.',
      'Alege un început între 0 și 1799 de secunde.'
    )
  if (!Number.isFinite(end) || end < 0 || end > 1800)
    return text(
      'Choose an end up to 1800 seconds, or leave it blank.',
      'Alege un sfârșit de maximum 1800 de secunde sau lasă câmpul gol.'
    )
  if (end && end - start < 1)
    return text(
      'The music excerpt must be at least one second long.',
      'Fragmentul muzical trebuie să dureze cel puțin o secundă.'
    )
  if (end && end - start > 600)
    return text(
      'Choose a music excerpt of up to 10 minutes.',
      'Alege un fragment muzical de maximum 10 minute.'
    )
  return null
}

export function musicUploadProblem(
  file: Pick<File, 'name' | 'size'>,
  text: MusicText = englishText
): string | null {
  if (!/\.(mp3|wav|m4a|mp4|ogg|opus|webm|flac)$/i.test(file.name))
    return text(
      'Choose an MP3, WAV, M4A, Ogg, WebM or FLAC audio file.',
      'Alege un fișier audio MP3, WAV, M4A, Ogg, WebM sau FLAC.'
    )
  if (!file.size || file.size > musicUploadMaximum)
    return text(
      'Choose an audio file up to 128 MiB.',
      'Alege un fișier audio de maximum 128 MiB.'
    )
  return null
}
