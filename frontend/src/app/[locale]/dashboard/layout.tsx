import { AuthGuard } from '@/components/auth/auth-guard'
import { DashboardShell } from '@/components/dashboard/dashboard-shell'
import { SocialConnectionReturn } from '@/components/publishing/social-connection-return'
import { cookies } from 'next/headers'
import { Suspense } from 'react'

export default async function DashboardLayout({
  children
}: { children: React.ReactNode }) {
  const cookieStore = await cookies()
  const defaultOpen = cookieStore.get('sidebar_state')?.value !== 'false'
  return (
    <Suspense fallback={null}>
      <SocialConnectionReturn>
        <AuthGuard>
          <DashboardShell defaultOpen={defaultOpen}>{children}</DashboardShell>
        </AuthGuard>
      </SocialConnectionReturn>
    </Suspense>
  )
}
