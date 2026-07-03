import { Link } from '@/i18n/navigation'
import { Flame } from 'lucide-react'
import Image from 'next/image'
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
    <div className="hidden lg:flex lg:w-[45%] relative overflow-hidden bg-gradient-to-br from-primary/90 via-primary to-accent/80">
      <div
        className="absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            'linear-gradient(white 1px, transparent 1px), linear-gradient(90deg, white 1px, transparent 1px)',
          backgroundSize: '48px 48px'
        }}
      />
      <div className="absolute top-[-15%] right-[-10%] w-[50vw] h-[50vw] rounded-full bg-white/[0.06] blur-[80px]" />
      <div className="absolute bottom-[-10%] left-[-5%] w-[40vw] h-[40vw] rounded-full bg-white/[0.04] blur-[60px]" />

      {/* Floating mini clip card */}
      <div
        className="absolute right-10 top-1/2 -translate-y-1/2 animate-float pointer-events-none"
        aria-hidden={true}
      >
        <div className="w-[120px] aspect-[9/16] rounded-2xl border border-white/20 bg-white/[0.07] backdrop-blur-sm p-2 shadow-2xl shadow-black/20 rotate-6">
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

      <div className="relative z-10 flex flex-col justify-between p-12 w-full">
        <Link href="/" className="flex items-center gap-2.5">
          <Image
            src="/logo.webp"
            alt="ClipForge"
            width={36}
            height={36}
            className="rounded-lg brightness-0 invert"
          />
          <span className="text-[15px] font-bold text-white tracking-tight">
            ClipForge
          </span>
        </Link>

        <div className="space-y-6 max-w-[70%]">
          <h2 className="text-3xl font-bold text-white leading-tight tracking-tight">
            {title}
          </h2>
          <p className="text-white/70 text-[15px] leading-relaxed max-w-sm">
            {desc}
          </p>
          {children}
        </div>

        <p className="text-[11px] text-white/40">
          &copy; {new Date().getFullYear()} ClipForge
        </p>
      </div>
    </div>
  )
}
