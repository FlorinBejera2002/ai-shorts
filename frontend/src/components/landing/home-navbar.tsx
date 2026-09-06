'use client'

import { Link } from '@/i18n/navigation'
import { ArrowUpRight, Menu } from 'lucide-react'
import { useLocale } from 'next-intl'
import { useId, useState } from 'react'
import { NavLogo } from './animated-hero'
import { HomeLanguageSwitcher as LanguageSwitcher } from './home-language-switcher'

interface HomeNavbarProps {
  labels: {
    pricing: string
    signIn: string
    getStarted: string
  }
}

export function HomeNavbar({ labels }: HomeNavbarProps) {
  const forceDark = true
  const locale = useLocale()
  const menuId = useId()
  const [menuOpen, setMenuOpen] = useState(false)
  const navigationLabel =
    locale === 'ro' ? 'Navigare principală' : 'Primary navigation'
  const homeLabel =
    locale === 'ro' ? 'Pagina principală Sneepcut' : 'Sneepcut home'
  const menuLabel =
    locale === 'ro'
      ? menuOpen
        ? 'Închide meniul'
        : 'Deschide meniul'
      : menuOpen
        ? 'Close menu'
        : 'Open menu'

  return (
    <nav
      aria-label={navigationLabel}
      className="fixed inset-x-0 top-0 z-50 px-3 pt-3 sm:px-6 sm:pt-4"
    >
      <div
        className={`group/nav relative mx-auto flex max-w-7xl items-center justify-between overflow-visible rounded-2xl border border-white/[0.09] px-2 py-2 shadow-[0_1px_0_rgba(255,255,255,0.04)_inset,0_18px_60px_rgba(0,0,0,0.34)] backdrop-blur-2xl sm:px-2.5 ${forceDark ? 'bg-[#090909]/[0.86]' : 'bg-[#111111]/[0.88]'}`}
      >
        <div className="pointer-events-none absolute inset-x-10 -top-px h-px bg-gradient-to-r from-transparent via-[#5139ef]/60 to-transparent" />
        <div className="pointer-events-none absolute -top-10 left-12 h-16 w-36 rounded-full bg-[#5139ef]/15 blur-2xl" />
        <div className="relative flex shrink-0 items-center gap-3 sm:gap-4">
          <Link
            href="/"
            aria-label={homeLabel}
            className="shrink-0 rounded-xl outline-none transition-transform duration-300 hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-[#5139ef]/80 motion-reduce:transition-none"
          >
            <NavLogo variant="white-text" />
          </Link>
          <div className="hidden sm:block">
            <LanguageSwitcher variant="cinematic" />
          </div>
        </div>

        <div className="flex items-center gap-1.5 font-[family-name:var(--font-studio)] sm:gap-2">
          <Link
            href="/pricing"
            className="hidden rounded-full px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.13em] text-white/50 outline-none transition-all hover:bg-white/[0.05] hover:text-white focus-visible:ring-2 focus-visible:ring-[#5139ef]/80 md:inline-flex motion-reduce:transition-none"
          >
            {labels.pricing}
          </Link>
          <Link
            href="/login"
            className="hidden rounded-full px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.13em] text-white/50 outline-none transition-all hover:bg-white/[0.05] hover:text-white focus-visible:ring-2 focus-visible:ring-[#5139ef]/80 md:inline-flex motion-reduce:transition-none"
          >
            {labels.signIn}
          </Link>
          <span
            className="mx-0.5 hidden h-5 w-px bg-white/10 md:block"
            aria-hidden="true"
          />
          <Link
            href="/register"
            className="group relative ml-0.5 hidden h-10 items-center gap-2 rounded-[11px] bg-[#5139ef] px-3.5 text-white shadow-[0_1px_0_rgba(255,255,255,0.2)_inset,0_8px_24px_rgba(81,57,239,0.3)] outline-none transition-all duration-300 hover:-translate-y-0.5 hover:bg-[#6049f4] hover:shadow-[0_1px_0_rgba(255,255,255,0.25)_inset,0_12px_30px_rgba(81,57,239,0.42)] focus-visible:ring-2 focus-visible:ring-[#8f80ff] focus-visible:ring-offset-2 focus-visible:ring-offset-[#10120f] sm:inline-flex sm:px-4 motion-reduce:transition-none"
          >
            <span className="text-[9px] font-bold uppercase tracking-[0.11em] sm:text-[10px] sm:tracking-[0.12em]">
              {labels.getStarted}
            </span>
            <ArrowUpRight
              className="h-3.5 w-3.5 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 motion-reduce:transition-none"
              strokeWidth={2.25}
              aria-hidden="true"
            />
          </Link>

          <details
            className="group/menu relative sm:hidden"
            onToggle={(event) => setMenuOpen(event.currentTarget.open)}
          >
            <summary
              aria-label={menuLabel}
              aria-expanded={menuOpen}
              aria-controls={menuId}
              role="button"
              className="flex h-10 w-10 cursor-pointer list-none items-center justify-center rounded-[11px] border border-white/10 bg-white/[0.04] text-white/75 outline-none transition-colors hover:bg-white/[0.08] focus-visible:ring-2 focus-visible:ring-[#8f80ff] [&::-webkit-details-marker]:hidden"
            >
              <Menu className="h-4 w-4" aria-hidden="true" />
            </summary>
            <div
              id={menuId}
              className="absolute right-0 top-[calc(100%+10px)] w-[min(18rem,calc(100vw-1.5rem))] rounded-2xl border border-white/10 bg-[#090909]/95 p-3 shadow-[0_24px_70px_rgba(0,0,0,.58)] backdrop-blur-2xl"
            >
              <div
                className={`flex items-center ${forceDark ? 'justify-start' : 'justify-between'} border-b border-white/10 pb-3`}
              >
                <LanguageSwitcher variant="cinematic" />
              </div>
              <div className="grid gap-1 pt-3">
                <Link
                  href="/pricing"
                  className="rounded-xl px-3 py-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-white/65 hover:bg-white/[0.06] hover:text-white"
                >
                  {labels.pricing}
                </Link>
                <Link
                  href="/login"
                  className="rounded-xl px-3 py-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-white/65 hover:bg-white/[0.06] hover:text-white"
                >
                  {labels.signIn}
                </Link>
                <Link
                  href="/register"
                  className="mt-1 flex min-h-11 items-center justify-between rounded-xl bg-[#5139ef] px-3.5 text-[11px] font-bold uppercase tracking-[0.12em] text-white"
                >
                  {labels.getStarted}
                  <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </div>
            </div>
          </details>
        </div>
      </div>
    </nav>
  )
}
