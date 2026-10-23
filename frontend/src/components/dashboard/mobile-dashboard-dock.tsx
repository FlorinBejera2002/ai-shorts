'use client'

import { Link, usePathname } from '@/i18n/navigation'
import {
  dashboardNavigation,
  isDashboardRouteActive
} from '@/lib/dashboard-navigation'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import {
  CreditCard,
  FilePenLine,
  Film,
  House,
  type LucideIcon,
  Menu,
  Palette,
  Plus,
  Scissors,
  Share2,
  SlidersHorizontal,
  X
} from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { Dialog } from 'radix-ui'
import { useEffect, useRef, useState } from 'react'

const primaryItems = [
  { href: '/dashboard', key: 'home', icon: House },
  { href: '/dashboard/studio', key: 'editor', icon: Scissors },
  { href: '/dashboard/clips', key: 'clips', icon: Film },
  { href: '/dashboard/create', key: 'newProject', icon: Plus, featured: true },
  { href: '/dashboard/brand', key: 'brand', icon: Palette },
  { href: '/dashboard/publish', key: 'publish', icon: Share2 }
] as const

const primaryHrefs = new Set<string>(primaryItems.map((item) => item.href))
const menuGroups = dashboardNavigation
  .map((group) => ({
    ...group,
    items: group.items.filter((item) => !primaryHrefs.has(item.href))
  }))
  .filter((group) => group.items.length > 0)
const menuItems = menuGroups.flatMap((group) => group.items)

const menuIcons: Record<string, LucideIcon> = {
  scripts: FilePenLine,
  billing: CreditCard,
  settings: SlidersHorizontal
}

