'use client'

import { LoadingIndicator } from '@/components/ui/loading-indicator'
import { useFormStatus } from 'react-dom'
import { CanvasButton } from './canvas-button'

export function SubmitButton({
  label,
  pendingLabel
}: {
  label: string
  pendingLabel: string
}) {
  const { pending } = useFormStatus()

  return (
    <CanvasButton type="submit" disabled={pending}>
      {pending && <LoadingIndicator className="size-4" />}
      {pending ? pendingLabel : label}
    </CanvasButton>
  )
}
