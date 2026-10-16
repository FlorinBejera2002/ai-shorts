'use client'

import { Suspense } from 'react'
import { CreationWorkspace } from '@/components/create/creation-workspace'
import '@/components/create/creation-workbench.css'

export default function CreatePage() {
  return (
    <div className="creation-page dashboard-workspace animate-fade-in">
      <Suspense fallback={<div className="skeleton h-96 w-full" aria-busy="true" />}>
        <CreationWorkspace />
      </Suspense>
    </div>
  )
}
