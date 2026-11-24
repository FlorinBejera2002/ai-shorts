import type { useStoryLanguage } from './use-story-language'
import type { RecordingError } from './use-narration-recorder'

type Text = ReturnType<typeof useStoryLanguage>

/** User-facing copy for each recorder or file problem, in the active language. */
export function narrationErrorMessages(text: Text): Record<RecordingError, string> {
  return {
    unsupported: text(
      'Recording is unavailable in this browser. Choose an audio file instead.',
      'Înregistrarea nu este disponibilă în acest browser. Alege un fișier audio.'
    ),
    permission: text(
      'Microphone permission was denied. Allow access in your browser, or choose an audio file.',
      'Accesul la microfon a fost refuzat. Permite accesul din browser sau alege un fișier audio.'
    ),
    device: text(
      'The microphone is unavailable or in use. Check your device, or choose an audio file.',
      'Microfonul nu este disponibil sau este ocupat. Verifică dispozitivul sau alege un fișier audio.'
    ),
    recording: text(
      'Recording stopped unexpectedly. Please record again or choose an audio file.',
      'Înregistrarea s-a oprit neașteptat. Înregistrează din nou sau alege un fișier audio.'
    ),
    empty: text(
      'The audio is empty. Record a longer message or choose another file.',
      'Fișierul audio este gol. Înregistrează un mesaj mai lung sau alege alt fișier.'
    ),
    size: text(
      'Narration must be no larger than 32 MB. Choose a smaller file or record a shorter message.',
      'Narațiunea trebuie să aibă cel mult 32 MB. Alege un fișier mai mic sau înregistrează un mesaj mai scurt.'
    ),
    duration: text(
      'Narration can be up to 3 minutes. Choose a shorter recording.',
      'Narațiunea poate avea cel mult 3 minute. Alege o înregistrare mai scurtă.'
    ),
    format: text(
      'Choose an M4A, MP3, WAV, WebM or Ogg audio file.',
      'Alege un fișier audio M4A, MP3, WAV, WebM sau Ogg.'
    )
  }
}
