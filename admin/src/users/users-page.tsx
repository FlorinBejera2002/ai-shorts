import { useCallback, useEffect, useState } from 'react'
import { api, type AdminUser } from '../api'
import { Pagination } from '../components/pagination'
import { SearchField } from '../components/search-field'
import { PageLoader, StatePanel } from '../components/state-panel'
import { Avatar, AvatarFallback } from '../components/ui/avatar'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Card } from '../components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select'
import { Table, TableBody, TableCell, TableColumns, TableRow } from '../components/ui/table'
import { initial, numberFormat } from '../lib/format'
import { UserDrawer } from './user-drawer'

const pageSize = 20

export function UsersPage() {
  const [items, setItems] = useState<AdminUser[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('')
  const [selected, setSelected] = useState<AdminUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) })
    if (query) params.set('q', query)
    if (status) params.set('status', status)
    try {
      const data = await api.request<{ items: AdminUser[]; total: number }>(`/api/admin/users?${params}`)
      setItems(data.items)
      setTotal(data.total)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Lista nu a putut fi încărcată')
    } finally {
      setLoading(false)
    }
  }, [page, query, status])

  useEffect(() => { const timer = setTimeout(() => void load(), 220); return () => clearTimeout(timer) }, [load])

  return (
    <div className="page-content">
      <div className="toolbar">
        <SearchField label="Caută utilizatori" value={query} onChange={(value) => { setQuery(value); setPage(1) }} />
        <Select value={status || 'all'} onValueChange={(value) => { setStatus(value === 'all' ? '' : value); setPage(1) }}>
          <SelectTrigger aria-label="Filtrează după status" className="w-full sm:w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toate</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="suspended">Suspendate</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <Card className="table-panel">
        <UsersBody loading={loading} error={error} items={items} onRetry={() => void load()} onOpen={setSelected} />
        <Pagination page={page} total={total} pageSize={pageSize} onPage={setPage} />
      </Card>
      {selected && <UserDrawer user={selected} onClose={() => setSelected(null)} onSaved={() => { setSelected(null); void load() }} />}
    </div>
  )
}

type UsersBodyProps = { loading: boolean; error: string; items: AdminUser[]; onRetry: () => void; onOpen: (user: AdminUser) => void }

function UsersBody({ loading, error, items, onRetry, onOpen }: UsersBodyProps) {
  if (loading) return <PageLoader compact />
  if (error) return <StatePanel compact illustration="loadError" title="Nu am putut încărca datele" message={error} role="alert" action={<Button variant="secondary" size="sm" onClick={onRetry}>Reîncearcă</Button>} />
  if (items.length === 0) return <StatePanel compact illustration="usersNoResults" title="Niciun utilizator" />
  return (
    <Table>
      <TableColumns columns={['Utilizator', 'Plan', 'Credite', '']} />
      <TableBody>{items.map((user) => (
        <TableRow key={user.id}>
          <TableCell>
            <div className="user-cell">
              <Avatar><AvatarFallback>{initial(user.name || user.email)}</AvatarFallback></Avatar>
              <div><strong>{user.name || user.email}</strong>{user.name && <span>{user.email}</span>}</div>
              {user.accountStatus === 'suspended' && <Badge variant="destructive">Suspendat</Badge>}
            </div>
          </TableCell>
          <TableCell className="capitalize">{user.plan}</TableCell>
          <TableCell className="tabular-nums">{numberFormat.format(user.credits)}</TableCell>
          <TableCell className="text-right"><Button variant="secondary" size="sm" onClick={() => onOpen(user)}>Detalii</Button></TableCell>
        </TableRow>
      ))}</TableBody>
    </Table>
  )
}
