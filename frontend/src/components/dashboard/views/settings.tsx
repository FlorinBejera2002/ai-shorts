'use client'

import {
  AccountSettings,
  type Profile
} from '@/components/settings/account-settings'
import { ApiState } from '@/components/shared/api-state'
import { useApiResource } from '@/hooks/use-api-resource'
export default function SettingsPage() {
  const { data, error, reload } = useApiResource<{ profile: Profile }>(
    '/api/user/profile'
  )
  if (!data) return <ApiState error={error} retry={reload} />
  return <AccountSettings initialProfile={data.profile} />
}
