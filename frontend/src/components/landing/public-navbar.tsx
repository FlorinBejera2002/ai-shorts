import { Link } from '@/i18n/navigation'
import { LanguageSwitcher } from '@/components/shared/language-switcher'
import { NavLogo } from './animated-hero'

interface PublicNavbarProps {
  labels: {
    pricing: string
    signIn: string
    getStarted: string
  }
}

export function PublicNavbar({ labels }: PublicNavbarProps) {
  return (
    <nav className="fixed inset-x-0 top-0 z-50 px-3 pt-3 sm:px-6 sm:pt-4">
      <div className="mx-auto flex max-w-7xl items-center justify-between rounded-[18px] border border-white/[0.09] bg-[#07050d]/78 px-2.5 py-2 shadow-[0_16px_50px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-2xl sm:px-3.5">
        <Link href="/" className="rounded-xl px-1 py-0.5">
          <NavLogo />
        </Link>
        <div className="flex items-center gap-1 font-[family-name:var(--font-studio)] sm:gap-2">
          <div className="hidden sm:block">
            <LanguageSwitcher variant="cinematic" />
          </div>
          <Link href="/pricing" className="hidden rounded-full px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/45 transition-colors hover:bg-white/[0.04] hover:text-white md:inline-flex">
            {labels.pricing}
          </Link>
          <Link href="/login" className="rounded-full px-2 py-2 text-[9px] font-semibold uppercase tracking-[0.1em] text-white/50 transition-colors hover:bg-white/[0.04] hover:text-white max-[359px]:hidden sm:px-3 sm:text-[10px] sm:tracking-[0.12em]">
            {labels.signIn}
          </Link>
          <Link href="/register" className="group relative ml-1 inline-flex items-center overflow-hidden rounded-[11px] border border-violet-200/30 bg-gradient-to-b from-violet-200/20 to-violet-500/10 p-px shadow-[0_8px_24px_rgba(109,40,217,0.18)] transition-all hover:border-cyan-100/40 hover:shadow-[0_10px_30px_rgba(109,40,217,0.28)]">
            <span className="relative rounded-[10px] bg-white px-3 py-2 text-[9px] font-bold uppercase tracking-[0.08em] text-[#0a0710] transition-colors group-hover:bg-violet-50 sm:px-4 sm:text-[10px] sm:tracking-[0.1em]">
              {labels.getStarted}
            </span>
          </Link>
        </div>
      </div>
    </nav>
  )
}
