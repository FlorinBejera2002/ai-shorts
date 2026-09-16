'use client'

import { SocialConnectionReturnContext } from '@/components/publishing/social-connection-return-context'
import { PageLoading } from '@/components/ui/page-loading'
import { useContext } from 'react'

export default function DashboardLoading() {
  const { returning } = useContext(SocialConnectionReturnContext)
  if (returning) return null
  return <PageLoading label="Loading dashboard" />
}
