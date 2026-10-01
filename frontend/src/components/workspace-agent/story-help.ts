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
    story_audio: ['How do I choose between the sound from my clips and my own narration?', 'Cum aleg între sunetul filmărilor și propria narațiune?'],
    style: ['How should I choose the length, shape and captions for my story?', 'Cum aleg durata, formatul și subtitrările pentru poveste?'],
    review: ['What should I check before creating my story, and when are credits charged?', 'Ce trebuie să verific înainte să creez povestea și când se consumă creditele?']
  }
  return questions[step][locale === 'ro' ? 1 : 0]
}
