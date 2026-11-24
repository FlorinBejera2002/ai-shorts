import { Badge } from '../components/ui/badge'
import { Card } from '../components/ui/card'
import { Label } from '../components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select'
import { providerLabel, routesEqual, supportsStage, type ModelRoute, type RoutingConfiguration, type RoutingStage } from './types'

type Props = {
  stage: RoutingStage
  route: ModelRoute
  configuration: RoutingConfiguration
  disabled: boolean
  onChange: (route: ModelRoute) => void
}

export function StageModelCard({ stage, route, configuration, disabled, onChange }: Props) {
  const eligibleModels = configuration.models.filter((model) => supportsStage(model, stage))
  const compatibleModels = eligibleModels.filter((model) => model.provider === route.provider)
  const compatibleProviderIds = new Set(eligibleModels.map((model) => model.provider))
  const compatibleProviders = configuration.providers.filter((provider) => compatibleProviderIds.has(provider.id) || provider.id === route.provider)
  const selectedModel = compatibleModels.find((model) => model.id === route.model)
  const providerConfigured = configuration.providers.some((provider) => provider.id === route.provider && provider.configured)
  const changed = !routesEqual(stage, route)
  const providerId = `provider-${stage.stage}`
  const modelId = `model-${stage.stage}`

  function changeProvider(provider: string) {
    const model = eligibleModels.find((candidate) => candidate.provider === provider)
    onChange({ provider, model: model?.id ?? '' })
  }

  return (
    <Card className="grid gap-4 px-6 py-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]" aria-labelledby={`stage-${stage.stage}`}>
      <div className="flex min-w-0 flex-wrap items-center gap-2 self-center">
        <h2 id={`stage-${stage.stage}`} className="text-base font-semibold tracking-[-0.01em]">{stage.label}</h2>
        {changed && <Badge>Nesalvat</Badge>}
      </div>
      <div className="grid content-start gap-3">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,.7fr)_minmax(0,1.3fr)]">
          <div className="grid min-w-0 gap-2">
            <Label htmlFor={providerId}>Furnizor</Label>
            <Select value={route.provider} onValueChange={changeProvider} disabled={disabled}>
              <SelectTrigger id={providerId} aria-label={`Furnizor: ${stage.label}`}><SelectValue /></SelectTrigger>
              <SelectContent>
                {!configuration.providers.some((provider) => provider.id === route.provider) && <SelectItem value={route.provider} disabled>{providerLabel(route.provider)} · indisponibil</SelectItem>}
                {compatibleProviders.map((provider) => (
                  <SelectItem key={provider.id} value={provider.id} disabled={!provider.configured || !compatibleProviderIds.has(provider.id)}>
                    {providerLabel(provider.id)}{!provider.configured ? ' · neconfigurat' : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid min-w-0 gap-2">
            <Label htmlFor={modelId}>Model</Label>
            <Select value={route.model} onValueChange={(model) => onChange({ ...route, model })} disabled={disabled || !providerConfigured || compatibleModels.length === 0}>
              <SelectTrigger id={modelId} aria-label={`Model: ${stage.label}`}><SelectValue placeholder="Niciun model compatibil" /></SelectTrigger>
              <SelectContent>
                {route.model && !selectedModel && <SelectItem value={route.model} disabled>{route.model} · neverificat</SelectItem>}
                {compatibleModels.map((model) => <SelectItem key={model.id} value={model.id}>{model.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        {!providerConfigured ? <p className="text-xs text-destructive">Furnizor indisponibil.</p>
          : !selectedModel && <p className="text-xs text-destructive">Alege un model compatibil.</p>}
      </div>
    </Card>
  )
}
