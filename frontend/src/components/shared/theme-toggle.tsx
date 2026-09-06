'use client'

import { Button } from '@/components/ui/button'

import { Monitor, Moon, Sun } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'

const MODES = [
  { value: 'light', icon: Sun, labelKey: 'themeLight' },
  { value: 'dark', icon: Moon, labelKey: 'themeDark' },
  { value: 'system', icon: Monitor, labelKey: 'themeSystem' }
] as const

export function ThemeToggle({
  variant = 'default'
}: { variant?: 'default' | 'cinematic' }) {
  const { theme, setTheme } = useTheme()
  const t = useTranslations('settings')
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])
  if (!mounted)
    return (
      <div
        className={`h-9 w-[104px] rounded-xl ${variant === 'cinematic' ? 'bg-white/[.06]' : 'border border-border bg-muted'}`}
      />
    )

  return (
    <div
      className={`flex rounded-xl p-0.5 ${variant === 'cinematic' ? 'border border-white/[0.09] bg-white/[.035]' : 'border border-border bg-muted/70'}`}
    >
      {MODES.map(({ value, icon: Icon, labelKey }) => (
        <Button
          variant="ghost"
          size="icon"
          key={value}
          type="button"
          onClick={() => setTheme(value)}
          aria-pressed={theme === value}
          className={`flex h-8 w-8 items-center justify-center rounded-[9px] outline-none transition-all focus-visible:ring-2 focus-visible:ring-primary/60 ${
            theme === value
              ? variant === 'cinematic'
                ? 'bg-white text-black shadow-sm'
                : 'bg-card text-foreground shadow-sm'
              : variant === 'cinematic'
                ? 'text-white/45 hover:text-white'
                : 'text-muted-foreground hover:text-foreground'
          }`}
          aria-label={`${t('theme')}: ${t(labelKey)}`}
          title={t(labelKey)}
        >
          <Icon className="h-3.5 w-3.5" />
        </Button>
      ))}
    </div>
  )
}
