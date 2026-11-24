import { Minus, Plus } from 'lucide-react'
import { type FormEvent, useState } from 'react'
import { toast } from 'sonner'
import { api, type AdminUser } from '../api'
import { illustrations } from '../components/illustrations'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '../components/ui/sheet'
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs'
import { Textarea } from '../components/ui/textarea'

type Action = 'adjust_credits' | 'set_role' | 'set_status'
type Role = AdminUser['accessRole']
type AccountStatus = AdminUser['accountStatus']
type UserDrawerProps = { user: AdminUser; onClose: () => void; onSaved: () => void }

export function UserDrawer({ user, onClose, onSaved }: UserDrawerProps) {
  const [action, setAction] = useState<Action>('adjust_credits')
  const [amount, setAmount] = useState(100)
  const [role, setRole] = useState(user.accessRole)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const nextStatus: AccountStatus = user.accountStatus === 'active' ? 'suspended' : 'active'
  const suspending = action === 'set_status' && nextStatus === 'suspended'

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError('')
    const payload = { adjust_credits: { action, amount, reason }, set_role: { action, role, reason }, set_status: { action, status: nextStatus, reason } }[action]
    try {
      await api.request(`/api/admin/users/${user.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      toast.success('Modificare salvată')
      onSaved()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Modificarea a eșuat')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="drawer">
        <SheetHeader><SheetTitle>{user.name || 'Fără nume'}</SheetTitle><SheetDescription>{user.email}</SheetDescription></SheetHeader>
        <form onSubmit={submit}>
          <Tabs value={action} onValueChange={(value) => setAction(value as Action)}>
            <TabsList className="segmented"><TabsTrigger value="adjust_credits">Credite</TabsTrigger><TabsTrigger value="set_role">Rol</TabsTrigger><TabsTrigger value="set_status">Status</TabsTrigger></TabsList>
          </Tabs>
          {action === 'adjust_credits' && <CreditsField amount={amount} onChange={setAmount} />}
          {action === 'set_role' && <RoleField role={role} onChange={setRole} />}
          {action === 'set_status' && <StatusNotice nextStatus={nextStatus} />}
          <Label>Motiv<Textarea value={reason} onChange={(e) => setReason(e.target.value)} minLength={5} maxLength={500} required /></Label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <Button size="lg" className="w-full" variant={suspending ? 'destructive' : 'default'} disabled={busy}>{busy ? 'Se aplică…' : 'Confirmă'}</Button>
        </form>
      </SheetContent>
    </Sheet>
  )
}

function CreditsField({ amount, onChange }: { amount: number; onChange: (update: (value: number) => number) => void }) {
  return (
    <Label>Ajustare
      <div className="amount-input">
        <Button aria-label="Scade credite" variant="secondary" size="icon" type="button" onClick={() => onChange((v) => -Math.abs(v))}><Minus /></Button>
        <Input aria-label="Valoare ajustare credite" type="number" min="-1000000" max="1000000" value={amount} onChange={(e) => onChange(() => Number(e.target.value))} />
        <Button aria-label="Adaugă credite" variant="secondary" size="icon" type="button" onClick={() => onChange((v) => Math.abs(v))}><Plus /></Button>
      </div>
    </Label>
  )
}

function RoleField({ role, onChange }: { role: Role; onChange: (role: Role) => void }) {
  return (
    <div className="grid gap-2">
      <Label htmlFor="user-role">Rol</Label>
      <Select value={role} onValueChange={(value) => onChange(value as Role)}>
        <SelectTrigger id="user-role"><SelectValue /></SelectTrigger>
        <SelectContent><SelectItem value="member">Member</SelectItem><SelectItem value="viewer">Viewer</SelectItem><SelectItem value="admin">Admin</SelectItem></SelectContent>
      </Select>
    </div>
  )
}

function StatusNotice({ nextStatus }: { nextStatus: AccountStatus }) {
  if (nextStatus === 'active') return <p className="status-notice">Reactivează accesul</p>
  return (
    <>
      <img className="drawer-illustration" src={illustrations.suspend} alt="" width={128} height={128} />
      <p className="status-notice" data-danger>Suspendă accesul</p>
    </>
  )
}
