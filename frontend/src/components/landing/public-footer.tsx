'use client'

import { ThemeBrandLogo } from '@/components/shared/brand-logo'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Link } from '@/i18n/navigation'
import { useTranslations } from 'next-intl'

export function PublicFooter() {
  const t = useTranslations('landing')
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
          {(['pricing', 'privacy', 'terms'] as const).map((key) => (
            <Button key={key} asChild={true} variant="ghost" size="sm">
              <Link href={`/${key}`}>{t(key)}</Link>
            </Button>
          ))}
          <Button asChild={true} variant="ghost" size="sm">
            <Link href="/data-deletion">{t('dataDeletion')}</Link>
          </Button>
        </div>
      </div>
    </footer>
  )
}
