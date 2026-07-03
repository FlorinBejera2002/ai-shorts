'use client'

import { Eye, EyeOff } from 'lucide-react'
import { useState } from 'react'

interface PasswordInputProps {
  id: string
  name: string
  placeholder?: string
  autoComplete?: string
  showLabel: string
  hideLabel: string
  value?: string
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void
}

export function PasswordInput({
  id,
  name,
  placeholder = '••••••••',
  autoComplete = 'current-password',
  showLabel,
  hideLabel,
  value,
  onChange
}: PasswordInputProps) {
  const [visible, setVisible] = useState(false)

  return (
    <div className="relative">
      <input
        id={id}
        name={name}
        type={visible ? 'text' : 'password'}
        required={true}
        placeholder={placeholder}
        autoComplete={autoComplete}
        value={value}
        onChange={onChange}
        className="w-full rounded-xl border border-input bg-card px-4 py-2.5 pr-11 text-[13px] placeholder:text-muted-foreground/40 focus:border-primary focus:ring-2 focus:ring-primary/15 transition-all outline-none"
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? hideLabel : showLabel}
        title={visible ? hideLabel : showLabel}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-foreground transition-colors"
      >
        {visible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
    </div>
  )
}
