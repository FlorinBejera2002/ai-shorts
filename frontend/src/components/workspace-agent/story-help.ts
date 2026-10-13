export type StoryHelpStep = 'footage' | 'story_audio' | 'style' | 'review'
export type StoryHelpRequest = { step: StoryHelpStep; source: HTMLElement }
export const storyHelpEvent = 'sneepcut:story-agent-help'

export function isStoryHelpStep(value: unknown): value is StoryHelpStep {
  return typeof value === 'string' && ['footage', 'story_audio', 'style', 'review'].includes(value)
}

export function requestStoryAgentHelp(step: StoryHelpStep, source: HTMLElement) {
  if (!isStoryHelpStep(step) || !source.isConnected || source.closest('[hidden]')) return
  window.dispatchEvent(new CustomEvent<StoryHelpRequest>(storyHelpEvent, { detail: { step, source } }))
}

export function storyHelpQuestion(step: StoryHelpStep, locale: string) {
  const questions = {
    footage: ['Which clips should I add to my story, and how do clip preferences work?', 'Ce filmări să adaug în poveste și cum funcționează preferințele pentru clipuri?'],
    story_audio: ['How do I describe the edit I want and choose between original audio and my own narration?', 'Cum descriu montajul dorit și aleg între sunetul original și propria narațiune?'],
    style: ['Which caption mode should I use, and where do I change format or length?', 'Ce mod de subtitrare să folosesc și unde schimb formatul sau durata?'],
    review: ['What should I check before creating my story, and when are credits charged?', 'Ce trebuie să verific înainte să creez povestea și când se consumă creditele?']
  }
  return questions[step][locale === 'ro' ? 1 : 0]
}
