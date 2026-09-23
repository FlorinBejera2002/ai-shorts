import { useCallback, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { storyRequest } from '@/components/story/api'
import { useStoryUploads } from '@/components/story/use-story-uploads'
import { storyIsBusy } from '@/components/story/types'
import type { StoryProject } from '@/components/story/types'

export function useAgentResources(projectId?: string) {
  const client = useQueryClient()
  const [error, setError] = useState('')
  const query = useQuery({ queryKey: ['agent-story', projectId], enabled: Boolean(projectId),
    queryFn: ({ signal }) => storyRequest<StoryProject>(`/api/stories/${projectId}`, 'GET', undefined, signal) })
  const refresh = useCallback(async (project?: StoryProject) => {
    if (project) client.setQueryData(['agent-story', projectId], project)
    else await client.invalidateQueries({ queryKey: ['agent-story', projectId] })
    await client.invalidateQueries({ queryKey: ['workspace-agent', 'suggestions'] })
  }, [client, projectId])
  const uploads = useStoryUploads(projectId ?? '', refresh)
  function add(files: File[], ro: boolean) {
    const project = query.data
    if (!project || storyIsBusy(project.status)) return
    const pending = uploads.items.filter(item => item.status !== 'complete')
    const limits = project.limits
    const bytes = project.assets.reduce((sum, item) => sum + item.size, 0) + pending.reduce((sum, item) => sum + item.file.size, 0) + files.reduce((sum, item) => sum + item.size, 0)
    if (files.some(file => !/\.(mp4|mov|webm|mkv)$/i.test(file.name) || file.size === 0 || file.size > limits.max_file_bytes) || project.assets.length + pending.length + files.length > limits.max_files || bytes > limits.max_total_bytes) {
      setError(ro ? 'Verifică formatul, dimensiunea și numărul fișierelor.' : 'Check file format, size and count.'); return
    }
    setError(''); uploads.add(files, Math.max(-1, ...project.assets.map(asset => asset.order)) + 1)
  }
  return { projectId, query, uploads, error, add }
}


