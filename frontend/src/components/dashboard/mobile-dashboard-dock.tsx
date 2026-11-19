'use client'

import theme from '@/components/calendar/publishing-theme.module.css'
import { Link, usePathname } from '@/i18n/navigation'
import { dashboardNavigation, isDashboardRouteActive } from '@/lib/dashboard-navigation'
import { animate, domAnimation, LazyMotion, m, useMotionValue, useReducedMotion, useTransform, type MotionValue } from 'framer-motion'
import { CreditCard, Ellipsis, FilePenLine, Film, House, Palette, Plus, Scissors, Share2, SlidersHorizontal, X, type LucideIcon } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Dialog } from 'radix-ui'
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import styles from './mobile-dashboard-dock.module.css'
import { useDockHiddenByView } from './mobile-dock-visibility'

/** Springs from the wib_account tab bar: the lens, press feedback and the bar sliding away. */
const LENS_SPRING = { type: 'spring', stiffness: 260, damping: 22, mass: 0.8 } as const
const PRESS_SPRING = { type: 'spring', stiffness: 300, damping: 22 } as const
const BAR_SPRING = { type: 'spring', stiffness: 240, damping: 28, mass: 1 } as const
/** Scroll distance that moves the bar fully out, and how far it travels. */
const BAR_TRAVEL = 110
const BAR_OFFSET = 68 + 22 + 16
/** After a dialog closes, scroll in this window is focus/scroll restoration, not the user. */
const RESTORE_QUIET_MS = 500

const tabs = [
  { href: '/dashboard', key: 'dockHome', icon: House },
  { href: '/dashboard/clips', key: 'clips', icon: Film },
  { href: '/dashboard/publish', key: 'publish', icon: Share2 }
] as const
const tabHrefs = new Set<string>(tabs.map((tab) => tab.href))
const tabKey = (href: string) => (href === '/dashboard' ? 'home' : href.split('/').pop()!)
type NavItem = { href: string; key: string }
const navItems: NavItem[] = dashboardNavigation.flatMap((group): readonly NavItem[] => group.items)
const menuItems = navItems.filter((item) => !tabHrefs.has(item.href))
const menuIcons: Record<string, LucideIcon> = { editor: Scissors, brand: Palette, scripts: FilePenLine, billing: CreditCard, settings: SlidersHorizontal }
/** Main pages show the bar; detail pages and editors (kits, clips, posts, Studio) do not. */
const mainPages = new Set<string>(['/dashboard/create', ...navItems.map((item) => item.href)])
mainPages.delete('/dashboard/studio')
// The calendar URL shows the same page as Publish.
mainPages.add('/dashboard/calendar')

/** True while a modal dialog or sheet holds the page (Radix locks scrolling on the body). */
function useModalOpen() {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    const read = () => setOpen(document.body.hasAttribute('data-scroll-locked'))
    read()
    const observer = new MutationObserver(read)
    observer.observe(document.body, { attributes: true, attributeFilter: ['data-scroll-locked'] })
    return () => observer.disconnect()
  }, [])
  return open
}

/** 0 shown .. 1 hidden: follows the scroll like a clamped offset, then settles to the nearer side. */
function useScrollHidden(forceHidden: boolean, resetKey: string) {
  const reduced = useReducedMotion()
  const hidden = useMotionValue(0)
  const wasForced = useRef(forceHidden)
  useEffect(() => {
    const returning = wasForced.current && !forceHidden
    wasForced.current = forceHidden
    // While a page, view or dialog hides the bar, scrolling must not bring it back.
    if (forceHidden) return
    let last = window.scrollY
    let settle = 0
    // A closed dialog or sheet restores focus and scroll; that jump is not the user scrolling,
    // so for a moment it only moves the reference point.
    const quietUntil = returning ? performance.now() + RESTORE_QUIET_MS : 0
    const onScroll = () => {
      const y = window.scrollY
      const dy = y - last
      last = y
      if (performance.now() < quietUntil) return
      if (y < 8) {
        animate(hidden, 0, reduced ? { duration: 0 } : BAR_SPRING)
        return
      }
      if (reduced) {
        hidden.set(dy > 0 ? 1 : 0)
        return
      }
      hidden.stop()
      hidden.set(Math.min(1, Math.max(0, hidden.get() + dy / BAR_TRAVEL)))
      window.clearTimeout(settle)
      settle = window.setTimeout(() => animate(hidden, hidden.get() > 0.5 ? 1 : 0, BAR_SPRING), 140)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.clearTimeout(settle)
    }
  }, [forceHidden, resetKey, hidden, reduced])
  // A new page, an opened dialog or a closed one: glide fully in or out.
  useEffect(() => {
    animate(hidden, forceHidden ? 1 : 0, reduced ? { duration: 0 } : BAR_SPRING)
  }, [forceHidden, resetKey, hidden, reduced])
  return hidden
}

