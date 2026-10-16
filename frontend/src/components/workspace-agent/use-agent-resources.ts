import { useCallback, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { storyRequest } from '@/components/story/api'
import { useStoryUploads } from '@/components/story/use-story-uploads'
import { storyIsBusy } from '@/components/story/types'
import type { StoryProject } from '@/components/story/types'
import { validateStoryFiles } from '@/components/story/story-file-validation'

export function useAgentResources(projectId?: string) {
  const client = useQueryClient()
  const [error, setError] = useState('')
  const query = useQuery({ queryKey: ['agent-story', projectId], enabled: Boolean(projectId),
    queryFn: ({ signal }) => storyRequest<StoryProject>(`/api/stories/${projectId}`, 'GET', undefined, signal) })
  const refresh = useCallback(async (project?: StoryProject) => {
    if (project) client.setQueryData(['agent-story', project.id], project)
    else await client.invalidateQueries({ queryKey: ['agent-story', projectId] })
    await client.invalidateQueries({ queryKey: ['workspace-agent', 'suggestions'] })
  }, [client, projectId])
  const uploads = useStoryUploads(projectId ?? '', refresh)
  function add(files: File[], ro: boolean) {
    const project = query.data
    if (!project || storyIsBusy(project.status)) return
    const pending = uploads.items.filter(item => item.projectId === projectId && item.status !== 'complete')
    const limits = project.limits
    if (validateStoryFiles(files, project.assets, pending.map(item => item.file), limits)) {
      setError(ro ? 'Verifică formatul și dimensiunea fișierelor.' : 'Check file format and size.'); return
    }
    setError(''); uploads.add(files, project.assets.reduce((maximum, asset) => Math.max(maximum, asset.order), -1) + 1)
  }
  return { projectId, query, uploads, error, add }
}


