'use client'

import { apiFetch } from '@/lib/auth'
import {
  buildClipsLibrary,
  type ApiLibraryClip,
  type ClipsLibrary,
  type ClipsLibraryResponse
} from '@/lib/clips-library'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useMemo } from 'react'

const LIBRARY_KEY = ['api-resource', '/api/projects']

async function readLibrary(): Promise<ClipsLibraryResponse> {
  const response = await apiFetch('/api/projects')
  if (!response.ok) throw new Error('Clips library unavailable')
  return response.json()
}

async function send(path: string, method: string, body?: unknown) {
  const response = await apiFetch(path, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body)
  })
  if (!response.ok) {
    const data = await response.json().catch(() => ({}))
    throw Object.assign(new Error(typeof data.detail === 'string' ? data.detail : 'Request failed'), {
      status: response.status
    })
  }
  return response.status === 204 ? null : response.json().catch(() => null)
}

export type ClipsLibraryActions = {
  createProject: (name: string) => Promise<string>
  renameProject: (id: string, name: string) => Promise<void>
  deleteProject: (id: string) => Promise<void>
  moveClip: (clipId: string, projectId: string | null) => Promise<void>
  setFavorite: (clipId: string, favorite: boolean) => Promise<void>
  deleteClip: (clipId: string) => Promise<void>
}

/** Loads the Clips library and exposes the page's mutations. Moves and deletes are optimistic. */
export function useClipsLibrary() {
  const client = useQueryClient()
  const query = useQuery({ queryKey: LIBRARY_KEY, queryFn: readLibrary })
  const library = useMemo<ClipsLibrary | null>(() => (query.data ? buildClipsLibrary(query.data) : null), [query.data])

  const refresh = useCallback(async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey: LIBRARY_KEY }),
      client.invalidateQueries({ queryKey: ['api-resource', '/api/dashboard'] })
    ])
  }, [client])

  const actions = useMemo<ClipsLibraryActions>(() => {
    // The raw payload keeps folder ids; patch it so the derived library updates at once.
    function patchClip(clipId: string, change: (clip: ApiLibraryClip) => ApiLibraryClip | undefined) {
      client.setQueryData<ClipsLibraryResponse>(LIBRARY_KEY, (current) =>
        current && {
          ...current,
          projects: current.projects.map((source) => ({
            ...source,
            clips: source.clips.flatMap((clip) => {
              if (clip.id !== clipId) return [clip]
              const next = change(clip)
              return next ? [next] : []
            })
          }))
        }
      )
    }
    // A failed request reloads the server state instead of restoring a snapshot, so a later
    // optimistic change that overlapped this one is not rolled back with it.
    async function optimistic(apply: () => void, request: () => Promise<unknown>) {
      await client.cancelQueries({ queryKey: LIBRARY_KEY })
      apply()
      try {
        await request()
      } catch (error) {
        await refresh()
        throw error
      }
      void refresh()
    }
    return {
      async createProject(name) {
        const created = (await send('/api/collections', 'POST', { name })) as { id: string }
        await refresh()
        return created.id
      },
      async renameProject(id, name) {
        await send(`/api/collections/${encodeURIComponent(id)}`, 'PATCH', { name })
        await refresh()
      },
      async deleteProject(id) {
        await send(`/api/collections/${encodeURIComponent(id)}`, 'DELETE')
        await refresh()
      },
      moveClip: (clipId, projectId) =>
        optimistic(
          () => patchClip(clipId, (clip) => ({ ...clip, folderId: projectId })),
          () => send(`/api/clips/${encodeURIComponent(clipId)}/collection`, 'PUT', { collectionId: projectId })
        ),
      setFavorite: (clipId, favorite) =>
        optimistic(
          () => patchClip(clipId, (clip) => ({ ...clip, favorite })),
          () => send(`/api/clips/${encodeURIComponent(clipId)}/favorite`, 'PUT', { favorite })
        ),
      deleteClip: (clipId) =>
        optimistic(
          () => patchClip(clipId, () => undefined),
          () => send(`/api/clips/${encodeURIComponent(clipId)}`, 'DELETE')
        )
    }
  }, [client, refresh])

  return {
    library,
    isPending: query.isPending,
    isError: query.isError && !query.data,
    reload: () => void query.refetch(),
    actions
  }
}
