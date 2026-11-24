import { useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { storyRequest } from './api'
import { defaultLimits, storyIsBusy, type StoryProject } from './types'

/** Stores a project the caller already holds, then refetches the project and the list. */
export type StoryRefresh = (project?: StoryProject) => Promise<unknown>

/** Loads the selected project (polled while busy) and the upload limits of the account. */
export function useStoryProjectQuery(userID: string, projectID: string) {
  const queryClient = useQueryClient()
  const queryKey = ['story', userID, projectID]
  const projectQuery = useQuery({
    queryKey,
    enabled: Boolean(projectID),
    queryFn: ({ signal }) =>
      storyRequest<StoryProject>(
        `/api/stories/${projectID}`,
        'GET',
        undefined,
        signal
      ),
    refetchInterval: (query) =>
      storyIsBusy(query.state.data?.status) ? 2500 : false,
    retry: 1
  })
  const recent = useQuery({
    queryKey: ['stories', userID],
    queryFn: ({ signal }) =>
      storyRequest<
        | StoryProject[]
        | { stories: StoryProject[]; limits?: StoryProject['limits'] }
      >('/api/stories', 'GET', undefined, signal)
  })
  const limits =
    (!Array.isArray(recent.data) && recent.data?.limits) || defaultLimits
  const refresh = useCallback<StoryRefresh>(
    async (project) => {
      if (project?.id === projectID)
        queryClient.setQueryData(['story', userID, projectID], project)
      await queryClient.invalidateQueries({
        queryKey: ['story', userID, projectID]
      })
      await queryClient.invalidateQueries({ queryKey: ['stories', userID] })
    },
    [queryClient, userID, projectID]
  )

  return { projectQuery, limits, refresh }
}
