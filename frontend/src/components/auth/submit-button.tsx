'use client'

import { Button } from '@/components/ui/button'
import { LoadingIndicator } from '@/components/ui/loading-indicator'
import { useFormStatus } from 'react-dom'

export function SubmitButton({
  label,
  pendingLabel
}: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus()

  return (
    <Button type="submit" disabled={pending} className="h-11 w-full">
      {pending ? (
        <>
          <LoadingIndicator className="w-4 h-4" />
          {pendingLabel}
        </>
      ) : (
        label
      )}
    </Button>
  )
}
