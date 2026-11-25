import { useEffect, useState } from 'react'
import { api, type SessionUser } from './api'
import { AiRoutingPage } from './ai-routing/ai-routing-page'
import { AuditPage } from './audit/audit-page'
import { ErrorsPage } from './errors/errors-page'
import { FeedbackPage } from './feedback/feedback-page'
import { LoginPage } from './auth/login-page'
import { BillingPage } from './billing/billing-page'
import { BrandLogo } from './components/brand-logo'
import { Skeleton } from './components/ui/skeleton'
import { OverviewPage } from './overview/overview-page'
import { type View, viewTitle } from './shell/navigation'
import { Sidebar } from './shell/sidebar'
import { UsersPage } from './users/users-page'

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
  if (!session) return <LoginPage onAuthenticated={setSession} />

  return (
    <div className="app-shell">
      <Sidebar view={view} session={session} onView={setView} onLogout={async () => { await api.logout(); setSession(null) }} />
      <main className="workspace">
        <header className="topbar">
          <h1>{viewTitle(view)}</h1>
        </header>
        {view === 'overview' && <OverviewPage />}
        {view === 'users' && <UsersPage />}
        {view === 'billing' && <BillingPage />}
        {view === 'ai-routing' && <AiRoutingPage />}
        {view === 'errors' && <ErrorsPage />}
        {view === 'feedback' && <FeedbackPage />}
        {view === 'audit' && <AuditPage />}
      </main>
    </div>
  )
}

function LoadingScreen() {
  return <div className="loading-screen" role="status"><BrandLogo /><Skeleton className="h-1.5 w-full rounded-full" /><span className="sr-only">Se încarcă…</span></div>
}
