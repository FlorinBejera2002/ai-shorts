import { BrandLogo } from '@/components/shared/brand-logo'
import { Link } from '@/i18n/navigation'
import { Flame } from 'lucide-react'
import type { ReactNode } from 'react'

/**
 * Decorative left panel shared by the login and register pages.
 * Server-renderable — animations are CSS-only.
 */
export function AuthPanel({
  title,
  desc,
  children
}: {
  title: string
  desc: string
  children?: ReactNode
}) {
  return (
    <div className="relative hidden overflow-hidden bg-[#08060d] text-white lg:flex lg:w-[50%]">
      <div
        className="absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(167,139,250,.14) 1px, transparent 1px), linear-gradient(90deg, rgba(167,139,250,.14) 1px, transparent 1px)',
          backgroundSize: '48px 48px'
        }}
      />
      <div className="absolute -top-[15%] right-[-10%] h-[50vw] w-[50vw] rounded-full bg-violet-500/[0.1] blur-[100px]" />
      <div className="absolute -bottom-[15%] left-[-10%] h-[42vw] w-[42vw] rounded-full bg-cyan-500/[0.045] blur-[90px]" />
      <div className="absolute -top-20 left-[18%] h-[75vh] w-24 -rotate-[16deg] bg-violet-400/[0.07] blur-2xl" />

      {/* Floating mini clip card */}
      <div
        className="absolute right-10 top-1/2 -translate-y-1/2 animate-float pointer-events-none"
        aria-hidden={true}
      >
        <div className="aspect-[9/16] w-[120px] rotate-6 rounded-2xl border border-violet-200/15 bg-white/[0.045] p-2 shadow-2xl shadow-black/30 backdrop-blur-sm">
          <div className="h-full rounded-xl bg-gradient-to-b from-white/[0.12] to-white/[0.03] relative overflow-hidden">
            <div className="absolute top-2 right-2 flex items-center gap-0.5 rounded-full bg-black/30 px-1.5 py-0.5">
              <Flame className="w-2 h-2 text-orange-300" />
              <span className="text-[8px] font-bold text-white">94</span>
            </div>
            <div className="absolute bottom-3 left-2 right-2 space-y-1">
              <div className="h-1 w-3/4 rounded-full bg-white/40" />
              <div className="h-1 w-1/2 rounded-full bg-white/25" />
            </div>
          </div>
        </div>
      </div>

      <div className="relative z-10 flex w-full flex-col justify-between p-12 xl:p-16">
        <Link href="/" className="flex items-center gap-2.5">
          <BrandLogo onDark={true} />
        </Link>

        <div className="max-w-[76%] space-y-6">
          <div className="font-[family-name:var(--font-studio)] text-[9px] font-bold uppercase tracking-[.3em] text-violet-200/55">
            AI post-production studio
          </div>
          <h2 className="font-[family-name:var(--font-cinematic)] text-6xl font-medium leading-[.9] tracking-[-0.05em] text-white">
            {title}
          </h2>
          <p className="max-w-sm font-[family-name:var(--font-studio)] text-[14px] leading-7 text-white/45">
            {desc}
          </p>
          {children}
        </div>

        <p className="font-[family-name:var(--font-studio)] text-[9px] uppercase tracking-[0.14em] text-white/25">
          &copy; {new Date().getFullYear()} sneepcut
        </p>
      </div>
    </div>
  )
}
