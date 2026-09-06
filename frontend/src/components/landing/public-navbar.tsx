'use client'

import { ThemeBrandLogo } from '@/components/shared/brand-logo'
import { LanguageSwitcher } from '@/components/shared/language-switcher'
import { ThemeToggle } from '@/components/shared/theme-toggle'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger
} from '@/components/ui/sheet'
import { Link } from '@/i18n/navigation'
import { ArrowUpRight, Menu, X } from 'lucide-react'
import { useLocale } from 'next-intl'
import { useEffect, useState } from 'react'

interface PublicNavbarProps {
  labels: { pricing: string; signIn: string; getStarted: string }
  forceDark?: boolean
}

export function PublicNavbar({ labels, forceDark = false }: PublicNavbarProps) {
  const locale = useLocale()
  const [open, setOpen] = useState(false)
  useEffect(() => {
    const media = window.matchMedia('(min-width: 768px)')
    const close = () => {
      if (media.matches) setOpen(false)
    }
    media.addEventListener('change', close)
    return () => media.removeEventListener('change', close)
  }, [])
  useEffect(() => {
    if (locale) setOpen(false)
  }, [locale])
  const title = locale === 'ro' ? 'Navigare principală' : 'Primary navigation'
  return (
    <nav
      aria-label={title}
      className={`fixed inset-x-0 top-0 z-50 border-b bg-background/95 backdrop-blur-lg ${forceDark ? 'dark' : ''}`}
    >
      <div className="mx-auto flex h-20 max-w-7xl items-center justify-between gap-4 px-5 sm:px-6">
        <Link
          href="/"
          aria-label={
            locale === 'ro' ? 'Pagina principală Sneepcut' : 'Sneepcut home'
          }
          className="rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ThemeBrandLogo />
        </Link>
        <div className="hidden items-center gap-2 md:flex">
          <Button asChild={true} variant="ghost">
            <Link href="/pricing">{labels.pricing}</Link>
          </Button>
          <Separator orientation="vertical" className="mx-2 h-5" />
          <LanguageSwitcher />
          {!forceDark && <ThemeToggle />}
          <Button asChild={true} variant="ghost">
            <Link href="/login">{labels.signIn}</Link>
          </Button>
          <Button asChild={true}>
            <Link href="/register">
              {labels.getStarted}
              <ArrowUpRight className="size-4" />
            </Link>
          </Button>
        </div>
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild={true}>
            <Button
              variant="outline"
              size="icon"
              className="md:hidden"
              aria-label={locale === 'ro' ? 'Deschide meniul' : 'Open menu'}
            >
              <Menu className="size-5" />
            </Button>
          </SheetTrigger>
          <SheetContent className="w-[min(22rem,90vw)]" showCloseButton={false}>
            <SheetHeader>
              <SheetTitle>{title}</SheetTitle>
              <SheetDescription>Sneepcut studio</SheetDescription>
            </SheetHeader>
            <SheetClose asChild={true}>
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-3 top-3"
                aria-label={locale === 'ro' ? 'Închide meniul' : 'Close menu'}
              >
                <X className="size-4" />
              </Button>
            </SheetClose>
            <div className="grid gap-3 p-4">
              <div className="flex items-center justify-between">
                <LanguageSwitcher />
                {!forceDark && <ThemeToggle />}
              </div>
              <Separator />
              <SheetClose asChild={true}>
                <Button
                  asChild={true}
                  variant="ghost"
                  className="justify-start"
                >
                  <Link href="/pricing">{labels.pricing}</Link>
                </Button>
              </SheetClose>
              <SheetClose asChild={true}>
                <Button
                  asChild={true}
                  variant="ghost"
                  className="justify-start"
                >
                  <Link href="/login">{labels.signIn}</Link>
                </Button>
              </SheetClose>
              <SheetClose asChild={true}>
                <Button asChild={true}>
                  <Link href="/register">
                    {labels.getStarted}
                    <ArrowUpRight className="size-4" />
                  </Link>
                </Button>
              </SheetClose>
            </div>
          </SheetContent>
        </Sheet>
        <noscript>
          <div className="flex flex-wrap gap-2 text-xs md:hidden">
            <Link href="/pricing">{labels.pricing}</Link>
            <Link href="/login">{labels.signIn}</Link>
            <Link href="/register">{labels.getStarted}</Link>
          </div>
        </noscript>
      </div>
    </nav>
  )
}
