'use client'

import { Link, usePathname } from '@/i18n/navigation'
import {
  dashboardNavigation,
  isDashboardRouteActive
} from '@/lib/dashboard-navigation'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import {
  CalendarClock,
  CreditCard,
  FilePenLine,
  Film,
  FolderKanban,
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
import { useEffect, useState } from 'react'

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
  history: FolderKanban,
  calendar: CalendarClock,
  billing: CreditCard,
  settings: SlidersHorizontal
}

export function MobileDashboardDock() {
  const pathname = usePathname()
  const locale = useLocale()
  const t = useTranslations('nav')
  const reducedMotion = useReducedMotion()
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    if (!menuOpen) return
    const previousOverflow = document.body.style.overflow
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false)
    }
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [menuOpen])

  const transition = reducedMotion
    ? { duration: 0 }
    : { type: 'spring' as const, stiffness: 420, damping: 34, mass: 0.75 }
  const menuActive = menuItems.some((item) =>
    isDashboardRouteActive(pathname, item.href)
  )

  return (
    <>
      <AnimatePresence>
        {menuOpen && (
          <>
            <motion.button
              type="button"
              aria-label={t('closeMenu')}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: reducedMotion ? 0 : 0.2 }}
              onClick={() => setMenuOpen(false)}
              className="fixed inset-0 z-40 rounded-none bg-black/45 backdrop-blur-[2px] lg:hidden"
            />
            <motion.section
              id="mobile-pages-menu"
              role="dialog"
              aria-modal="true"
              aria-labelledby="mobile-pages-menu-title"
              initial={
                reducedMotion ? false : { opacity: 0, y: 28, scale: 0.96 }
              }
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 24, scale: 0.97 }}
              transition={transition}
              className="fixed inset-x-0 bottom-[calc(84px+env(safe-area-inset-bottom))] z-50 mx-auto max-h-[calc(100dvh-118px)] w-[310px] max-w-[calc(100vw-40px)] overflow-y-auto rounded-md border border-white/10 bg-[#101010] p-3 text-white shadow-[0_24px_70px_rgba(0,0,0,.42)] lg:hidden"
            >
              <div className="flex items-center justify-between px-1 pb-2.5">
                <div>
                  <h2
                    id="mobile-pages-menu-title"
                    className="text-base font-semibold"
                  >
                    {locale === 'ro' ? 'Meniu' : 'Menu'}
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => setMenuOpen(false)}
                  aria-label={t('closeMenu')}
                  className="grid size-10 place-items-center rounded-full text-white/55 transition-colors hover:bg-white/10 hover:text-white"
                >
                  <X className="size-[18px]" />
                </button>
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
                        className={`flex min-h-14 items-center gap-2.5 rounded-md border px-3 transition-colors ${
                          active
                            ? 'border-white bg-white text-black'
                            : 'border-white/10 bg-white/[0.04] text-white/70 hover:bg-white/[0.09] hover:text-white'
                        }`}
                      >
                        <span
                          className={`grid size-8 shrink-0 place-items-center rounded-sm ${
                            active ? 'bg-black/[0.08]' : 'bg-white/[0.06]'
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
          </>
        )}
      </AnimatePresence>

      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center px-4 pb-[max(14px,env(safe-area-inset-bottom))] lg:hidden">
        <motion.nav
          layout={true}
          transition={transition}
          aria-label={t('mobileNavigation')}
          className="pointer-events-auto relative flex h-14 items-center gap-1 border border-white/10 bg-[#101010] p-1.5 text-white shadow-[0_18px_55px_rgba(0,0,0,.34)]"
          // The large dock radius intentionally follows the referenced mobile component.
          style={{ borderRadius: 24 }}
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
                className={`relative grid size-10 place-items-center rounded-full transition-colors ${
                  visuallyActive
                    ? 'text-black'
                    : featured
                      ? 'text-white hover:text-white/75'
                      : 'text-white/48 hover:text-white'
                }`}
              >
                {visuallyActive && (
                  <motion.span
                    layoutId="mobile-dock-active"
                    className="absolute inset-0 rounded-full bg-white"
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

          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            aria-label={locale === 'ro' ? 'Deschide meniul' : 'Open menu'}
            aria-expanded={menuOpen}
            aria-controls="mobile-pages-menu"
            className={`relative grid size-10 place-items-center rounded-full transition-colors ${
              menuActive || menuOpen
                ? 'text-black'
                : 'text-white/48 hover:text-white'
            }`}
          >
            {(menuActive || menuOpen) && (
              <motion.span
                layoutId="mobile-dock-active"
                className="absolute inset-0 rounded-full bg-white"
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
        </motion.nav>
      </div>
    </>
  )
}
