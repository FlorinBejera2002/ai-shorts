import { useCallback, useEffect, useRef, useState } from 'react'
import { isStoryHelpStep, storyHelpEvent, storyHelpQuestion, type StoryHelpRequest } from './story-help'

type PrepareHelp = (question: string, request: StoryHelpRequest, append?: boolean) => boolean

export function useStoryAgentHelp(locale: string, prepare: PrepareHelp, open: () => void) {
  const composer = useRef<HTMLTextAreaElement | null>(null)
  const returnFocus = useRef<HTMLElement | null>(null)
  const focusRequested = useRef(false)
  const [pending, setPending] = useState<{ question: string; request: StoryHelpRequest } | null>(null)
  const [requestID, setRequestID] = useState(0)
  const focusComposer = useCallback(() => {
    if (focusRequested.current) composer.current?.focus()
    return focusRequested.current
  }, [])
  const composerRef = useCallback((node: HTMLTextAreaElement | null) => {
    composer.current = node
    focusComposer()
  }, [focusComposer])
  useEffect(() => { if (requestID) focusComposer() }, [requestID, focusComposer])
  useEffect(() => {
    const receive = (event: Event) => {
      const request = (event as CustomEvent<StoryHelpRequest>).detail
      if (!request || !isStoryHelpStep(request.step) || !(request.source instanceof HTMLElement)) return
      const question = storyHelpQuestion(request.step, locale)
      setPending(prepare(question, request) ? null : { question, request })
      returnFocus.current = request.source
      focusRequested.current = true
      setRequestID(previous => previous + 1)
      open()
    }
    window.addEventListener(storyHelpEvent, receive)
    return () => { window.removeEventListener(storyHelpEvent, receive) }
  }, [locale, prepare, open, focusComposer])
  const addQuestion = () => {
    if (pending && prepare(pending.question, pending.request, true)) setPending(null)
    composer.current?.focus()
  }
  const restoreFocus = () => {
    focusRequested.current = false
    if (returnFocus.current?.isConnected && !returnFocus.current.closest('[hidden]')) {
      returnFocus.current.focus()
      returnFocus.current = null
      return true
    }
    returnFocus.current = null
    return false
  }
  return { pending, addQuestion, composerRef, focusComposer, restoreFocus }
}
