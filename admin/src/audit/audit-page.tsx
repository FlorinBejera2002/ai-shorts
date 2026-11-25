import { useEffect, useState } from 'react'
import { api } from '../api'
import { PageLoader, StatePanel } from '../components/state-panel'
import { Card } from '../components/ui/card'
import { dateTimeFormat } from '../lib/format'

type AuditEvent = {
  id: number
  actorEmail: string
  targetEmail: string | null
  action: string
  reason: string
  createdAt: string
}

const actionLabels: Record<string, string> = {
  adjust_credits: 'Credite ajustate',
  set_role: 'Rol modificat',
  set_status: 'Status modificat',
  set_ai_routing: 'Modele AI modificate'
}

export function AuditPage() {
  const [items, setItems] = useState<AuditEvent[] | null>(null)
  const [error, setError] = useState('')
  useEffect(() => { void api.request<{ items: AuditEvent[] }>('/api/admin/audit?limit=100').then((v) => setItems(v.items)).catch((e: Error) => setError(e.message)) }, [])

  return (
    <div className="page-content">
      <Card className="audit-list">
        {error ? <StatePanel illustration="loadError" title="Nu am putut încărca datele" message={error} role="alert" />
          : !items ? <PageLoader />
          : items.length === 0 ? <StatePanel illustration="auditEmpty" title="Nicio intervenție" />
          : items.map((item) => <AuditEntry key={item.id} item={item} />)}
      </Card>
    </div>
  )
}

function AuditEntry({ item }: { item: AuditEvent }) {
  const target = item.action === 'set_ai_routing' && item.targetEmail === null ? 'Platformă' : item.targetEmail ?? 'Cont șters'
  return (
    <article className="audit-entry">
      <div className="audit-title"><strong>{actionLabels[item.action] ?? item.action}</strong><time dateTime={item.createdAt}>{dateTimeFormat.format(new Date(item.createdAt))}</time></div>
      <p>{item.actorEmail} → {target}</p>
      <blockquote>{item.reason}</blockquote>
    </article>
  )
}
