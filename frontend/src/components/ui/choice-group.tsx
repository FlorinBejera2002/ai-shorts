'use client'

import { cn } from '@/lib/utils'
import { ToggleGroup } from 'radix-ui'
import type { ReactNode } from 'react'

export function ChoiceGroup({
  value,
  onChange,
  label,
  options,
  className
}: {
  value: string
  onChange: (value: string) => void
  label: string
  options: { value: string; label: ReactNode }[]
  className?: string
}) {
  return (
    <ToggleGroup.Root
      type="single"
      value={value}
      onValueChange={(next) => {
        if (next) onChange(next)
      }}
      aria-label={label}
      className={cn('flex flex-wrap gap-2', className)}
    >
      {options.map((option) => (
        <ToggleGroup.Item
          key={option.value}
          value={option.value}
          data-slot="toggle-group-item"
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-input bg-background px-3 py-2 text-xs font-medium leading-snug outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring data-[state=on]:border-primary data-[state=on]:bg-primary/10 data-[state=on]:text-primary disabled:opacity-50"
        >
          {option.label}
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  )
}
