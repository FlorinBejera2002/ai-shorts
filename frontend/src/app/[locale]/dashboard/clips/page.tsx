import { ClipsLibraryPage } from '@/components/clips/clips-library'
import { ApiState } from '@/components/shared/api-state'
import { Suspense } from 'react'

export default function Page() {
  return (
    <Suspense fallback={<ApiState />}>
      <ClipsLibraryPage />
    </Suspense>
  )
}
