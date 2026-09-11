import { BrandLogo } from '@/components/shared/brand-logo'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Link } from '@/i18n/navigation'
import { Captions, ScanFace, Scissors } from 'lucide-react'
import type { ReactNode } from 'react'

export function AuthPanel({
  title,
  desc,
  children
}: { title: string; desc: string; children?: ReactNode }) {
  return (
    <aside className="dark relative hidden min-h-dvh w-[44%] flex-col justify-between overflow-hidden border-r border-border bg-sidebar p-10 text-white lg:flex xl:p-14">
      <Link
        href="/"
        className="w-fit rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <BrandLogo variant="white-text" />
      </Link>
      <div className="relative my-16 max-w-lg">
        <Badge
          variant="outline"
          className="mb-7 rounded-md border-primary/30 bg-primary/10 px-3 py-1 text-primary"
        >
          <BrandLogo variant="white-text" size="sm" />
        </Badge>
        <h2 className="text-5xl font-semibold leading-[1.06] tracking-[-0.045em] xl:text-6xl">
          {title}
        </h2>
        <p className="mt-6 max-w-md text-base leading-7 text-slate-400">
          {desc}
        </p>
        {children && (
          <div className="mt-8 border-t border-border pt-6">{children}</div>
        )}
        <Card
          className="mt-10 gap-0 border-border bg-card/70 py-0 shadow-none"
          aria-hidden="true"
        >
          <CardContent className="flex items-center gap-4 p-5">
            {[Scissors, ScanFace, Captions].map((Icon) => (
              <div
                key={Icon.displayName}
                className="flex flex-1 flex-col items-center gap-4"
              >
                <span className="flex size-11 items-center justify-center rounded-xl border border-border bg-background text-primary">
                  <Icon className="size-5" />
                </span>
                <div className="h-1.5 w-full rounded-full bg-primary/20" />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
      <p className="text-xs text-slate-500">
        &copy; {new Date().getFullYear()} sneepcut
      </p>
    </aside>
  )
}
