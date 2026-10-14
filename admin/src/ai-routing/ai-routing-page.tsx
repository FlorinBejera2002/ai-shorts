import { AlertCircle, RefreshCw } from 'lucide-react'
import type { FormEvent } from 'react'
import { Alert } from '../components/ui/alert'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Skeleton } from '../components/ui/skeleton'
import { RoutingSaveBar } from './routing-save-bar'
import { StageModelCard } from './stage-model-card'
import { providerLabel } from './types'
import { useAiRouting } from './use-ai-routing'

export function AiRoutingPage() {
  const routing = useAiRouting()
  const { configuration, status } = routing
  const busy = status !== 'ready'

  function submit(event: FormEvent) {
    event.preventDefault()
    void routing.save()
  }

  return (
    <div className="page-content grid gap-5" aria-busy={busy}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl">
          <h2 className="text-lg font-semibold">Un model potrivit pentru fiecare etapă</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">Alege separat modelele pentru analiză, poveste și verificare. Modificările salvate se aplică următoarelor apeluri AI, fără restart.</p>
        </div>
        {configuration && <Badge variant="outline">Versiunea {configuration.version}</Badge>}
      </div>

      {routing.error && (
        <Alert>
          <AlertCircle />
          <div className="grid gap-3">
            <p>{routing.error}</p>
            <Button type="button" variant="outline" size="sm" className="justify-self-start" disabled={busy} onClick={() => void routing.reload()}>
              <RefreshCw />{routing.requiresReload ? 'Reîncarcă și înlocuiește selecțiile' : 'Reîncearcă încărcarea'}
            </Button>
          </div>
        </Alert>
      )}

      {!configuration && status === 'loading' && (
        <div className="grid gap-4" role="status">
          <span className="sr-only">Se încarcă modelele AI…</span>
          <Skeleton className="h-28 w-full" /><Skeleton className="h-28 w-full" /><Skeleton className="h-28 w-full" />
        </div>
      )}

      {configuration && <>
        <div className="flex flex-wrap gap-2" aria-label="Furnizori disponibili">
          {configuration.providers.map((provider) => <Badge key={provider.id} variant="outline">{providerLabel(provider.id)} · {provider.configured ? 'configurat' : 'neconfigurat'}</Badge>)}
        </div>
        {configuration.catalogUnavailable && <Alert><AlertCircle /><div className="grid gap-3"><p>Catalogul modelelor nu este disponibil. Configurația curentă este afișată, iar salvarea rămâne oprită până la verificarea compatibilității.</p><Button type="button" variant="outline" size="sm" className="justify-self-start" disabled={busy} onClick={() => void routing.reload()}>Reîncearcă încărcarea catalogului</Button></div></Alert>}
        <form className="grid gap-5" onSubmit={submit}>
          <div className="grid gap-3">
            {configuration.routes.map((stage) => (
              <StageModelCard key={stage.stage} stage={stage} route={routing.draft[stage.stage]} configuration={configuration}
                disabled={busy || routing.requiresReload || !!configuration.catalogUnavailable}
                onChange={(route) => routing.setRoute(stage.stage, route)} />
            ))}
          </div>
          <RoutingSaveBar routing={routing} />
        </form>
      </>}
    </div>
  )
}
