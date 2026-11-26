export const agentMessages = {
  en: {
    title: 'Ana & Radu', subtitle: 'Your workspace, in conversation', open: 'Open Ana & Radu', close: 'Collapse agent', closePanel: 'Close', follow: 'Follow AI navigation',
    bubble: 'Hi! How can we help?', dismissBubble: 'Hide message', composerLabel: 'Message to Ana & Radu',
    placeholder: 'What would you like to create or change?', send: 'Send', retry: 'Retry request', older: 'Load earlier messages', suggestions: 'Suggested next steps', doIt: 'Do it', explain: 'Explain', dismiss: 'Dismiss',
    approve: 'Approve action', reject: 'Reject', pause: 'Pause', resume: 'Resume', stop: 'Stop', result: 'View result', upload: 'Add media in Create',
    empty: 'What would you like to work on?', loading: 'Loading conversation…', error: 'Could not connect. Please try again.', unverifiedResponse: 'The operation response could not be verified. Retry to recover its current state.',
    credits: 'credits', confirmation: 'Review this action before approving.', missing: 'Resources needed', context: 'Current page', width: 'Agent panel width',
    dictate: 'Start dictation', endDictation: 'Stop dictation', speechUnavailable: 'Dictation is unavailable in this browser. You can type your message.', speechError: 'Dictation stopped. Check microphone access or type your message.', speechHint: 'Dictation uses your browser’s speech service. Nothing is sent to the agent until you press Send.',
    statuses: { planning: 'Planning', running: 'Working', waiting_for_confirmation: 'Needs approval', waiting_for_resources: 'Needs resources', paused: 'Paused', cancel_requested: 'Stopping', cancelled: 'Stopped', completed: 'Completed', failed: 'Failed' }
  },
  ro: {
    title: 'Ana și Radu', subtitle: 'Spațiul tău de lucru, prin conversație', open: 'Deschide Ana și Radu', close: 'Restrânge agentul', closePanel: 'Închide', follow: 'Urmărește navigarea AI',
    bubble: 'Salut! Cu ce te ajutăm?', dismissBubble: 'Ascunde mesajul', composerLabel: 'Mesaj pentru Ana și Radu',
    placeholder: 'Ce vrei să creezi sau să modifici?', send: 'Trimite', retry: 'Reîncearcă cererea', older: 'Încarcă mesajele anterioare', suggestions: 'Pași recomandați', doIt: 'Fă asta', explain: 'Explică', dismiss: 'Ascunde',
    approve: 'Aprobă acțiunea', reject: 'Respinge', pause: 'Pauză', resume: 'Continuă', stop: 'Oprește', result: 'Vezi rezultatul', upload: 'Adaugă media în Creează',
    empty: 'La ce vrei să lucrăm?', loading: 'Se încarcă conversația…', error: 'Conectarea a eșuat. Încearcă din nou.', unverifiedResponse: 'Răspunsul operațiunii nu a putut fi verificat. Reîncearcă pentru a recupera starea actuală.',
    credits: 'credite', confirmation: 'Verifică acțiunea înainte de aprobare.', missing: 'Resurse necesare', context: 'Pagina curentă', width: 'Lățimea panoului agentului',
    dictate: 'Pornește dictarea', endDictation: 'Oprește dictarea', speechUnavailable: 'Dictarea nu este disponibilă în acest browser. Poți scrie mesajul.', speechError: 'Dictarea s-a oprit. Verifică accesul la microfon sau scrie mesajul.', speechHint: 'Dictarea folosește serviciul de voce al browserului. Mesajul ajunge la agent doar când apeși Trimite.',
    statuses: { planning: 'Planifică', running: 'În lucru', waiting_for_confirmation: 'Așteaptă aprobarea', waiting_for_resources: 'Așteaptă resurse', paused: 'În pauză', cancel_requested: 'Se oprește', cancelled: 'Oprit', completed: 'Finalizat', failed: 'Eșuat' }
  },
  es: {
    title: 'Ana y Radu', subtitle: 'Tu espacio de trabajo, en conversación', open: 'Abrir Ana y Radu', close: 'Contraer agente', closePanel: 'Cerrar', follow: 'Seguir la navegación con IA',
    bubble: '¡Hola! ¿En qué te ayudamos?', dismissBubble: 'Ocultar mensaje', composerLabel: 'Mensaje para Ana y Radu',
    placeholder: '¿Qué quieres crear o cambiar?', send: 'Enviar', retry: 'Reintentar solicitud', older: 'Cargar mensajes anteriores', suggestions: 'Próximos pasos sugeridos', doIt: 'Hazlo', explain: 'Explicar', dismiss: 'Descartar',
    approve: 'Aprobar acción', reject: 'Rechazar', pause: 'Pausar', resume: 'Reanudar', stop: 'Detener', result: 'Ver resultado', upload: 'Añadir medios en Crear',
    empty: '¿En qué quieres trabajar?', loading: 'Cargando conversación…', error: 'No se pudo conectar. Inténtalo de nuevo.', unverifiedResponse: 'No se pudo verificar la respuesta de la operación. Reintenta para recuperar el estado actual.',
    credits: 'créditos', confirmation: 'Revisa esta acción antes de aprobarla.', missing: 'Recursos necesarios', context: 'Página actual', width: 'Ancho del panel del agente',
    dictate: 'Iniciar dictado', endDictation: 'Detener dictado', speechUnavailable: 'El dictado no está disponible en este navegador. Puedes escribir tu mensaje.', speechError: 'El dictado se detuvo. Revisa el acceso al micrófono o escribe tu mensaje.', speechHint: 'El dictado usa el servicio de voz de tu navegador. No se envía nada al agente hasta que pulsas Enviar.',
    statuses: { planning: 'Planificando', running: 'Trabajando', waiting_for_confirmation: 'Requiere aprobación', waiting_for_resources: 'Requiere recursos', paused: 'En pausa', cancel_requested: 'Deteniendo', cancelled: 'Detenido', completed: 'Completado', failed: 'Fallido' }
  }
}
export type AgentMessages = typeof agentMessages.en
