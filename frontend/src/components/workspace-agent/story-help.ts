import type { SiteLocale } from '@/lib/site-config'

export type StoryHelpStep = 'footage' | 'story_audio' | 'style' | 'review'
export type StoryHelpRequest = { step: StoryHelpStep; source: HTMLElement }
export const storyHelpEvent = 'sneepcut:story-agent-help'

export function isStoryHelpStep(value: unknown): value is StoryHelpStep {
  return typeof value === 'string' && ['footage', 'story_audio', 'style', 'review'].includes(value)
}

const STORY_HELP_QUESTIONS: Record<StoryHelpStep, Record<SiteLocale, string>> = {
  footage: {
    en: 'Which footage should I add, and how do clip preferences work?',
    ro: 'Ce filmări să adaug și cum funcționează preferințele pentru clipuri?',
    es: '¿Qué material debo añadir y cómo funcionan las preferencias de clips?'
  },
  story_audio: {
    en: 'How do I describe the edit I want and choose between original audio and my own narration?',
    ro: 'Cum descriu montajul dorit și aleg între sunetul original și propria narațiune?',
    es: '¿Cómo describo el montaje que quiero y elijo entre el audio original y mi propia narración?'
  },
  style: {
    en: 'Which caption mode should I use, and where do I change format or length?',
    ro: 'Ce mod de subtitrare să folosesc și unde schimb formatul sau durata?',
    es: '¿Qué modo de subtítulos debo usar y dónde cambio el formato o la duración?'
  },
  review: {
    en: 'What should I check before creating my clip, and when are credits charged?',
    ro: 'Ce trebuie să verific înainte să creez clipul și când se consumă creditele?',
    es: '¿Qué debo revisar antes de crear mi clip y cuándo se cobran los créditos?'
  }
}

export function storyHelpQuestion(step: StoryHelpStep, locale: SiteLocale) {
  return STORY_HELP_QUESTIONS[step][locale]
}
