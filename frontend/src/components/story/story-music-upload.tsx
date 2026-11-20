import { useEffect, useId, useRef, useState } from 'react'
import { Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from '@/lib/toast'
import { apiFetch } from '@/lib/auth'
import { extractApiError } from '@/lib/api-error'
import { musicUploadAccept, musicUploadProblem } from './story-music-model'
import { useStoryLanguage } from './use-story-language'

interface MusicUpload {
  file_path: string
  file_name: string
  url: string
}

export function StoryMusicUpload({
  disabled,
  onSelect,
  onPending
}: {
  disabled: boolean
  onSelect: (upload: MusicUpload) => void
  onPending?: (pending: boolean) => void
}) {
  const text = useStoryLanguage()
  const id = useId()
  const input = useRef<HTMLInputElement>(null)
  const request = useRef<AbortController | null>(null)
  const selection = useRef(onSelect)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => () => request.current?.abort(), [])
  useEffect(() => {
    selection.current = onSelect
  }, [onSelect])

  async function upload(file: File) {
    const problem = musicUploadProblem(file, text)
    if (problem) {
      setError(problem)
      return
    }
    const controller = new AbortController()
    request.current?.abort()
    request.current = controller
    setError('')
    setPending(true)
    onPending?.(true)
    try {
      const body = new FormData()
      body.set('file', file)
      const response = await apiFetch('/api/upload/music', {
        method: 'POST',
        body,
        signal: AbortSignal.any([
          controller.signal,
          AbortSignal.timeout(10 * 60 * 1000)
        ])
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok || typeof data.file_path !== 'string')
        throw new Error(
          extractApiError(
            data,
            text(
              'Music upload failed. Try again.',
              'Încărcarea muzicii a eșuat. Încearcă din nou.'
            )
          )
        )
      if (!controller.signal.aborted)
        selection.current({ ...data, file_name: data.file_name || file.name })
    } catch (cause) {
      if (!controller.signal.aborted)
        toast.error(
          cause instanceof Error
            ? cause.message
            : text('Music upload failed.', 'Încărcarea muzicii a eșuat.')
        )
    } finally {
      if (request.current === controller) {
        request.current = null
        setPending(false)
        onPending?.(false)
      }
    }
  }

  return (
    <div className="space-y-2">
      <input
        ref={input}
        id={id}
        type="file"
        accept={musicUploadAccept}
        className="sr-only"
        tabIndex={-1}
        aria-label={text('Choose music file', 'Alege fișierul muzical')}
        disabled={disabled || pending}
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = ''
          if (file) void upload(file)
        }}
      />
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          className="flex-1"
          disabled={disabled || pending}
          onClick={() => input.current?.click()}
        >
          <Upload aria-hidden="true" />
          {pending
            ? text('Uploading music…', 'Se încarcă muzica…')
            : text('From device', 'De pe dispozitiv')}
        </Button>
        {pending && (
          <Button
            type="button"
            variant="ghost"
            onClick={() => request.current?.abort()}
          >
            {text('Cancel', 'Anulează')}
          </Button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        {text(
          'Use your own audio, up to 128 MiB and 30 minutes.',
          'Folosește propriul fișier audio, de maximum 128 MiB și 30 de minute.'
        )}
      </p>
      {pending && (
        <p role="status" className="text-xs text-muted-foreground">
          {text(
            'Keep this page open while your music uploads.',
            'Păstrează pagina deschisă cât timp se încarcă muzica.'
          )}
        </p>
      )}
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}
