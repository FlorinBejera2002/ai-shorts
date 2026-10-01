import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  CircleGauge,
  Clock3,
  Coins,
  LogOut,
  Search,
  ShieldCheck,
  UserCog,
  Users,
  Video
} from 'lucide-react'
import { type FormEvent, type ReactNode, useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { api, type AdminUser, type SessionUser } from './api'
import { Alert } from './components/ui/alert'
import { Badge } from './components/ui/badge'
import { Button } from './components/ui/button'
import { Card } from './components/ui/card'
import { Input } from './components/ui/input'
import { Label } from './components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './components/ui/select'
import { Avatar, AvatarFallback } from './components/ui/avatar'
import { Progress } from './components/ui/progress'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from './components/ui/sheet'
import { Skeleton } from './components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './components/ui/table'
import { Tabs, TabsList, TabsTrigger } from './components/ui/tabs'
import { Textarea } from './components/ui/textarea'

type View = 'overview' | 'users' | 'audit'
type Overview = {
  usersTotal: number
  usersActive: number
  usersSuspended: number
  newUsersSevenDays: number
  jobsTotal: number
  jobsActive: number
  jobsFailed: number
  clipsTotal: number
  creditsOutstanding: number
}
type AuditEvent = {
  id: number
  actorEmail: string
  targetEmail: string | null
  action: string
  reason: string
  before: Record<string, unknown>
  after: Record<string, unknown>
  createdAt: string
}

const number = new Intl.NumberFormat('ro-RO')
const date = new Intl.DateTimeFormat('ro-RO', { dateStyle: 'medium', timeStyle: 'short' })

export function App() {
  const [session, setSession] = useState<SessionUser | null>(null)
  const [restoring, setRestoring] = useState(true)
  const [view, setView] = useState<View>('overview')

  useEffect(() => {
    let live = true
    void api.restore().then((user) => live && setSession(user)).catch(() => undefined).finally(() => live && setRestoring(false))
    return () => { live = false }
  }, [])

  if (restoring) return <LoadingScreen />
  if (!session) return <Login onAuthenticated={setSession} />

  return (
    <div className="app-shell">
      <Sidebar view={view} session={session} onView={setView} onLogout={async () => { await api.logout(); setSession(null) }} />
      <main className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">Sneep Cut / control room</p>
            <h1>{view === 'overview' ? 'Platform overview' : view === 'users' ? 'Utilizatori' : 'Jurnal de audit'}</h1>
          </div>
          <div className="environment"><span /> Producție</div>
        </header>
        {view === 'overview' && <OverviewPage onOpenUsers={() => setView('users')} />}
        {view === 'users' && <UsersPage />}
        {view === 'audit' && <AuditPage />}
      </main>
    </div>
  )
}

function Login({ onAuthenticated }: { onAuthenticated: (user: SessionUser) => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [secondFactor, setSecondFactor] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true); setError('')
    try { onAuthenticated(await api.login(email, password, secondFactor)) }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Autentificarea a eșuat') }
    finally { setBusy(false) }
  }
  return (
    <div className="login-screen">
      <div className="login-mark"><BrandLockup context="dark" /></div>
      <Card className="login-panel">
        <p className="eyebrow">Zonă restricționată</p>
        <h1>Control room</h1>
        <p className="login-copy">Administrare operațională pentru echipa Sneep Cut. Fiecare modificare este înregistrată.</p>
        <Button type="button" variant="outline" className="w-full" onClick={() => api.googleSignIn()}>
          <GoogleMark /> Continuă cu Google
        </Button>
        <div className="login-divider"><span>sau cu parola</span></div>
        <form onSubmit={submit}>
          <Label>Email administrativ<Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required /></Label>
          <Label>Parolă<Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required /></Label>
          <Label>Cod 2FA <span>(dacă este activ)</span><Input inputMode="numeric" value={secondFactor} onChange={(e) => setSecondFactor(e.target.value)} autoComplete="one-time-code" /></Label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <Button className="w-full" disabled={busy}>{busy ? 'Se verifică…' : 'Intră în consolă'} <ArrowUpRight size={16} /></Button>
        </form>
      </Card>
      <p className="login-footnote"><ShieldCheck size={14} /> Acces protejat server-side · sesiuni auditate</p>
    </div>
  )
}

function GoogleMark() {
  return <span className="google-mark" aria-hidden="true">G</span>
}