export function MobileDashboardDock() {
  const pathname = usePathname()
  const locale = useLocale()
  const t = useTranslations('nav')
  const reducedMotion = useReducedMotion()
  const [menuOpen, setMenuOpen] = useState(false)
  const closeButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    const desktop = window.matchMedia('(min-width: 1024px)')
    const closeOnDesktop = () => {
      if (desktop.matches) setMenuOpen(false)
    }
    desktop.addEventListener('change', closeOnDesktop)
    closeOnDesktop()
    return () => desktop.removeEventListener('change', closeOnDesktop)
  }, [menuOpen])

  const transition = reducedMotion
    ? { duration: 0 }
    : { type: 'spring' as const, stiffness: 420, damping: 34, mass: 0.75 }
  const menuActive = menuItems.some((item) =>
    isDashboardRouteActive(pathname, item.href)
  )

  return (
    <Dialog.Root open={menuOpen} onOpenChange={setMenuOpen}>
      <AnimatePresence>
        {menuOpen && (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: reducedMotion ? 0 : 0.2 }}
                className="fixed inset-0 z-40 rounded-none bg-black/45 backdrop-blur-[2px] lg:hidden"
              />
            </Dialog.Overlay>
            <Dialog.Content
              asChild
              aria-describedby={undefined}
              onOpenAutoFocus={(event) => {
                event.preventDefault()
                closeButtonRef.current?.focus()
              }}
            >
              <motion.section
                id="mobile-pages-menu"
                data-mobile-menu-dialog=""
                initial={
                  reducedMotion ? false : { opacity: 0, y: 28, scale: 0.96 }
                }
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 24, scale: 0.97 }}
                transition={transition}
                className="fixed inset-x-0 bottom-[calc(84px+env(safe-area-inset-bottom))] z-50 mx-auto max-h-[calc(100dvh-118px)] w-[310px] max-w-[calc(100vw-40px)] overflow-y-auto rounded-md border border-border bg-background p-3 text-foreground shadow-[0_24px_70px_rgba(0,0,0,.24)] outline-none lg:hidden"
              >
                <div className="flex items-center justify-between px-1 pb-2.5">
                  <div>
                    <Dialog.Title className="text-base font-semibold">
                      {locale === 'ro' ? 'Meniu' : 'Menu'}
                    </Dialog.Title>
                  </div>
                  <Dialog.Close asChild>
                    <button
                      ref={closeButtonRef}
                      data-mobile-menu-close=""
                      type="button"
                      aria-label={t('closeMenu')}
                      className="grid size-10 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
                    >
                      <X className="size-[18px]" />
                    </button>
                  </Dialog.Close>
                </div>

                <div className="grid grid-cols-2 gap-1.5">
                  {menuItems.map((item, itemIndex) => {
                    const Icon = menuIcons[item.key] ?? FilePenLine
                    const active = isDashboardRouteActive(pathname, item.href)
                    const fillsLastRow =
                      menuItems.length % 2 === 1 &&
                      itemIndex === menuItems.length - 1

                    return (
                      <motion.div
                        key={item.href}
                        initial={
                          reducedMotion
                            ? false
                            : { opacity: 0, y: 10, scale: 0.97 }
                        }
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        transition={{
                          delay: reducedMotion ? 0 : itemIndex * 0.035,
                          duration: reducedMotion ? 0 : 0.22
                        }}
                        className={fillsLastRow ? 'col-span-2' : undefined}
                      >
                        <Link
                          href={item.href}
                          onClick={() => setMenuOpen(false)}
                          aria-current={active ? 'page' : undefined}
                          className={`flex min-h-14 items-center gap-2.5 rounded-md border px-3 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground ${
                            active
                              ? 'border-foreground bg-foreground text-background'
                              : 'border-border bg-muted/40 text-foreground hover:bg-muted'
                          }`}
                        >
                          <span
                            className={`grid size-8 shrink-0 place-items-center rounded-sm ${
                              active ? 'bg-background/10' : 'bg-muted'
                            }`}
                          >
                            <Icon className="size-[18px]" strokeWidth={1.8} />
                          </span>
                          <span className="text-[13px] font-medium leading-4">
                            {t(item.key)}
                          </span>
                        </Link>
                      </motion.div>
                    )
                  })}
                </div>
              </motion.section>
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </AnimatePresence>

      <div
        data-mobile-dashboard-dock=""
        className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center px-4 pb-[max(14px,env(safe-area-inset-bottom))] lg:hidden"
      >
        <motion.nav
          layout={true}
          transition={transition}
          aria-label={t('mobileNavigation')}
          className="pointer-events-auto relative flex h-14 items-center gap-1 rounded-md border border-border bg-background p-1.5 text-foreground shadow-[0_18px_55px_rgba(0,0,0,.24)]"
          style={{ pointerEvents: menuOpen ? 'none' : undefined }}
        >
          {primaryItems.map((item) => {
            const { href, key, icon: Icon } = item
            const active = isDashboardRouteActive(pathname, href)
            const visuallyActive = active && !menuOpen
            const featured = 'featured' in item && item.featured
            return (
              <Link
                key={href}
                href={href}
                aria-label={t(key)}
                aria-current={active ? 'page' : undefined}
                tabIndex={menuOpen ? -1 : undefined}
                className={`relative grid size-10 place-items-center rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground ${
                  visuallyActive
                    ? 'text-background'
                    : featured
                      ? 'text-foreground hover:text-muted-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {visuallyActive && (
                  <motion.span
                    layoutId="mobile-dock-active"
                    className="absolute inset-0 rounded-full bg-foreground"
                    transition={transition}
                  />
                )}
                <Icon
                  className={`relative z-10 ${featured ? 'size-6' : 'size-[18px]'}`}
                  strokeWidth={featured ? 2.2 : 1.8}
                />
              </Link>
            )
          })}

          <Dialog.Trigger asChild>
            <button
              data-mobile-menu-trigger=""
              type="button"
              aria-label={locale === 'ro' ? 'Deschide meniul' : 'Open menu'}
              aria-controls="mobile-pages-menu"
              style={{ pointerEvents: 'auto' }}
              className={`relative grid size-10 place-items-center rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground ${
                menuActive || menuOpen
                  ? 'text-background'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {(menuActive || menuOpen) && (
                <motion.span
                  layoutId="mobile-dock-active"
                  className="absolute inset-0 rounded-full bg-foreground"
                  transition={transition}
                />
              )}
              <motion.span
                animate={{ rotate: menuOpen ? 90 : 0 }}
                transition={transition}
                className="relative z-10"
              >
                {menuOpen ? (
                  <X className="size-[18px]" strokeWidth={1.8} />
                ) : (
                  <Menu className="size-[18px]" strokeWidth={1.8} />
                )}
              </motion.span>
            </button>
          </Dialog.Trigger>
        </motion.nav>
      </div>
    </Dialog.Root>
  )
}
