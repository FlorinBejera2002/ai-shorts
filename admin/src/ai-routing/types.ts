export type ModelRoute = { provider: string; model: string }

export type RoutingStage = ModelRoute & {
  stage: string
  label: string
  description: string
  requiredModalities: string[]
  source: 'default' | 'override'
}

export type RoutingModel = {
  id: string
  name: string
  provider: string
  inputModalities: string[]
}

export type RoutingConfiguration = {
  version: number
  routes: RoutingStage[]
  models: RoutingModel[]
  providers: { id: string; configured: boolean }[]
  catalogUnavailable?: boolean
}

export function supportsStage(model: RoutingModel, stage: RoutingStage) {
  const supportedModalities = new Set(model.inputModalities)
  return stage.requiredModalities.every((modality) => supportedModalities.has(modality))
}

export function routesEqual(first: ModelRoute, second: ModelRoute) {
  return first.provider === second.provider && first.model === second.model
}

export function providerLabel(provider: string) {
  const labels: Record<string, string> = {
    openrouter: 'OpenRouter', gemini: 'Google Gemini', whisper_cpp: 'Whisper local', silero: 'Silero VAD', pigo: 'Pigo', u2net_onnx: 'U2Net local'
  }
  return labels[provider] ?? provider
}

export function modalityLabel(modality: string) {
  const labels: Record<string, string> = {
    image: 'imagini', transcription: 'transcriere', voice_activity: 'detectarea vocii', face_detection: 'detectarea fețelor', segmentation: 'segmentarea imaginii'
  }
  return labels[modality] ?? modality
}
