'use client'

import { Button } from '@/components/ui/button'
import { Loader2 } from 'lucide-react'
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
          <Loader2 className="w-4 h-4 animate-spin" />
          {pendingLabel}
        </>
      ) : (
        label
      )}
    </Button>
  )
}
