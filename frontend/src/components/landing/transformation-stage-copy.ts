import type { SiteLocale } from '@/lib/site-config'

export type TransformationStageCopy = {
  editor: string
  videoCaption: string
  clipCaptions: string[]
  aria: string
  replay: string
  source: string
  tracked: string
  transcript: string
  selections: string
  found: string
  ready: string
  highlight: string
  phases: string[]
}

export const TRANSFORMATION_STAGE_COPY: Record<SiteLocale, TransformationStageCopy> = {
  en: {
    editor: 'Sneep Cut AI editor',
    videoCaption: 'The moment everything finally clicked',
    clipCaptions: ['THIS CHANGES EVERYTHING', 'THE PART NOBODY TELLS YOU', 'SAVE THIS FOR LATER'],
    aria: 'Animated Sneep Cut product workflow',
    replay: 'Replay',
    source: 'Source',
    tracked: 'Speaker tracked',
    transcript: 'Transcript analyzed',
    selections: 'AI selections',
    found: '3 clips found',
    ready: 'Ready',
    highlight: 'Highlight',
    phases: [
      'Reading video context…',
      'Detecting strongest moments…',
      'Reframing and adding captions…',
      'Clips ready to review'
    ]
  },
  ro: {
    editor: 'Editor AI Sneep Cut',
    videoCaption: 'Momentul în care totul a devenit clar',
    clipCaptions: [
      'ASTA SCHIMBĂ TOT',
      'PARTEA PE CARE NU ȚI-O SPUNE NIMENI',
      'SALVEAZĂ PENTRU MAI TÂRZIU'
    ],
    aria: 'Demonstrație animată a fluxului Sneep Cut',
    replay: 'Reia',
    source: 'Sursă',
    tracked: 'Vorbitor urmărit',
    transcript: 'Transcriere analizată',
    selections: 'Selecții AI',
    found: '3 clipuri găsite',
    ready: 'Gata',
    highlight: 'Moment',
    phases: [
      'Analizăm contextul video…',
      'Detectăm cele mai bune momente…',
      'Adaptăm cadrul și adăugăm subtitrări…',
      'Clipurile sunt gata de verificat'
    ]
  },
  es: {
    editor: 'Editor IA de Sneep Cut',
    videoCaption: 'El momento en que todo encajó',
    clipCaptions: ['ESTO LO CAMBIA TODO', 'LA PARTE QUE NADIE TE CUENTA', 'GUÁRDALO PARA DESPUÉS'],
    aria: 'Demostración animada del flujo de Sneep Cut',
    replay: 'Repetir',
    source: 'Fuente',
    tracked: 'Hablante seguido',
    transcript: 'Transcripción analizada',
    selections: 'Selecciones de IA',
    found: '3 clips encontrados',
    ready: 'Listo',
    highlight: 'Momento',
    phases: [
      'Analizando el contexto del video…',
      'Detectando los mejores momentos…',
      'Ajustando el encuadre y añadiendo subtítulos…',
      'Los clips están listos para revisar'
    ]
  }
}
