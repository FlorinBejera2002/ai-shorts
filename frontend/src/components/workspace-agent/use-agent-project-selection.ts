'use client'

import { useState } from 'react'

export type SelectedProject = { id: string; kind: 'story' | 'project' | 'studio'; route: string }

const uuid = /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i

/**
 * Tracks which project the assistant is working on. A project named in the URL wins
 * over the last explicit choice, and both are scoped to the route they were made on.
 */
export function useAgentProjectSelection(route: string, search: URLSearchParams) {
  const routeStory = route === '/dashboard/create' && uuid.test(search.get('story') ?? '') ? search.get('story')! : undefined
  const routeStudio = route === '/dashboard/studio' && uuid.test(search.get('project') ?? '') ? search.get('project')! : undefined
  const routeKey = `${route}?${search.toString()}`
  const [selectedProject, setSelectedProject] = useState<SelectedProject | undefined>(() => routeSelection(routeStory, routeStudio, routeKey))
  const [lastRouteKey, setLastRouteKey] = useState(routeKey)
  if (lastRouteKey !== routeKey) {
    setLastRouteKey(routeKey)
    const next = routeSelection(routeStory, routeStudio, routeKey)
    if (next) setSelectedProject(next)
  }
  const projectId = selectedProject?.route === routeKey ? selectedProject.id : routeStory ?? routeStudio ?? selectedProject?.id
  const storyId = projectId === routeStory ? routeStory : selectedProject?.kind === 'story' && selectedProject.id === projectId ? projectId : undefined
  return { routeKey, routeStudio, selectedProject, setSelectedProject, projectId, storyId }
}

function routeSelection(story: string | undefined, studio: string | undefined, routeKey: string): SelectedProject | undefined {
  if (story) return { id: story, kind: 'story', route: routeKey }
  if (studio) return { id: studio, kind: 'studio', route: routeKey }
  return undefined
}