function Sidebar({ view, session, onView, onLogout }: { view: View; session: SessionUser; onView: (v: View) => void; onLogout: () => void }) {
  const links: { id: View; label: string; icon: ReactNode }[] = [
    { id: 'overview', label: 'Overview', icon: <CircleGauge size={18} /> },
    { id: 'users', label: 'Utilizatori', icon: <Users size={18} /> },
    { id: 'audit', label: 'Audit', icon: <Activity size={18} /> }
  ]
  return (
    <aside className="sidebar">
      <div className="brand"><BrandLockup context="dark" compact /></div>
      <nav>{links.map((link) => <Button variant="ghost" key={link.id} aria-label={link.label} aria-current={view === link.id ? 'page' : undefined} className={view === link.id ? 'active' : ''} onClick={() => onView(link.id)}>{link.icon}{link.label}</Button>)}</nav>
      <div className="sidebar-spacer" />
      <div className="admin-profile"><Avatar><AvatarFallback>{(session.name || session.email).slice(0, 1).toUpperCase()}</AvatarFallback></Avatar><div><strong>{session.name || 'Administrator'}</strong><span>{session.email}</span></div></div>
      <Button variant="ghost" className="logout" aria-label="Deconectare" onClick={onLogout}><LogOut size={16} /> Deconectare</Button>
    </aside>
  )
}

function OverviewPage({ onOpenUsers }: { onOpenUsers: () => void }) {
  const [data, setData] = useState<Overview | null>(null)
  const [error, setError] = useState('')
  useEffect(() => { void api.request<Overview>('/api/admin/overview').then(setData).catch((e) => setError(e.message)) }, [])
  if (error) return <ErrorState message={error} />
  if (!data) return <PageLoader />
  const cards = [
    { label: 'Utilizatori', value: data.usersTotal, detail: `+${data.newUsersSevenDays} în ultimele 7 zile`, icon: <Users />, tone: 'ink' },
    { label: 'Joburi active', value: data.jobsActive, detail: `${data.jobsTotal} joburi în total`, icon: <Clock3 />, tone: 'lime' },
    { label: 'Clipuri generate', value: data.clipsTotal, detail: 'Biblioteca platformei', icon: <Video />, tone: 'sand' },
    { label: 'Credite în conturi', value: data.creditsOutstanding, detail: 'Sold total disponibil', icon: <Coins />, tone: 'sky' }
  ]
  return (
    <div className="page-content">
      <section className="metric-grid">{cards.map((card) => <Card className={`metric-card ${card.tone}`} key={card.label}><div className="metric-icon">{card.icon}</div><span>{card.label}</span><strong>{number.format(card.value)}</strong><small>{card.detail}</small></Card>)}</section>
      <section className="split-grid">
        <Card className="panel health-panel">
          <div className="panel-heading"><div><p className="eyebrow">Live state</p><h2>Sănătatea operațională</h2></div><Badge variant="outline">Stare curentă</Badge></div>
          <div className="health-list">
            <HealthRow label="Conturi active" value={data.usersActive} total={data.usersTotal} />
            <HealthRow label="Conturi suspendate" value={data.usersSuspended} total={data.usersTotal} alert={data.usersSuspended > 0} />
            <HealthRow label="Joburi eșuate" value={data.jobsFailed} total={Math.max(data.jobsTotal, 1)} alert={data.jobsFailed > 0} />
          </div>
        </Card>
        <Card className="panel command-panel">
          <p className="eyebrow">Quick command</p><h2>Gestionare utilizatori</h2>
          <p>Caută conturi, ajustează credite, schimbă nivelul de acces sau suspendă imediat sesiunile.</p>
          <Button className="self-start" onClick={onOpenUsers}>Deschide utilizatorii <ArrowUpRight size={16} /></Button>
          <div className="audit-note"><ShieldCheck size={17} /><span>Fiecare intervenție cere motiv și intră automat în audit.</span></div>
        </Card>
      </section>
    </div>
  )
}

function HealthRow({ label, value, total, alert = false }: { label: string; value: number; total: number; alert?: boolean }) {
  const width = Math.min(100, Math.max(value > 0 ? 3 : 0, (value / Math.max(total, 1)) * 100))
  return <div className="health-row"><div><span>{label}</span><strong>{number.format(value)}</strong></div><Progress aria-label={label} value={width} className={alert ? 'mt-2 [&_[data-slot=progress-indicator]]:bg-destructive' : 'mt-2'} /></div>
}

