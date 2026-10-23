'use client'

import { Label } from '@/components/ui/label'
import styles from './settings-panels.module.css'
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
  disabled?: boolean
}

export function SettingsSelect<Value extends string>({
  id,
  label,
  value,
  options,
  onChange,
  disabled = false
}: SettingsSelectProps<Value>) {
  return (
    <div className={styles.field}>
      <Label htmlFor={id} className={styles.label}>
        {label}
      </Label>
      <Select
        value={value}
        disabled={disabled}
        onValueChange={(next) => {
          const option = options.find((option) => option.value === next)
          if (option) onChange(option.value)
        }}
      >
        <SelectTrigger id={id} className={styles.selectTrigger}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent
          position="popper"
          align="start"
          className={styles.selectPopup}
        >
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
