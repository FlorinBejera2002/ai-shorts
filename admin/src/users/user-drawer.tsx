import { useState } from 'react'
import type { AdminUser } from '../api'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '../components/ui/sheet'
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs'
import { relativeTime } from '../lib/format'
import { ActivityTimeline } from './activity-timeline'
import { UserActionsForm } from './user-actions-form'

type View = 'activity' | 'actions'
type UserDrawerProps = { user: AdminUser; onClose: () => void; onSaved: () => void }

export function UserDrawer({ user, onClose, onSaved }: UserDrawerProps) {
  const [view, setView] = useState<View>('activity')
  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="drawer">
        <SheetHeader><SheetTitle>{user.name || 'Fără nume'}</SheetTitle><SheetDescription>{user.email}</SheetDescription></SheetHeader>
        <dl className="drawer-facts">
          <div><dt>Activ</dt><dd>{relativeTime(user.lastSeenAt)}</dd></div>
          <div><dt>Clipuri</dt><dd>{user.clipsCount}</dd></div>
        </dl>
        <Tabs value={view} onValueChange={(value) => setView(value as View)}>
          <TabsList className="segmented two"><TabsTrigger value="activity">Activitate</TabsTrigger><TabsTrigger value="actions">Modifică</TabsTrigger></TabsList>
        </Tabs>
        {view === 'activity' ? <ActivityTimeline userId={user.id} /> : <UserActionsForm key={`${user.id}:${user.accessRole}`} user={user} onSaved={onSaved} />}
      </SheetContent>
    </Sheet>
  )
}
