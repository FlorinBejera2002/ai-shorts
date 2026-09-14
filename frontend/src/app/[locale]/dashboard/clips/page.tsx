import Clips from '@/components/dashboard/views/projects'
import { ApiState } from '@/components/shared/api-state'
import { Suspense } from 'react'

export default function Page() {
  return (
    <Suspense fallback={<ApiState />}>
      <Clips />
    </Suspense>
  )
}