function UsersPage() {
  const [items, setItems] = useState<AdminUser[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('')
  const [selected, setSelected] = useState<AdminUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const load = useCallback(async () => {
    setLoading(true); setError('')
    const params = new URLSearchParams({ page: String(page), pageSize: '20' })
    if (query) params.set('q', query)
    if (status) params.set('status', status)
    try { const data = await api.request<{ items: AdminUser[]; total: number }>(`/api/admin/users?${params}`); setItems(data.items); setTotal(data.total) }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Lista nu a putut fi încărcată') }
    finally { setLoading(false) }
  }, [page, query, status])
  useEffect(() => { const timer = setTimeout(() => void load(), 220); return () => clearTimeout(timer) }, [load])
  return (
    <div className="page-content">
      <div className="toolbar">
        <div className="search-box"><Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-muted-foreground" /><Input aria-label="Caută utilizatori" className="pl-9" placeholder="Caută după nume sau email" value={query} onChange={(e) => { setQuery(e.target.value); setPage(1) }} /></div>
        <Select value={status || 'all'} onValueChange={(value) => { setStatus(value === 'all' ? '' : value); setPage(1) }}><SelectTrigger aria-label="Filtrează după status" className="w-full sm:w-44"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Toate statusurile</SelectItem><SelectItem value="active">Active</SelectItem><SelectItem value="suspended">Suspendate</SelectItem></SelectContent></Select>
        <span className="result-count">{number.format(total)} conturi</span>
      </div>
      <Card className="table-panel">
        <Table><TableHeader><TableRow><TableHead>Utilizator</TableHead><TableHead>Status</TableHead><TableHead>Plan</TableHead><TableHead>Activitate</TableHead><TableHead>Credite</TableHead><TableHead><span className="sr-only">Acțiuni</span></TableHead></TableRow></TableHeader>
          <TableBody>{loading ? <TableRow><TableCell colSpan={6}><PageLoader compact /></TableCell></TableRow> : error ? <TableRow><TableCell colSpan={6}><ErrorState message={error} /></TableCell></TableRow> : items.length === 0 ? <TableRow><TableCell colSpan={6} className="h-32 text-center text-muted-foreground">Niciun utilizator găsit.</TableCell></TableRow> : items.map((user) => (
            <TableRow key={user.id}><TableCell><div className="user-cell"><Avatar><AvatarFallback>{(user.name || user.email)[0].toUpperCase()}</AvatarFallback></Avatar><div><strong>{user.name || 'Fără nume'}</strong><span>{user.email}</span></div></div></TableCell>
              <TableCell><Badge variant={user.accountStatus === 'active' ? 'success' : 'destructive'}>{user.accountStatus === 'active' ? 'Activ' : 'Suspendat'}</Badge></TableCell>
              <TableCell><div className="stacked"><strong>{user.plan}</strong><span>{user.accessRole}</span></div></TableCell>
              <TableCell><div className="stacked"><strong>{user.jobsCount} joburi · {user.clipsCount} clipuri</strong><span>{user.lastSeenAt ? `Văzut ${date.format(new Date(user.lastSeenAt))}` : 'Nicio sesiune'}</span></div></TableCell>
              <TableCell><strong>{number.format(user.credits)}</strong></TableCell><TableCell><Button variant="outline" size="sm" className="row-action" onClick={() => setSelected(user)}><UserCog size={17} /> Gestionează</Button></TableCell></TableRow>))}</TableBody>
        </Table>
        <div className="pagination"><Button aria-label="Pagina anterioară" variant="outline" size="icon" disabled={page === 1} onClick={() => setPage((p) => p - 1)}><ChevronLeft size={16} /></Button><span>Pagina {page} din {Math.max(1, Math.ceil(total / 20))}</span><Button aria-label="Pagina următoare" variant="outline" size="icon" disabled={page * 20 >= total} onClick={() => setPage((p) => p + 1)}><ChevronRight size={16} /></Button></div>
      </Card>
      {selected && <UserDrawer user={selected} onClose={() => setSelected(null)} onSaved={() => { setSelected(null); void load() }} />}
    </div>
  )
}

function UserDrawer({ user, onClose, onSaved }: { user: AdminUser; onClose: () => void; onSaved: () => void }) {
  const [action, setAction] = useState<'adjust_credits' | 'set_role' | 'set_status'>('adjust_credits')
  const [amount, setAmount] = useState(100)
  const [role, setRole] = useState(user.accessRole)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const nextStatus = user.accountStatus === 'active' ? 'suspended' : 'active'
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('')
    const payload = action === 'adjust_credits' ? { action, amount, reason } : action === 'set_role' ? { action, role, reason } : { action, status: nextStatus, reason }
    try { await api.request(`/api/admin/users/${user.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }); toast.success('Modificarea a fost aplicată și auditată'); onSaved() }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Modificarea a eșuat') }
    finally { setBusy(false) }
  }
  return <Sheet open onOpenChange={(open) => !open && onClose()}><SheetContent className="drawer">
    <SheetHeader><p className="eyebrow">User control</p><SheetTitle>{user.name || 'Fără nume'}</SheetTitle><SheetDescription>{user.email}</SheetDescription></SheetHeader>
    <div className="user-summary"><Card><span>Credite</span><strong>{number.format(user.credits)}</strong></Card><Card><span>Rol</span><strong>{user.accessRole}</strong></Card><Card><span>Status</span><strong>{user.accountStatus}</strong></Card></div>
    <form onSubmit={submit}><Tabs value={action} onValueChange={(value) => setAction(value as typeof action)}><TabsList className="segmented"><TabsTrigger value="adjust_credits">Credite</TabsTrigger><TabsTrigger value="set_role">Rol</TabsTrigger><TabsTrigger value="set_status">Status</TabsTrigger></TabsList></Tabs>
      {action === 'adjust_credits' && <Label>Ajustare credite<div className="amount-input"><Button aria-label="Scade credite" variant="outline" size="icon" type="button" onClick={() => setAmount((v) => -Math.abs(v))}><ArrowDownRight size={16} /></Button><Input aria-label="Valoare ajustare credite" type="number" min="-1000000" max="1000000" value={amount} onChange={(e) => setAmount(Number(e.target.value))} /><Button aria-label="Adaugă credite" variant="outline" size="icon" type="button" onClick={() => setAmount((v) => Math.abs(v))}><ArrowUpRight size={16} /></Button></div></Label>}
      {action === 'set_role' && <div className="grid gap-2"><Label htmlFor="user-role">Noul rol</Label><Select value={role} onValueChange={(value) => setRole(value as AdminUser['accessRole'])}><SelectTrigger id="user-role"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="member">Member</SelectItem><SelectItem value="viewer">Viewer</SelectItem><SelectItem value="admin">Admin</SelectItem></SelectContent></Select></div>}
      {action === 'set_status' && <Alert className={nextStatus === 'suspended' ? 'text-destructive' : ''}><ShieldCheck size={20} /><div><strong>{nextStatus === 'suspended' ? 'Suspendă accesul' : 'Reactivează accesul'}</strong><span>{nextStatus === 'suspended' ? 'Toate sesiunile utilizatorului vor fi închise imediat.' : 'Utilizatorul se va putea autentifica din nou.'}</span></div></Alert>}
      <Label>Motiv operațional<Textarea value={reason} onChange={(e) => setReason(e.target.value)} minLength={5} maxLength={500} placeholder="De ce este necesară această modificare?" required /></Label>
      {error && <p className="form-error" role="alert">{error}</p>}<Button className="w-full" disabled={busy}>{busy ? 'Se aplică…' : 'Confirmă modificarea'}</Button>
    </form>
  </SheetContent></Sheet>
}

function AuditPage() {
  const [items, setItems] = useState<AuditEvent[]>([])
  const [error, setError] = useState('')
  useEffect(() => { void api.request<{ items: AuditEvent[] }>('/api/admin/audit?limit=100').then((v) => setItems(v.items)).catch((e) => setError(e.message)) }, [])
  const labels = useMemo(() => ({ adjust_credits: 'Credite ajustate', set_role: 'Rol modificat', set_status: 'Status modificat' }), [])
  if (error) return <ErrorState message={error} />
  return <div className="page-content"><Card className="audit-list">{items.length === 0 ? <div className="empty-state"><ShieldCheck /><h2>Nicio intervenție încă</h2><p>Acțiunile administrative vor apărea aici.</p></div> : items.map((item) => <article className="audit-entry" key={item.id}><Avatar><AvatarFallback><ShieldCheck size={16} /></AvatarFallback></Avatar><div><div className="audit-title"><strong>{labels[item.action as keyof typeof labels] ?? item.action}</strong><time>{date.format(new Date(item.createdAt))}</time></div><p><b>{item.actorEmail}</b> a intervenit asupra contului <b>{item.targetEmail ?? 'șters'}</b>.</p><blockquote>{item.reason}</blockquote></div></article>)}</Card></div>
}

function BrandLockup({ context = 'light', compact = false }: { context?: 'light' | 'dark'; compact?: boolean }) {
  return <div className={`brand-lockup ${context === 'dark' ? 'on-dark' : ''} ${compact ? 'compact' : ''}`}>
    <span className="brand-logo"><img src="/logo-icon.svg" alt="" /></span>
    <span className="brand-copy"><strong>Sneep Cut</strong><small>ADMIN CONSOLE</small></span>
  </div>
}

function LoadingScreen() { return <div className="loading-screen"><BrandLockup context="dark" /><Skeleton className="h-2 w-full" /></div> }
function PageLoader({ compact = false }: { compact?: boolean }) { return <div className={`page-loader ${compact ? 'compact' : ''}`}><Skeleton className="size-6 rounded-full" /><Skeleton className="h-2 w-28" /><span className="sr-only">Se încarcă datele…</span></div> }
function ErrorState({ message }: { message: string }) { return <div className="error-state"><ShieldCheck /><h2>Nu am putut încărca datele</h2><p>{message}</p></div> }
