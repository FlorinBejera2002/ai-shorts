import { AccountSettings } from '@/components/settings/account-settings'
import { hasRecentAuthentication } from '@/lib/account-settings'
import { auth } from '@/lib/auth'
import { getPrisma } from '@/lib/db'
import { setRequestLocale } from 'next-intl/server'
import { redirect } from 'next/navigation'

export const runtime = 'nodejs'

export default async function SettingsPage({
  params
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  setRequestLocale(locale)

  const session = await auth()
  if (!session?.user?.id) redirect(`/${locale}/login`)
  const prisma = getPrisma()

  const profile = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      name: true,
      email: true,
      image: true,
      provider: true,
      passwordHash: true,
      accounts: {
        select: { provider: true },
        take: 1
      },
      emailVerified: true,
      createdAt: true
    }
  })
  if (!profile) redirect(`/${locale}/login`)
  const { accounts, passwordHash, ...safeProfile } = profile

  return (
    <AccountSettings
      initialProfile={{
        ...safeProfile,
        provider: passwordHash
          ? 'credentials'
          : (accounts[0]?.provider ?? safeProfile.provider),
        canChangePassword: Boolean(passwordHash),
        recentlyAuthenticated: hasRecentAuthentication(
          session.user.authenticatedAt
        ),
        emailVerified: profile.emailVerified?.toISOString() ?? null,
        createdAt: profile.createdAt.toISOString()
      }}
    />
  )
}
