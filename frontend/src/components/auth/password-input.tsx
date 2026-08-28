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
        className="w-full rounded-[13px] border border-white/10 bg-white/[0.035] px-4 py-3 pr-11 font-[family-name:var(--font-studio)] text-[13px] text-white outline-none transition-all placeholder:text-white/20 focus:border-violet-300/35 focus:bg-white/[0.05] focus:ring-2 focus:ring-violet-400/10"
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? hideLabel : showLabel}
        title={visible ? hideLabel : showLabel}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 transition-colors hover:text-white"
      >
        {visible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
    </div>
  )
}
