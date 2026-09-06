'use client'

import { Button } from '@/components/ui/button'

import { locales } from '@/i18n/config'
import { usePathname, useRouter } from '@/i18n/navigation'
import { Check, ChevronDown } from 'lucide-react'
import { useLocale } from 'next-intl'
import { useEffect, useId, useRef, useState } from 'react'

const LOCALE_NAMES: Record<string, string> = {
  en: 'English',
  ro: 'Română'
}

function LocaleFlag({ locale }: { locale: string }) {
  if (locale === 'ro') {
    return (
      <svg
        viewBox="0 0 18 12"
        aria-hidden="true"
        className="h-3 w-[18px] rounded-[2px] shadow-sm"
      >
        <path fill="#002B7F" d="M0 0h6v12H0z" />
        <path fill="#FCD116" d="M6 0h6v12H6z" />
        <path fill="#CE1126" d="M12 0h6v12h-6z" />
      </svg>
    )
  }

  return (
    <svg
      viewBox="0 0 18 12"
      aria-hidden="true"
      className="h-3 w-[18px] rounded-[2px] shadow-sm"
    >
      <path fill="#012169" d="M0 0h18v12H0z" />
      <path stroke="#fff" strokeWidth="2.4" d="m0 0 18 12M18 0 0 12" />
      <path stroke="#C8102E" strokeWidth="1.2" d="m0 0 18 12M18 0 0 12" />
      <path stroke="#fff" strokeWidth="4" d="M9 0v12M0 6h18" />
      <path stroke="#C8102E" strokeWidth="2.2" d="M9 0v12M0 6h18" />
    </svg>
  )
}

export function LanguageSwitcher({
  variant = 'default',
  placement = 'bottom'
}: {
  variant?: 'default' | 'cinematic'
  placement?: 'top' | 'bottom'
}) {
  const locale = useLocale()
  const pathname = usePathname()
  const router = useRouter()
  const menuId = useId()
  const [isOpen, setIsOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([])

  useEffect(() => {
    function closeOnOutsideClick(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setIsOpen(false)
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape' && isOpen) {
        setIsOpen(false)
        triggerRef.current?.focus()
      }
    }

    document.addEventListener('mousedown', closeOnOutsideClick)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return
    const selectedIndex = Math.max(0, locales.indexOf(locale as 'en' | 'ro'))
    const frame = requestAnimationFrame(() => {
      optionRefs.current[selectedIndex]?.focus()
    })
    return () => cancelAnimationFrame(frame)
  }, [isOpen, locale])

  function switchLocale(newLocale: string) {
    setIsOpen(false)
    const destination = `${pathname}${window.location.search}${window.location.hash}`
    router.replace(destination, { locale: newLocale as 'en' | 'ro' })
  }

  function handleMenuKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Tab') {
      setIsOpen(false)
      return
    }

    const currentIndex = optionRefs.current.findIndex(
      (option) => option === document.activeElement
    )
    let nextIndex: number | undefined

    if (event.key === 'ArrowDown') {
      nextIndex = (currentIndex + 1) % locales.length
    } else if (event.key === 'ArrowUp') {
      nextIndex = (currentIndex - 1 + locales.length) % locales.length
    } else if (event.key === 'Home') {
      nextIndex = 0
    } else if (event.key === 'End') {
      nextIndex = locales.length - 1
    }

    if (nextIndex !== undefined) {
      event.preventDefault()
      optionRefs.current[nextIndex]?.focus()
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <Button
        variant="ghost"
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-controls={menuId}
        aria-label={`${LOCALE_NAMES[locale]} language`}
        onClick={() => setIsOpen((open) => !open)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault()
            setIsOpen(true)
          }
        }}
        className={
          variant === 'cinematic'
            ? 'flex h-9 cursor-pointer items-center gap-2 rounded-lg px-2 font-[family-name:var(--font-studio)] text-[10px] font-semibold uppercase tracking-[0.12em] text-white/60 outline-none transition-all hover:bg-white/[0.05] hover:text-white focus-visible:ring-2 focus-visible:ring-[#5b8cff]/80'
            : 'flex min-w-[122px] cursor-pointer items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-xs font-medium text-foreground shadow-sm transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-primary/40'
        }
      >
        <LocaleFlag locale={locale} />
        <span>
          {variant === 'cinematic'
            ? locale.toUpperCase()
            : LOCALE_NAMES[locale]}
        </span>
        {variant !== 'cinematic' && (
          <ChevronDown
            className={`ml-auto h-3 w-3 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
          />
        )}
      </Button>

      <div
        id={menuId}
        role="menu"
        aria-label={locale === 'ro' ? 'Limbă' : 'Language'}
        onKeyDown={handleMenuKeyDown}
        className={`absolute right-0 z-[70] overflow-hidden rounded-xl p-1.5 transition-all duration-200 ${variant === 'cinematic' ? 'w-[86px]' : 'left-0 w-full'} ${placement === 'top' ? 'bottom-[calc(100%+8px)] origin-bottom' : 'top-[calc(100%+8px)] origin-top'} ${variant === 'cinematic' ? 'border border-white/10 bg-[#08111f]/95 font-[family-name:var(--font-studio)] shadow-[0_20px_60px_rgba(0,0,0,0.55)] backdrop-blur-2xl' : 'border border-border bg-popover text-popover-foreground shadow-xl'} ${isOpen ? 'visible translate-y-0 scale-100 opacity-100' : `invisible scale-95 opacity-0 ${placement === 'top' ? 'translate-y-1' : '-translate-y-1'}`}`}
      >
        {locales.map((localeOption, index) => (
          <Button
            variant="ghost"
            ref={(element) => {
              optionRefs.current[index] = element
            }}
            type="button"
            role="menuitemradio"
            aria-checked={localeOption === locale}
            key={localeOption}
            onClick={() => switchLocale(localeOption)}
            className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-[0.1em] transition-colors ${variant === 'cinematic' ? (localeOption === locale ? 'bg-white/[0.08] text-white' : 'text-white/50 hover:bg-white/[0.05] hover:text-white') : localeOption === locale ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}
          >
            <LocaleFlag locale={localeOption} />
            <span>
              {variant === 'cinematic'
                ? localeOption.toUpperCase()
                : LOCALE_NAMES[localeOption]}
            </span>
            {localeOption === locale && (
              <Check
                className={`ml-auto h-3.5 w-3.5 ${variant === 'cinematic' ? 'text-[#7aa2ff]' : 'text-primary'}`}
              />
            )}
          </Button>
        ))}
      </div>
    </div>
  )
}
