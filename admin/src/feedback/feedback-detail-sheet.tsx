import { CheckCircle2, Clock3, RotateCcw } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { api } from '../api'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '../components/ui/sheet'
import { dateTimeFormat } from '../lib/format'
import { type FeedbackItem, type FeedbackStatus, categoryLabels, kindLabels, ratingLabels, statusLabels } from './types'

type Props = { item: FeedbackItem; onClose: () => void; onChanged: () => void }

/** Full message with its context, and the status actions an admin triages with. */
export function FeedbackDetailSheet({ item, onClose, onChanged }: Props) {
  const [busy, setBusy] = useState(false)

  async function setStatus(status: FeedbackStatus) {
    setBusy(true)
    try {
      await api.request(`/api/admin/feedback/${item.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) })
      toast.success(statusLabels[status])
      onChanged()
      onClose()
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : 'Modificarea a eșuat')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="drawer feedback-sheet">
        <SheetHeader>
          <SheetTitle>{kindLabels[item.kind]}</SheetTitle>
          <SheetDescription className="break-words">{item.userName ? `${item.userName} · ${item.userEmail}` : item.userEmail}</SheetDescription>
        </SheetHeader>
        {item.message && <blockquote className="feedback-message">{item.message}</blockquote>}
        <dl className="value-list">
          <div><dt>Stare</dt><dd><Badge variant={item.status === 'resolved' ? 'success' : 'outline'}>{statusLabels[item.status]}</Badge></dd></div>
          {item.rating && <div><dt>Evaluare</dt><dd>{ratingLabels[item.rating]}</dd></div>}
          {item.category && <div><dt>Categorie</dt><dd>{categoryLabels[item.category] ?? item.category}</dd></div>}
          <div><dt>Trimis</dt><dd>{dateTimeFormat.format(new Date(item.createdAt))}</dd></div>
          {item.jobId && <div><dt>Job</dt><dd><code>{item.jobId}</code></dd></div>}
          {item.page && <div><dt>Pagină</dt><dd><code>{item.page}</code></dd></div>}
        </dl>
        {item.userAgent && <code className="error-route">{item.userAgent}</code>}
        <div className="feedback-actions">
          {item.status === 'resolved'
            ? <Button variant="secondary" disabled={busy} onClick={() => void setStatus('new')}><RotateCcw /> Redeschide</Button>
            : <>
              {item.status === 'new' && <Button variant="secondary" disabled={busy} onClick={() => void setStatus('in_progress')}><Clock3 /> În lucru</Button>}
              <Button disabled={busy} onClick={() => void setStatus('resolved')}><CheckCircle2 /> Rezolvă</Button>
            </>}
        </div>
      </SheetContent>
    </Sheet>
  )
}
