import { LogOut } from 'lucide-react'
import type { SessionUser } from '../api'
import { BrandLogo } from '../components/brand-logo'
import { Avatar, AvatarFallback } from '../components/ui/avatar'
import { initial } from '../lib/format'
import { navigation, type View } from './navigation'

type SidebarProps = {
  view: View
  session: SessionUser
  onView: (view: View) => void
  onLogout: () => void
}

/** Desktop panel and phone dock; stays mounted while the page content changes. */
export function Sidebar({ view, session, onView, onLogout }: SidebarProps) {
  return (
    <aside className="sidebar">
      <BrandLogo className="sidebar-brand" />
      <nav aria-label="Navigare administrare">
        {navigation.map(({ id, label, icon: Icon }) => (
          <button
            type="button"
            key={id}
            className="nav-item"
            aria-label={label}
            aria-current={view === id ? 'page' : undefined}
            data-active={view === id}
            onClick={() => onView(id)}
          >
            <Icon aria-hidden="true" />
            <span>{label}</span>
          </button>
        ))}
      </nav>
      <div className="sidebar-spacer" />
      <div className="admin-profile">
        <Avatar><AvatarFallback>{initial(session.name || session.email)}</AvatarFallback></Avatar>
        <div>
          <strong>{session.name || 'Administrator'}</strong>
        </div>
        <button type="button" className="logout" aria-label="Deconectare" title="Deconectare" onClick={onLogout}>
          <LogOut aria-hidden="true" />
        </button>
      </div>
    </aside>
  )
}
