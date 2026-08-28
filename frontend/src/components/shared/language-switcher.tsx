'use client'

import { locales } from '@/i18n/config'
import { usePathname, useRouter } from '@/i18n/navigation'
import { Check, ChevronDown } from 'lucide-react'
import { useLocale } from 'next-intl'
import { useEffect, useRef, useState } from 'react'

const LOCALE_NAMES: Record<string, string> = {
  en: 'English',
  ro: 'Română'
}

function LocaleFlag({ locale }: { locale: string }) {
  if (locale === 'ro') {
    return (
      <svg viewBox="0 0 18 12" aria-hidden="true" className="h-3 w-[18px] rounded-[2px] shadow-sm">
        <path fill="#002B7F" d="M0 0h6v12H0z" />
        <path fill="#FCD116" d="M6 0h6v12H6z" />
        <path fill="#CE1126" d="M12 0h6v12h-6z" />
      </svg>
    )
  }

  return (
    <svg viewBox="0 0 18 12" aria-hidden="true" className="h-3 w-[18px] rounded-[2px] shadow-sm">
      <path fill="#012169" d="M0 0h18v12H0z" />
      <path stroke="#fff" strokeWidth="2.4" d="m0 0 18 12M18 0 0 12" />
      <path stroke="#C8102E" strokeWidth="1.2" d="m0 0 18 12M18 0 0 12" />
      <path stroke="#fff" strokeWidth="4" d="M9 0v12M0 6h18" />
      <path stroke="#C8102E" strokeWidth="2.2" d="M9 0v12M0 6h18" />
    </svg>
  )
}

export function LanguageSwitcher({ variant = 'default' }: { variant?: 'default' | 'cinematic' }) {
  const locale = useLocale()
  const pathname = usePathname()
  const router = useRouter()
  const [isOpen, setIsOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function closeOnOutsideClick(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setIsOpen(false)
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setIsOpen(false)
    }

    document.addEventListener('mousedown', closeOnOutsideClick)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [])

  function switchLocale(newLocale: string) {
    setIsOpen(false)
    router.replace(pathname, { locale: newLocale as 'en' | 'ro' })
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((open) => !open)}
        className={
          variant === 'cinematic'
            ? 'flex min-w-[122px] cursor-pointer items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] py-2 pr-3 pl-3 font-[family-name:var(--font-studio)] text-[10px] font-semibold uppercase tracking-[0.1em] text-white/55 outline-none transition-all hover:border-white/20 hover:text-white'
            : 'flex min-w-[122px] cursor-pointer items-center gap-2 rounded-lg border border-input bg-card py-1.5 pr-2.5 pl-2.5 text-xs'
        }
      >
        <LocaleFlag locale={locale} />
        <span>{LOCALE_NAMES[locale]}</span>
        <ChevronDown
          className={`ml-auto h-3 w-3 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      <div
        role="listbox"
        aria-label="Language"
        className={`absolute top-[calc(100%+8px)] right-0 left-0 z-[70] w-full origin-top overflow-hidden rounded-[14px] border border-white/10 bg-[#0b0812]/95 p-1.5 font-[family-name:var(--font-studio)] shadow-[0_20px_60px_rgba(0,0,0,0.55),inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur-2xl transition-all duration-200 ${isOpen ? 'visible translate-y-0 scale-100 opacity-100' : 'invisible -translate-y-1 scale-95 opacity-0'}`}
      >
        {locales.map((localeOption) => (
          <button
            type="button"
            role="option"
            aria-selected={localeOption === locale}
            key={localeOption}
            onClick={() => switchLocale(localeOption)}
            className={`flex w-full items-center gap-2.5 rounded-[9px] px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-[0.1em] transition-colors ${localeOption === locale ? 'bg-white/[0.08] text-white' : 'text-white/50 hover:bg-white/[0.05] hover:text-white'}`}
          >
            <LocaleFlag locale={localeOption} />
            <span>{LOCALE_NAMES[localeOption]}</span>
            {localeOption === locale && <Check className="ml-auto h-3.5 w-3.5 text-violet-200" />}
          </button>
        ))}
      </div>
    </div>
  )
}
