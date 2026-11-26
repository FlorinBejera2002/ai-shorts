import { useEffect, useRef, useState } from 'react'
import type { SiteLocale } from '@/lib/site-config'
import { toast } from '@/lib/toast'
import { apiFetch } from '@/lib/auth'
import { extractApiError } from '@/lib/api-error'
import { LOGO_MAX_BYTES, LOGO_TYPES } from '@/components/dashboard/brand/constants'
import { agentApi } from './api'
import type { AgentResource } from './model'
import { publishingFileType, uploadPublishingFile } from '@/components/calendar/publishing-media-utils'
import type { AttachmentTarget } from './attachment-target'

export function useAgentAttachments(projectId?: string) {
  const [resources, setResources] = useState<AgentResource[]>([])
  const [pending, setPending] = useState<string>()
  const [error, setError] = useState('')
  const [completedBatch, setCompletedBatch] = useState(0)
  const controller = useRef<AbortController | null>(null)
  useEffect(() => () => controller.current?.abort(), [])
  async function add(files: File[], locale: SiteLocale, publishing = false, target?: AttachmentTarget) {
    if (controller.current || !files.length) return
    if (target?.ambiguous) { setError({ en: 'Identify the project for these files.', ro: 'Precizează proiectul pentru aceste fișiere.', es: 'Indica el proyecto para estos archivos.' }[locale]); return }
    const targetProjectId = target ? target.projectId : projectId
    if (files.length + resources.length > 8) { setError({ en: 'Attach up to 8 resources.', ro: 'Poți atașa maximum 8 resurse.', es: 'Adjunta como máximo 8 recursos.' }[locale]); return }
    const active = new AbortController(); controller.current = active; setError('')
    try {
      for (const file of files) {
        setPending(file.name)
        const document = /\.(txt|md)$/i.test(file.name)
        if (publishing) {
          if (!publishingFileType(file) || !file.size) throw new Error({ en: 'Choose a publishing image or video.', ro: 'Alege o imagine sau un videoclip pentru publicare.', es: 'Elige una imagen o un video para publicar.' }[locale])
          const uploaded = await uploadPublishingFile(file, apiFetch, active.signal)
          const resource = await agentApi.resource({ kind: 'publishing_media', reference: uploaded.reference, name: uploaded.name }, active.signal)
          setResources(previous => [...previous, resource])
        } else if (document) {
          if (file.size > 80000 || !file.size) throw new Error({ en: 'Documents can contain up to 20,000 characters.', ro: 'Documentele pot avea maximum 20.000 de caractere.', es: 'Los documentos pueden tener hasta 20.000 caracteres.' }[locale])
          const text = await file.text()
          if (text.length > 20000 || !text.trim() || text.includes('\0')) throw new Error({ en: 'The file must contain valid text, up to 20,000 characters.', ro: 'Fișierul trebuie să conțină text valid, maximum 20.000 de caractere.', es: 'El archivo debe contener texto válido, de hasta 20.000 caracteres.' }[locale])
          const resource = await agentApi.resource({ kind: 'document', name: file.name, text, project_id: targetProjectId }, active.signal)
          setResources(previous => [...previous, resource])
        } else {
          if (!LOGO_TYPES.includes(file.type) || file.size > LOGO_MAX_BYTES || !file.size) throw new Error({ en: 'Logo: PNG, JPEG or WebP, up to 5 MB.', ro: 'Logo: PNG, JPEG sau WebP, maximum 5 MB.', es: 'Logotipo: PNG, JPEG o WebP, de hasta 5 MB.' }[locale])
          const form = new FormData(); form.set('file', file)
          const response = await apiFetch('/api/brand/logo', { method: 'POST', body: form, signal: active.signal })
          const data = await response.json()
          if (!response.ok || typeof data.logo_path !== 'string') throw new Error(extractApiError(data, { en: 'Upload failed.', ro: 'Încărcarea a eșuat.', es: 'No se pudo subir el archivo.' }[locale]))
          const resource = await agentApi.resource({ kind: 'logo', reference: data.logo_path, name: file.name, project_id: targetProjectId }, active.signal)
          setResources(previous => [...previous, resource])
        }
      }
      if (!active.signal.aborted) setCompletedBatch(value => value + 1)
    } catch (cause) { if (!active.signal.aborted) toast.error(cause instanceof Error ? cause.message : String(cause)) }
    finally { controller.current = null; setPending(undefined) }
  }
  function cancel() { controller.current?.abort() }
  function remove(id: string) { setResources(previous => previous.filter(resource => resource.id !== id)) }
  return { resources, pending, error, completedBatch, add, cancel, remove }
}
