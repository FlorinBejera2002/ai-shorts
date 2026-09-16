'use client'

import { ThemeBrandLogo } from '@/components/shared/brand-logo'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Link } from '@/i18n/navigation'
import { useTranslations } from 'next-intl'

export function PublicFooter() {
  const t = useTranslations('landing')
  const links = [
    { href: '/pricing', label: 'pricing' },
    { href: '/legal-notice', label: 'legalNotice' },
    { href: '/privacy', label: 'privacy' },
    { href: '/terms', label: 'terms' },
    { href: '/cookie-policy', label: 'cookiePolicy' },
    { href: '/acceptable-use', label: 'acceptableUse' },
    { href: '/refund-policy', label: 'refundPolicy' },
    { href: '/subprocessors', label: 'subprocessors' },
    { href: '/dpa', label: 'dpa' },
    { href: '/data-deletion', label: 'dataDeletion' }
  ] as const

  return (
    <footer className="bg-card">
      <Separator />
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-6 py-10 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Link href="/" aria-label="Sneepcut">
            <ThemeBrandLogo />
          </Link>
          <p className="mt-3 text-xs text-muted-foreground">
            {t('footer', { year: new Date().getFullYear() })}
          </p>
        </div>
        <div className="flex flex-wrap gap-1">
          {links.map(({ href, label }) => (
            <Button key={href} asChild={true} variant="ghost" size="sm">
              <Link href={href}>{t(label)}</Link>
            </Button>
          ))}
        </div>
      </div>
    </footer>
  )
}
