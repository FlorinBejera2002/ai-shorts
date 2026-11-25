import { AlertCircle, RefreshCw } from 'lucide-react'
import type { FormEvent } from 'react'
import { Alert } from '../components/ui/alert'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Skeleton } from '../components/ui/skeleton'
import { RoutingSaveBar } from './routing-save-bar'
import { StageModelCard } from './stage-model-card'
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
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="section-title">Un model potrivit pentru fiecare etapă</h2>
        {configuration && <Badge variant="outline">Versiunea {configuration.version}</Badge>}
      </div>

      {routing.error && (
        <Alert>
          <AlertCircle />
          <div className="grid gap-3">
            <p>{routing.error}</p>
            <Button type="button" variant="secondary" size="sm" className="justify-self-start" disabled={busy} onClick={() => void routing.reload()}>
              <RefreshCw />{routing.requiresReload ? 'Reîncarcă și înlocuiește selecțiile' : 'Reîncearcă încărcarea'}
            </Button>
          </div>
        </Alert>
      )}

      {!configuration && status === 'loading' && (
        <div className="grid gap-4" role="status">
          <span className="sr-only">Se încarcă modelele AI…</span>
          <Skeleton className="h-32 w-full rounded-[var(--card-radius)]" /><Skeleton className="h-32 w-full rounded-[var(--card-radius)]" /><Skeleton className="h-32 w-full rounded-[var(--card-radius)]" />
        </div>
      )}

      {configuration && <>
        {configuration.catalogUnavailable && <Alert><AlertCircle /><div className="grid gap-3"><p>Catalogul modelelor nu este disponibil.</p><Button type="button" variant="secondary" size="sm" className="justify-self-start" disabled={busy} onClick={() => void routing.reload()}>Reîncearcă încărcarea catalogului</Button></div></Alert>}
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
