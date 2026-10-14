import { Check, Save } from 'lucide-react'
import { Button } from '../components/ui/button'
import { Card } from '../components/ui/card'
import { Label } from '../components/ui/label'
import { Textarea } from '../components/ui/textarea'
import type { useAiRouting } from './use-ai-routing'

type Props = { routing: ReturnType<typeof useAiRouting> }

export function RoutingSaveBar({ routing }: Props) {
  const { changedCount, status } = routing
  const busy = status !== 'ready'
  const summary = changedCount > 0
    ? `${changedCount} ${changedCount === 1 ? 'etapă modificată' : 'etape modificate'} · nesalvat`
    : 'Configurația curentă · nicio modificare'

  return (
    <Card className="grid gap-4 p-5">
      <div className="grid gap-2">
        <Label htmlFor="routing-reason">Motivul modificării</Label>
        <Textarea id="routing-reason" value={routing.reason} onChange={(event) => routing.setReason(event.target.value)}
          placeholder="De exemplu: comparăm calitatea selecției momentelor pe filmări în română."
          minLength={5} maxLength={500} required disabled={busy || routing.requiresReload} aria-describedby="routing-reason-help" />
        <p id="routing-reason-help" className="text-xs text-muted-foreground">5–500 de caractere. Modificarea și motivul sunt înregistrate în jurnalul de audit.</p>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
        <p className="text-sm text-muted-foreground" role="status">
          {routing.saved ? <span className="inline-flex items-center gap-2"><Check className="size-4" />Configurația a fost salvată și verificată.</span> : summary}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" disabled={busy || !changedCount || routing.requiresReload} onClick={routing.reset}>Renunță la modificări</Button>
          <Button type="submit" disabled={!routing.canSave}><Save />{status === 'saving' ? 'Se salvează…' : 'Salvează modelele'}</Button>
        </div>
      </div>
      {changedCount > 0 && !routing.validRoutes && <p className="text-xs text-destructive">Pentru salvare, fiecare etapă trebuie să aibă un model compatibil și un furnizor configurat.</p>}
    </Card>
  )
}