/** The glass lens: springs to the active tab and stretches a little while it travels. */
function useLens(bar: RefObject<HTMLElement | null>, activeKey: string | null) {
  const reduced = useReducedMotion()
  const x = useMotionValue(0)
  const width = useMotionValue(0)
  const scaleX = useMotionValue(1)
  const scaleY = useMotionValue(1)
  const opacity = useMotionValue(0)
  const placed = useRef(false)
  // The bar is display:none on desktop and changes width on rotation: re-measure without animating.
  const [size, setSize] = useState(0)
  useEffect(() => {
    const element = bar.current
    if (!element) return
    const observer = new ResizeObserver(() => {
      placed.current = false
      setSize(element.offsetWidth)
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [bar])
  useLayoutEffect(() => {
    const target = activeKey ? bar.current?.querySelector<HTMLElement>(`[data-dock-tab="${activeKey}"]`) : null
    if (!target || !bar.current) {
      opacity.set(0)
      placed.current = false
      return
    }
    const nextX = target.offsetLeft
    const nextW = target.offsetWidth
    if (nextW === 0) {
      placed.current = false
      return
    }
    opacity.set(1)
    if (!placed.current || reduced) {
      x.set(nextX)
      width.set(nextW)
      placed.current = true
      return
    }
    animate(x, nextX, LENS_SPRING)
    animate(width, nextW, LENS_SPRING)
    // Water-drop feel: wider and flatter mid-way, then it settles.
    animate(scaleX, [1, 1.32, 1], { duration: 0.42, ease: 'easeOut' })
    animate(scaleY, [1, 0.88, 1], { duration: 0.42, ease: 'easeOut' })
  }, [activeKey, bar, size, reduced, x, width, scaleX, scaleY, opacity])
  return { x, width, scaleX, scaleY, opacity }
}

function Tab({ href, label, icon: Icon, active, dockKey, onNavigate }: { href: string; label: string; icon: LucideIcon; active: boolean; dockKey: string; onNavigate?: () => void }) {
  return (
    <m.span className={styles.slot} whileTap={{ scale: 0.9 }} transition={PRESS_SPRING} data-dock-tab={dockKey}>
      <Link href={href} aria-label={label} aria-current={active ? 'page' : undefined} className={styles.tab} onClick={onNavigate}>
        <m.span animate={{ scale: active ? 1.06 : 1, y: active ? -1.5 : 0 }} transition={LENS_SPRING} style={{ display: 'flex' }}>
          <Icon aria-hidden="true" strokeWidth={1.9} />
        </m.span>
        <span>{label}</span>
      </Link>
    </m.span>
  )
}

export function MobileDashboardDock() {
  const pathname = usePathname()
  const [menuOpen, setMenuOpen] = useState(false)
  const modal = useModalOpen()
  const page = pathname.split('?')[0]
  const hiddenByView = useDockHiddenByView()
  const hiddenByPage = !mainPages.has(page) || hiddenByView || (modal && !menuOpen)
  const hidden = useScrollHidden(hiddenByPage, page)

  // The panel is phone-only: leaving the phone layout closes it.
  useEffect(() => {
    if (!menuOpen) return
    const desktop = window.matchMedia('(min-width: 1024px)')
    const close = () => desktop.matches && setMenuOpen(false)
    desktop.addEventListener('change', close)
    return () => desktop.removeEventListener('change', close)
  }, [menuOpen])

  return (
    <LazyMotion features={domAnimation} strict>
      <Dialog.Root open={menuOpen} onOpenChange={setMenuOpen}>
        <DockBar pathname={pathname} hidden={hidden} hiddenByPage={hiddenByPage} menuOpen={menuOpen} />
        <DockMenu pathname={pathname} onNavigate={() => setMenuOpen(false)} />
      </Dialog.Root>
    </LazyMotion>
  )
}

/** The glass capsule: tabs, the round create button and the Meniu trigger. */
function DockBar({ pathname, hidden, hiddenByPage, menuOpen }: { pathname: string; hidden: MotionValue<number>; hiddenByPage: boolean; menuOpen: boolean }) {
  const t = useTranslations('nav')
  const reduced = useReducedMotion()
  const bar = useRef<HTMLElement>(null)
  const translateY = useTransform(hidden, (value) => value * BAR_OFFSET)
  const opacity = useTransform(hidden, [0, 0.6, 1], [1, 0.85, 0])
  const scale = useTransform(hidden, [0, 1], [1, 0.94])
  const active = tabs.find((tab) => isDashboardRouteActive(pathname, tab.href))
  const activeTab = active ? tabKey(active.href) : null
  const menuActive = menuItems.some((item) => isDashboardRouteActive(pathname, item.href))
  const lens = useLens(bar, menuOpen || (!activeTab && menuActive) ? 'menu' : activeTab)
  const tab = (item: (typeof tabs)[number]) => (
    <Tab key={item.href} href={item.href} label={t(item.key)} icon={item.icon} active={activeTab === tabKey(item.href) && !menuOpen} dockKey={tabKey(item.href)} />
  )
  return (
    <m.div className={styles.dock} data-mobile-dashboard-dock="" data-dock-hidden={hiddenByPage ? '' : undefined} inert={hiddenByPage || undefined} aria-hidden={hiddenByPage || undefined} style={{ y: translateY, opacity, scale }}>
      <nav ref={bar} className={styles.bar} aria-label={t('mobileNavigation')}>
        <m.span className={styles.lens} aria-hidden="true" style={{ x: lens.x, width: lens.width, scaleX: lens.scaleX, scaleY: lens.scaleY, opacity: lens.opacity }} />
        {tab(tabs[0])}
        {tab(tabs[1])}
        <span className={styles.center}>
          <m.span whileTap={{ scale: 0.9 }} transition={PRESS_SPRING} style={{ display: 'flex', borderRadius: 999 }}>
            <Link href="/dashboard/create" className={styles.create} aria-label={t('newProject')} aria-current={isDashboardRouteActive(pathname, '/dashboard/create') ? 'page' : undefined}>
              <Plus aria-hidden="true" strokeWidth={2.4} />
            </Link>
          </m.span>
        </span>
        {tab(tabs[2])}
        <m.span className={styles.slot} whileTap={{ scale: 0.9 }} transition={PRESS_SPRING} data-dock-tab="menu">
          <Dialog.Trigger asChild>
            <button type="button" className={styles.tab} data-mobile-menu-trigger="" data-open={menuOpen || menuActive ? '' : undefined} aria-label={t('menu')} aria-controls="mobile-pages-menu">
              <m.span animate={{ rotate: menuOpen ? 90 : 0 }} transition={reduced ? { duration: 0 } : PRESS_SPRING} style={{ display: 'flex' }}>
                {menuOpen ? <X aria-hidden="true" strokeWidth={1.9} /> : <Ellipsis aria-hidden="true" strokeWidth={3} />}
              </m.span>
              <span>{t('menu')}</span>
            </button>
          </Dialog.Trigger>
        </m.span>
      </nav>
    </m.div>
  )
}

/** Meniu: the pages that are not in the bar, as a panel above it. */
function DockMenu({ pathname, onNavigate }: { pathname: string; onNavigate: () => void }) {
  const t = useTranslations('nav')
  const reduced = Boolean(useReducedMotion())
  return (
    <Dialog.Portal>
      <Dialog.Overlay className={styles.scrim} />
      <Dialog.Content id="mobile-pages-menu" aria-describedby={undefined} className={`${theme.surface} ${styles.menu}`} data-reference-surface="" data-mobile-menu-dialog="" asChild>
        <m.section
          initial={reduced ? false : { opacity: 0, y: 28, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={reduced ? { duration: 0 } : { type: 'spring', stiffness: 320, damping: 30, mass: 0.9 }}
        >
          <div className={styles.menuHead}>
            <Dialog.Title asChild>
              <h2>{t('menu')}</h2>
            </Dialog.Title>
            <Dialog.Close asChild>
              <button type="button" className={styles.menuClose} aria-label={t('closeMenu')} data-mobile-menu-close="">
                <X aria-hidden="true" />
              </button>
            </Dialog.Close>
          </div>
          <div className={styles.menuGrid}>
            {menuItems.map((item, index) => (
              <MenuLink key={item.href} index={index} reduced={reduced}>
                <Link href={item.href} className={styles.menuItem} aria-current={isDashboardRouteActive(pathname, item.href) ? 'page' : undefined} onClick={onNavigate}>
                  <MenuIcon name={item.key} />
                  {t(item.key)}
                </Link>
              </MenuLink>
            ))}
          </div>
        </m.section>
      </Dialog.Content>
    </Dialog.Portal>
  )
}

function MenuIcon({ name }: { name: string }) {
  const Icon = menuIcons[name] ?? FilePenLine
  return <Icon aria-hidden="true" strokeWidth={1.8} />
}

/** Staggered fade + lift of the menu tiles. */
function MenuLink({ index, reduced, children }: { index: number; reduced: boolean; children: ReactNode }) {
  return (
    <m.div
      initial={reduced ? false : { opacity: 0, y: 7 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: reduced ? 0 : Math.min(index, 10) * 0.04, duration: reduced ? 0 : 0.32, ease: [0.2, 0, 0, 1] }}
    >
      {children}
    </m.div>
  )
}
