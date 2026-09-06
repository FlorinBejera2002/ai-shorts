'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

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
      <Input
        id={id}
        name={name}
        type={visible ? 'text' : 'password'}
        required={true}
        placeholder={placeholder}
        autoComplete={autoComplete}
        value={value}
        onChange={onChange}
        className="h-11 rounded-lg bg-background pr-12"
      />
      <Button
        variant="ghost"
        size="icon"
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? hideLabel : showLabel}
        title={visible ? hideLabel : showLabel}
        className="absolute right-1 top-1/2 -translate-y-1/2 text-muted-foreground"
      >
        {visible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </Button>
    </div>
  )
}
