import { CheckCircle2, RotateCcw } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { api } from '../api'
import { PageLoader, StatePanel } from '../components/state-panel'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '../components/ui/sheet'
import { dateTimeFormat, numberFormat } from '../lib/format'
import { type ErrorDetail, type ErrorEvent, sourceLabels } from './types'

type Props = { id: number; onClose: () => void; onChanged: () => void }

export function ErrorDetailSheet({ id, onClose, onChanged }: Props) {
  const [detail, setDetail] = useState<ErrorDetail | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let live = true
    api.request<ErrorDetail>(`/api/admin/errors/${id}`)
      .then((value) => live && setDetail(value))
      .catch((reason: Error) => live && setError(reason.message))
    return () => { live = false }
  }, [id])

  async function setResolved(resolved: boolean) {
    setBusy(true)
    try {
      await api.request(`/api/admin/errors/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ resolved }) })
      toast.success(resolved ? 'Marcată rezolvată' : 'Redeschisă')
      onChanged()
      onClose()
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : 'Modificarea a eșuat')
    } finally {
      setBusy(false)
    }
  }

  const group = detail?.group
  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="drawer error-sheet">
        <SheetHeader>
          <SheetTitle className="break-words">{group?.message ?? 'Eroare'}</SheetTitle>
          <SheetDescription>{group ? sourceLabels[group.source] : 'Se încarcă…'}</SheetDescription>
        </SheetHeader>
        {error ? <StatePanel compact role="alert" illustration="loadError" title="Nu am putut încărca datele" message={error} />
          : !group ? <PageLoader compact />
          : <>
            {group.route && <code className="error-route">{group.route}</code>}
            <dl className="value-list">
              <div><dt>Apariții</dt><dd>{numberFormat.format(group.occurrences)}</dd></div>
              <div><dt>Ultima dată</dt><dd>{dateTimeFormat.format(new Date(group.lastSeenAt))}</dd></div>
            </dl>
            {group.resolvedAt
              ? <Button variant="secondary" className="w-full" disabled={busy} onClick={() => void setResolved(false)}><RotateCcw /> Redeschide</Button>
              : <Button className="w-full" disabled={busy} onClick={() => void setResolved(true)}><CheckCircle2 /> Rezolvă</Button>}
            <ol className="error-events">{detail.events.map((event) => <ErrorEventItem key={event.id} event={event} />)}</ol>
          </>}
      </SheetContent>
    </Sheet>
  )
}

function ErrorEventItem({ event }: { event: ErrorEvent }) {
  const where = event.context.page || event.context.status
  return (
    <li>
      <div className="error-event-head">
        <time dateTime={event.occurredAt}>{dateTimeFormat.format(new Date(event.occurredAt))}</time>
        {event.occurrences > 1 && <Badge variant="outline">×{numberFormat.format(event.occurrences)}</Badge>}
      </div>
      {where && <p className="error-event-where">{where}</p>}
      {event.detail && <pre>{event.detail}</pre>}
    </li>
  )
}
