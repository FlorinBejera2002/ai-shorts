export const agentMessages = {
  en: {
    title: 'Workspace Agent', subtitle: 'Your workspace, in conversation', open: 'Open Workspace Agent', close: 'Collapse agent', follow: 'Follow AI navigation',
    placeholder: 'What would you like to create or change?', send: 'Send', retry: 'Retry request', older: 'Load earlier messages', suggestions: 'Suggested next steps', doIt: 'Do it', explain: 'Explain', dismiss: 'Dismiss',
    approve: 'Approve action', reject: 'Reject', pause: 'Pause', resume: 'Resume', stop: 'Stop', result: 'View result', upload: 'Add media in Create',
    empty: 'Tell me what you want to achieve. Actions and their results appear here, so you stay in control.', loading: 'Loading conversation…', error: 'Could not connect. Please try again.',
    credits: 'credits', confirmation: 'Review this action before approving.', missing: 'Resources needed', context: 'Current page', width: 'Agent panel width',
    dictate: 'Start dictation', endDictation: 'Stop dictation', speechUnavailable: 'Dictation is unavailable in this browser. You can type your message.', speechError: 'Dictation stopped. Check microphone access or type your message.', speechHint: 'Dictation uses your browser’s speech service. Nothing is sent to the agent until you press Send.',
    statuses: { planning: 'Planning', running: 'Working', waiting_for_confirmation: 'Needs approval', waiting_for_resources: 'Needs resources', paused: 'Paused', cancel_requested: 'Stopping', cancelled: 'Stopped', completed: 'Completed', failed: 'Failed' }
  },
  ro: {
    title: 'Workspace Agent', subtitle: 'Spațiul tău de lucru, prin conversație', open: 'Deschide Workspace Agent', close: 'Restrânge agentul', follow: 'Urmărește navigarea AI',
    placeholder: 'Ce vrei să creezi sau să modifici?', send: 'Trimite', retry: 'Reîncearcă cererea', older: 'Încarcă mesajele anterioare', suggestions: 'Pași recomandați', doIt: 'Fă asta', explain: 'Explică', dismiss: 'Ascunde',
    approve: 'Aprobă acțiunea', reject: 'Respinge', pause: 'Pauză', resume: 'Continuă', stop: 'Oprește', result: 'Vezi rezultatul', upload: 'Adaugă media în Creează',
    empty: 'Spune-mi ce vrei să obții. Acțiunile și rezultatele apar aici, iar tu păstrezi controlul.', loading: 'Se încarcă conversația…', error: 'Conectarea a eșuat. Încearcă din nou.',
    credits: 'credite', confirmation: 'Verifică acțiunea înainte de aprobare.', missing: 'Resurse necesare', context: 'Pagina curentă', width: 'Lățimea panoului agentului',
    dictate: 'Pornește dictarea', endDictation: 'Oprește dictarea', speechUnavailable: 'Dictarea nu este disponibilă în acest browser. Poți scrie mesajul.', speechError: 'Dictarea s-a oprit. Verifică accesul la microfon sau scrie mesajul.', speechHint: 'Dictarea folosește serviciul de voce al browserului. Mesajul ajunge la agent doar când apeși Trimite.',
    statuses: { planning: 'Planifică', running: 'În lucru', waiting_for_confirmation: 'Așteaptă aprobarea', waiting_for_resources: 'Așteaptă resurse', paused: 'În pauză', cancel_requested: 'Se oprește', cancelled: 'Oprit', completed: 'Finalizat', failed: 'Eșuat' }
  }
}
export type AgentMessages = typeof agentMessages.en
