import { RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { Pagination } from '../components/pagination'
import { SearchField } from '../components/search-field'
import { StatGrid } from '../components/stat-grid'
import { PageLoader, StatePanel } from '../components/state-panel'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Card } from '../components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select'
import { Table, TableBody, TableCell, TableColumns, TableRow } from '../components/ui/table'
import { dateTimeFormat } from '../lib/format'
import { FeedbackDetailSheet } from './feedback-detail-sheet'
import { type FeedbackItem, type FeedbackKind, type FeedbackList, type FeedbackStatusFilter, feedbackHeadline, kindLabels, statusLabels } from './types'
import { type FeedbackFilters, feedbackPageSize, useFeedbackList } from './use-feedback-list'

const kinds = Object.keys(kindLabels) as FeedbackKind[]

export function FeedbackPage() {
  const [filters, setFilters] = useState<FeedbackFilters>({ query: '', kind: 'all', status: 'open', page: 1 })
  const [selected, setSelected] = useState<FeedbackItem | null>(null)
  const { data, loading, error, reload } = useFeedbackList(filters)
  const update = (next: Partial<FeedbackFilters>) => setFilters((current) => ({ ...current, page: 1, ...next }))

  return (
    <div className="page-content stack" aria-busy={loading}>
      {data && <StatGrid label="Rezumat feedback" stats={[
        { label: 'De rezolvat', value: data.summary.open, alert: data.summary.open > 0 },
        { label: 'Mesaje 7 zile', value: data.summary.lastWeek },
        { label: 'Evaluări 30 zile', value: data.summary.ratingsMonth },
        { label: '% Super', value: data.summary.goodShareMonth },
        { label: '% Slabe', value: data.summary.badShareMonth, alert: data.summary.badShareMonth >= 25 }
      ]} />}
      <div>
        <FeedbackToolbar filters={filters} loading={loading} onChange={update} onReload={() => void reload()} />
        <Card className="table-panel">
          <FeedbackListBody filters={filters} data={data} loading={loading} error={error} onReload={() => void reload()} onOpen={setSelected} />
          <Pagination page={filters.page} total={data?.total ?? 0} pageSize={feedbackPageSize} subject="de mesaje" onPage={(page) => setFilters({ ...filters, page })} />
        </Card>
      </div>
      {selected && <FeedbackDetailSheet item={selected} onClose={() => setSelected(null)} onChanged={() => void reload()} />}
    </div>
  )
}

type ToolbarProps = { filters: FeedbackFilters; loading: boolean; onChange: (next: Partial<FeedbackFilters>) => void; onReload: () => void }

function FeedbackToolbar({ filters, loading, onChange, onReload }: ToolbarProps) {
  return (
    <div className="toolbar">
      <SearchField label="Caută feedback" value={filters.query} onChange={(query) => onChange({ query })} />
      <Select value={filters.status} onValueChange={(status) => onChange({ status: status as FeedbackStatusFilter })}>
        <SelectTrigger aria-label="Starea mesajului" className="w-full sm:w-36"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="open">De rezolvat</SelectItem>
          <SelectItem value="new">{statusLabels.new}</SelectItem>
          <SelectItem value="in_progress">{statusLabels.in_progress}</SelectItem>
          <SelectItem value="resolved">{statusLabels.resolved}</SelectItem>
          <SelectItem value="all">Toate</SelectItem>
        </SelectContent>
      </Select>
      <Select value={filters.kind} onValueChange={(kind) => onChange({ kind: kind as FeedbackFilters['kind'] })}>
        <SelectTrigger aria-label="Tipul mesajului" className="w-full sm:w-40"><SelectValue /></SelectTrigger>
        <SelectContent><SelectItem value="all">Toate tipurile</SelectItem>{kinds.map((kind) => <SelectItem key={kind} value={kind}>{kindLabels[kind]}</SelectItem>)}</SelectContent>
      </Select>
      <Button variant="secondary" size="icon" aria-label="Actualizează feedbackul" className="ml-auto" onClick={onReload} disabled={loading}><RefreshCw /></Button>
    </div>
  )
}

type BodyProps = { filters: FeedbackFilters; data: FeedbackList | null; loading: boolean; error: string; onReload: () => void; onOpen: (item: FeedbackItem) => void }

function FeedbackListBody({ filters, data, loading, error, onReload, onOpen }: BodyProps) {
  if (loading && !data) return <PageLoader compact />
  if (error) return <StatePanel compact role="alert" illustration="loadError" title="Nu am putut încărca datele" message={error} action={<Button variant="secondary" size="sm" onClick={onReload}>Reîncearcă</Button>} />
  if (data && data.items.length > 0) return <FeedbackTable items={data.items} onOpen={onOpen} />
  const filtered = filters.query.trim() !== '' || filters.kind !== 'all' || filters.status !== 'open'
  const empty = filtered
    ? { illustration: 'usersNoResults', title: 'Niciun mesaj găsit' } as const
    : { illustration: 'feedbackEmpty', title: 'Nimic de rezolvat' } as const
  return <StatePanel compact {...empty} />
}

function FeedbackTable({ items, onOpen }: { items: FeedbackItem[]; onOpen: (item: FeedbackItem) => void }) {
  return (
    <Table className="errors-table">
      <TableColumns columns={['Mesaj', 'Utilizator', 'Trimis', '']} />
      <TableBody>{items.map((item) => (
        <TableRow key={item.id}>
          <TableCell>
            <div className="error-cell">
              <Badge variant={item.status === 'resolved' ? 'success' : 'outline'}>{item.status === 'resolved' ? statusLabels.resolved : kindLabels[item.kind]}</Badge>
              <span>{feedbackHeadline(item)}</span>
            </div>
          </TableCell>
          <TableCell className="max-w-56 truncate">{item.userEmail}</TableCell>
          <TableCell className="whitespace-nowrap">{dateTimeFormat.format(new Date(item.createdAt))}</TableCell>
          <TableCell className="text-right"><Button variant="secondary" size="sm" onClick={() => onOpen(item)}>Detalii</Button></TableCell>
        </TableRow>
      ))}</TableBody>
    </Table>
  )
}
