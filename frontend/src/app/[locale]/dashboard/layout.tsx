import { AuthGuard } from '@/components/auth/auth-guard'
import { DashboardShell } from '@/components/dashboard/dashboard-shell'
import { cookies } from 'next/headers'

export default async function DashboardLayout({
  children
}: { children: React.ReactNode }) {
  const cookieStore = await cookies()
  const defaultOpen = cookieStore.get('sidebar_state')?.value !== 'false'
  return (
    <AuthGuard>
      <DashboardShell defaultOpen={defaultOpen}>{children}</DashboardShell>
    </AuthGuard>
  )
}
