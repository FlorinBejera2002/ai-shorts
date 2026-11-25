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
import { dateTimeFormat, numberFormat } from '../lib/format'
import { ErrorDetailSheet } from './error-detail-sheet'
import { type ErrorGroup, type ErrorList, type ErrorSource, type ErrorState, sourceLabels } from './types'
import { type ErrorFilters, errorPageSize, useErrorList } from './use-error-list'

const sources = Object.keys(sourceLabels) as ErrorSource[]

export function ErrorsPage() {
  const [filters, setFilters] = useState<ErrorFilters>({ query: '', source: 'all', state: 'open', page: 1 })
  const [selected, setSelected] = useState<number | null>(null)
  const { data, loading, error, reload } = useErrorList(filters)
  const update = (next: Partial<ErrorFilters>) => setFilters((current) => ({ ...current, page: 1, ...next }))

  return (
    <div className="page-content stack" aria-busy={loading}>
      {data && <StatGrid label="Rezumat erori" stats={[
        { label: 'Deschise', value: data.summary.open, alert: data.summary.open > 0 },
        { label: 'Apariții 24 h', value: data.summary.lastDay },
        { label: 'Noi 24 h', value: data.summary.newLastDay }
      ]} />}
      <div>
        <ErrorToolbar filters={filters} loading={loading} onChange={update} onReload={() => void reload()} />
        <Card className="table-panel">
          <ErrorListBody filters={filters} data={data} loading={loading} error={error} onReload={() => void reload()} onOpen={setSelected} />
          <Pagination page={filters.page} total={data?.total ?? 0} pageSize={errorPageSize} subject="de erori" onPage={(page) => setFilters({ ...filters, page })} />
        </Card>
      </div>
      {selected !== null && <ErrorDetailSheet id={selected} onClose={() => setSelected(null)} onChanged={() => void reload()} />}
    </div>
  )
}

type ToolbarProps = { filters: ErrorFilters; loading: boolean; onChange: (next: Partial<ErrorFilters>) => void; onReload: () => void }

function ErrorToolbar({ filters, loading, onChange, onReload }: ToolbarProps) {
  return (
    <div className="toolbar">
      <SearchField label="Caută erori" value={filters.query} onChange={(query) => onChange({ query })} />
      <Select value={filters.state} onValueChange={(state) => onChange({ state: state as ErrorState })}>
        <SelectTrigger aria-label="Starea erorii" className="w-full sm:w-36"><SelectValue /></SelectTrigger>
        <SelectContent><SelectItem value="open">Deschise</SelectItem><SelectItem value="resolved">Rezolvate</SelectItem><SelectItem value="all">Toate</SelectItem></SelectContent>
      </Select>
      <Select value={filters.source} onValueChange={(source) => onChange({ source: source as ErrorFilters['source'] })}>
        <SelectTrigger aria-label="Sursa erorii" className="w-full sm:w-40"><SelectValue /></SelectTrigger>
        <SelectContent><SelectItem value="all">Toate sursele</SelectItem>{sources.map((source) => <SelectItem key={source} value={source}>{sourceLabels[source]}</SelectItem>)}</SelectContent>
      </Select>
      <Button variant="secondary" size="icon" aria-label="Actualizează erorile" className="ml-auto" onClick={onReload} disabled={loading}><RefreshCw /></Button>
    </div>
  )
}

type BodyProps = { filters: ErrorFilters; data: ErrorList | null; loading: boolean; error: string; onReload: () => void; onOpen: (id: number) => void }

function ErrorListBody({ filters, data, loading, error, onReload, onOpen }: BodyProps) {
  if (loading && !data) return <PageLoader compact />
  if (error) return <StatePanel compact role="alert" illustration="loadError" title="Nu am putut încărca datele" message={error} action={<Button variant="secondary" size="sm" onClick={onReload}>Reîncearcă</Button>} />
  if (data && data.items.length > 0) return <ErrorTable items={data.items} onOpen={onOpen} />
  const filtered = filters.query.trim() !== '' || filters.source !== 'all' || filters.state !== 'open'
  const empty = filtered
    ? { illustration: 'usersNoResults', title: 'Nicio eroare găsită' } as const
    : { illustration: 'auditEmpty', title: 'Nicio eroare deschisă' } as const
  return <StatePanel compact {...empty} />
}

function ErrorTable({ items, onOpen }: { items: ErrorGroup[]; onOpen: (id: number) => void }) {
  return (
    <Table className="errors-table">
      <TableColumns columns={['Eroare', 'Apariții', 'Ultima dată', '']} />
      <TableBody>{items.map((item) => (
        <TableRow key={item.id}>
          <TableCell>
            <div className="error-cell">
              <Badge variant={item.resolvedAt ? 'success' : 'outline'}>{item.resolvedAt ? 'Rezolvată' : sourceLabels[item.source]}</Badge>
              <span>{item.message}</span>
            </div>
          </TableCell>
          <TableCell className="tabular-nums">{numberFormat.format(item.occurrences)}</TableCell>
          <TableCell className="whitespace-nowrap">{dateTimeFormat.format(new Date(item.lastSeenAt))}</TableCell>
          <TableCell className="text-right"><Button variant="secondary" size="sm" onClick={() => onOpen(item.id)}>Detalii</Button></TableCell>
        </TableRow>
      ))}</TableBody>
    </Table>
  )
}
