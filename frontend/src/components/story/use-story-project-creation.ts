import { useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from '@/lib/toast'
import { storyRequest } from './api'
import { storyProblem } from './story-error'
import type { StoryStep } from './story-wizard'
import { validateStoryFiles } from './story-file-validation'
import { defaultOptions, type StoryProject } from './types'
import { useStoryLanguage } from './use-story-language'

/** Footage chosen before the project exists, handed to the workspace that opens it. */
export interface StoryIncomingProject {
  id: string
  files: File[]
  step: StoryStep
}

interface StoryProjectCreationOptions {
  userID: string
  limits: StoryProject['limits']
  /** Idempotency key reused across retries of the same creation. */
  createID: { current: string }
  setID: (id: string) => void
  setIncoming: (incoming: StoryIncomingProject) => void
  setError: (message: string) => void
  setRetainedFiles: (files: File[]) => void
}

/** Creates the project for footage chosen on the first step, once at a time. */
export function useStoryProjectCreation({
  userID,
  limits,
  createID,
  setID,
  setIncoming,
  setError,
  setRetainedFiles
}: StoryProjectCreationOptions) {
  const text = useStoryLanguage()
  const queryClient = useQueryClient()
  const [creating, setCreating] = useState(false)
  const createBusy = useRef(false)

  function createProject(files: File[], nextStep: StoryStep = 0) {
    if (createBusy.current) return
    const validation = validateStoryFiles(files, [], [], limits)
    if (validation) {
      setError(storyProblem(validation, text))
      return
    }
    setRetainedFiles(files)
    createBusy.current = true
    setCreating(true)
    setError('')
    void storyRequest<StoryProject>('/api/stories', 'POST', {
      id: createID.current,
      options: defaultOptions
    })
      .then((project) => {
        queryClient.setQueryData(['story', userID, project.id], project)
        setIncoming({ id: project.id, files, step: nextStep })
        setID(project.id)
        void queryClient.invalidateQueries({ queryKey: ['stories', userID] })
      })
      .catch((cause: unknown) => {
        const message =
          cause instanceof Error
            ? storyProblem(cause.message, text)
            : text('Could not create project.', 'Proiectul nu a putut fi creat.')
        toast.error(message, {
          action: {
            label: text('Retry creating project', 'Reîncearcă crearea proiectului'),
            onClick: () => void createProject(files, nextStep)
          }
        })
      })
      .finally(() => {
        createBusy.current = false
        setCreating(false)
      })
  }

  return { creating, createProject }
}
