const stageDefinitions = [
  ['source_analysis', 'Analiza surselor', 'Identifică subiectele și contextul din cadrele filmărilor.', ['text', 'image'], 'qwen/qwen3.8-omni-flash'],
  ['speech_review', 'Verificarea vorbirii', 'Verifică ce se aude în fragmentele propuse pentru subtitrare.', ['text', 'audio'], 'qwen/qwen3.8-omni-flash'],
  ['highlights', 'Selecția momentelor', 'Alege fragmente relevante din transcriere pentru clipurile scurte.', ['text'], 'openai/gpt-6.1-sol'],
  ['story_planning', 'Planificarea montajului', 'Construiește povestea și ordinea secvențelor.', ['text'], 'openai/gpt-6.1-sol'],
  ['story_review', 'Verificarea planului', 'Evaluează coerența și corecțiile planului de montaj.', ['text'], 'anthropic/claude-sonnet-5.5'],
  ['transitions', 'Deciziile de tranziție', 'Evaluează continuitatea dintre secvențe înainte de randare.', ['text'], 'openai/gpt-6-luna'],
  ['video_review', 'Verificarea video finală', 'Analizează filmarea randată, sunetul și cadrele de la tăieturi.', ['text', 'image', 'audio', 'video'], 'google/gemini-3.8-flash'],
  ['scripts', 'Scenarii', 'Scrie și revizuiește scenarii pentru conținut.', ['text'], 'anthropic/claude-sonnet-5.5'],
  ['assistant', 'Asistent', 'Răspunde în asistentul de creare și editare.', ['text'], 'openai/gpt-6-luna'],
  ['workspace_agent', 'Agentul proiectului', 'Planifică acțiuni și revizuiește propuneri în proiect.', ['text'], 'openai/gpt-6.1-sol'],
  ['studio_editing', 'Studio: editarea compoziției', 'Propune modificări HTML, animații și efecte pentru compoziția din Studio.', ['text'], 'anthropic/claude-sonnet-5.5']
]

const nativeStages = [
  { stage: 'transcription', label: 'Transcriere: clipuri', description: 'Modelul de recunoaștere a vorbirii instalat pe server pentru clipuri.', requiredModalities: ['audio', 'transcription'], provider: 'whisper_cpp', model: 'whisper_cpp:ggml-base.bin:fixture-base' },
  { stage: 'story_transcription', label: 'Transcriere: Story și narațiune', description: 'Modelul instalat pentru transcrierea surselor Story și a narațiunii.', requiredModalities: ['audio', 'transcription'], provider: 'whisper_cpp', model: 'whisper_cpp:ggml-large-v3-turbo.bin:fixture-large' },
  { stage: 'voice_detection', label: 'Detectarea vorbirii', description: 'Identifică intervalele cu voce din sunetul filmării.', requiredModalities: ['audio', 'voice_activity'], provider: 'silero', model: 'silero:ggml-silero-vad.bin:fixture-vad' },
  { stage: 'face_tracking', label: 'Urmărirea fețelor', description: 'Detectează fețele pentru reîncadrarea filmării.', requiredModalities: ['image', 'face_detection'], provider: 'pigo', model: 'pigo:facefinder:fixture-face' },
  { stage: 'studio_background_removal', label: 'Studio: eliminarea fundalului', description: 'U2Net Human Seg este singurul model instalat și suportat în prezent pentru eliminarea fundalului.', requiredModalities: ['image', 'segmentation'], provider: 'u2net_onnx', model: 'u2net_human_seg' }
]

export function createRoutingFixture() {
  return {
    version: 0,
    providers: [{ id: 'openrouter', configured: true }, { id: 'gemini', configured: false }, { id: 'whisper_cpp', configured: true }, { id: 'silero', configured: true }, { id: 'pigo', configured: true }, { id: 'u2net_onnx', configured: true }],
    models: [
      { id: 'qwen/qwen3.8-omni-flash', name: 'Qwen Omni Flash', provider: 'openrouter', inputModalities: ['text', 'image', 'audio', 'video'] },
      { id: 'openai/gpt-6.1-sol', name: 'OpenAI GPT Sol', provider: 'openrouter', inputModalities: ['text', 'image'] },
      { id: 'openai/gpt-6-luna', name: 'OpenAI GPT Luna', provider: 'openrouter', inputModalities: ['text', 'image'] },
      { id: 'anthropic/claude-sonnet-5.5', name: 'Anthropic Claude Sonnet', provider: 'openrouter', inputModalities: ['text', 'image'] },
      { id: 'google/gemini-3.8-flash', name: 'Google Gemini Flash', provider: 'openrouter', inputModalities: ['text', 'image', 'audio', 'video'] },
      { id: 'gemini-3.8-flash', name: 'Gemini Flash (direct)', provider: 'gemini', inputModalities: ['text', 'image', 'audio', 'video'] },
      { id: 'whisper_cpp:ggml-base.bin:fixture-base', name: 'ggml-base.bin', provider: 'whisper_cpp', inputModalities: ['audio', 'transcription'] },
      { id: 'whisper_cpp:ggml-large-v3-turbo.bin:fixture-large', name: 'ggml-large-v3-turbo.bin', provider: 'whisper_cpp', inputModalities: ['audio', 'transcription'] },
      { id: 'silero:ggml-silero-vad.bin:fixture-vad', name: 'ggml-silero-vad.bin', provider: 'silero', inputModalities: ['audio', 'voice_activity'] },
      { id: 'pigo:facefinder:fixture-face', name: 'facefinder', provider: 'pigo', inputModalities: ['image', 'face_detection'] },
      { id: 'u2net_human_seg', name: 'U2Net Human Seg (instalat)', provider: 'u2net_onnx', inputModalities: ['image', 'segmentation'] }
    ],
    routes: [
      ...stageDefinitions.map(([stage, label, description, requiredModalities, model]) => ({
        stage, label, description, requiredModalities, provider: 'openrouter', model, source: 'default'
      })),
      ...nativeStages.map((stage) => ({ ...stage, source: 'default' }))
    ]
  }
}
