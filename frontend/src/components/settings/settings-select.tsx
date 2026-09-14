'use client'

import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'

interface SettingsSelectProps<Value extends string> {
  id: string
  label: string
  value: Value
  options: readonly { value: Value; label: string }[]
  onChange: (value: Value) => void
}

export function SettingsSelect<Value extends string>({
  id,
  label,
  value,
  options,
  onChange
}: SettingsSelectProps<Value>) {
  return (
    <div className="min-w-0">
      <Label htmlFor={id}>{label}</Label>
      <Select
        value={value}
        onValueChange={(next) => {
          const option = options.find((option) => option.value === next)
          if (option) onChange(option.value)
        }}
      >
        <SelectTrigger id={id} className="mt-1.5 w-full bg-card">
          <SelectValue />
        </SelectTrigger>
        <SelectContent position="popper" align="start">
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
