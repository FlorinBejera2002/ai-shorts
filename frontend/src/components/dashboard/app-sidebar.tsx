'use client'

import { useAuth } from '@/components/auth/use-auth'
import { BrandLogo } from '@/components/shared/brand-logo'
import { ProfileAvatar } from '@/components/shared/profile-avatar'
import { SignOutAction } from '@/components/shared/sign-out-action'
import { Button } from '@/components/ui/button'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar
} from '@/components/ui/sidebar'
import { Link, usePathname } from '@/i18n/navigation'
import {
  dashboardNavigation,
  isDashboardRouteActive
} from '@/lib/dashboard-navigation'
import { motion, useReducedMotion } from 'framer-motion'
import {
  ArrowUpRight,
  CalendarDays,
  CreditCard,
  FileText,
  Film,
  FolderOpen,
  LayoutDashboard,
  Palette,
  Plus,
  Scissors,
  Settings,
  Share2,
  X
} from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useEffect, useRef, useState } from 'react'
import styles from './app-sidebar.module.css'

const RAIL_CORNER = 6
const DASH_PATTERN =
  'repeating-linear-gradient(to top, transparent 0 2px, currentColor 2px 4px)'

const icons = {
  home: LayoutDashboard,
  editor: Scissors,
  clips: Film,
  history: FolderOpen,
  calendar: CalendarDays,
  publish: Share2,
  scripts: FileText,
  settings: Settings,
  brand: Palette,
  billing: CreditCard
}
const menuClass = styles.navItem

function NavigationRail({
  from = 0,
  y,
  visible,
  active = false
}: {
  from?: number
  y: number | null
  visible: boolean
  active?: boolean
}) {
  const reducedMotion = useReducedMotion()
  const travel = reducedMotion
    ? { duration: 0 }
    : { type: 'spring' as const, stiffness: 420, damping: 34, mass: 0.7 }

  return (
    <motion.li
      aria-hidden={true}
      initial={false}
      animate={{ opacity: visible && y !== null ? 1 : 0 }}
      transition={reducedMotion ? { duration: 0 } : { duration: 0.2 }}
      className={`${styles.railLayer} ${active ? styles.activeRail : styles.hoverRail}`}
    >
      <motion.span
        initial={false}
        animate={{
          top: from,
          height: Math.max(0, (y ?? 0) - RAIL_CORNER - from)
        }}
        transition={travel}
        style={{ backgroundImage: DASH_PATTERN }}
        className={styles.railLine}
      />
      <motion.svg
        initial={false}
        animate={{ top: (y ?? 0) - RAIL_CORNER }}
        transition={travel}
        width="12"
        height="7"
        viewBox="0 0 12 7"
        fill="none"
        className={styles.railCorner}
      >
        <path
          d="M0.5 0a6 6 0 0 0 6 6H12"
          stroke="currentColor"
          strokeDasharray="2 2"
        />
      </motion.svg>
    </motion.li>
  )
}

function NavigationGroup({
  group,
  pathname,
  onNavigate
}: {
  group: (typeof dashboardNavigation)[number]
  pathname: string
  onNavigate: () => void
}) {
  const t = useTranslations('nav')
  const listRef = useRef<HTMLUListElement>(null)
  const itemRefs = useRef<(HTMLLIElement | null)[]>([])
  const [centers, setCenters] = useState<number[]>([])
  const [hoverIndex, setHoverIndex] = useState<number | null>(null)
  const [pointerInside, setPointerInside] = useState(false)
  const [focusInside, setFocusInside] = useState(false)
  const activeIndex = group.items.findIndex((item) =>
    isDashboardRouteActive(pathname, item.href)
  )

  useEffect(() => {
    const list = listRef.current
    if (!list) return

    const measure = () =>
      setCenters(
        itemRefs.current.map((element) =>
          element ? element.offsetTop + element.offsetHeight / 2 : 0
        )
      )

    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(list)
    return () => observer.disconnect()
  }, [])

  const activeY = activeIndex < 0 ? null : (centers[activeIndex] ?? null)
  const hoverY = hoverIndex === null ? null : (centers[hoverIndex] ?? null)
  const hoverFrom =
    activeY !== null && hoverY !== null && hoverY <= activeY
      ? Math.max(0, hoverY - RAIL_CORNER)
      : (activeY ?? 0)

  return (
    <SidebarGroup
      className={`${styles.group} group-data-[collapsible=icon]:px-4`}
    >
      <SidebarGroupLabel className={styles.groupLabel}>
        {t(group.labelKey)}
      </SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu
          ref={listRef}
          className={styles.navigationRail}
          onMouseLeave={() => setPointerInside(false)}
        >
          <NavigationRail
            from={hoverFrom}
            y={hoverY}
            visible={
              (pointerInside || focusInside) && hoverIndex !== activeIndex
            }
          />
          <NavigationRail
            y={activeY}
            visible={activeY !== null}
            active={true}
          />

          {group.items.map((item, itemIndex) => {
            const Icon = icons[item.key]
            const active = itemIndex === activeIndex
            return (
              <SidebarMenuItem
                key={item.href}
                ref={(element) => {
                  itemRefs.current[itemIndex] = element
                }}
                onMouseEnter={() => {
                  setHoverIndex(itemIndex)
                  setPointerInside(true)
                }}
                onFocus={() => {
                  setHoverIndex(itemIndex)
                  setFocusInside(true)
                }}
                onBlur={() => setFocusInside(false)}
              >
                <SidebarMenuButton
                  asChild={true}
                  isActive={active}
                  tooltip={t(item.key)}
                  className={menuClass}
                >
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    prefetch={false}
                    aria-label={t(item.key)}
                    aria-current={active ? 'page' : undefined}
                  >
                    <span className={styles.navIcon}>
                      <Icon strokeWidth={1.75} />
                    </span>
                    <span className={styles.navLabel}>{t(item.key)}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            )
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}

function SidebarProfile() {
  const { user } = useAuth()
  const t = useTranslations('nav')
  return (
    <div className={styles.profileRow}>
      <ProfileAvatar name={user?.name} src={user?.profile_pic} />
      <span
        className={styles.profileName}
        title={user?.name?.trim() || t('workspace')}
      >
        {user?.name?.trim() || t('workspace')}
      </span>
      <SignOutAction iconOnly={true} />
    </div>
  )
}

export function AppSidebar() {
  const pathname = usePathname()
  const locale = useLocale()
  const t = useTranslations('nav')
  const { state, isMobile, setOpenMobile } = useSidebar()
  const compact = state === 'collapsed' && !isMobile
  useEffect(() => {
    if (pathname && locale) setOpenMobile(false)
  }, [pathname, locale, setOpenMobile])
  const close = () => setOpenMobile(false)

  return (
    <Sidebar
      collapsible="icon"
      mobileTitle={t('mobileNavigation')}
      mobileDescription={t('navigationDescription')}
    >
      <SidebarHeader
        className={`${styles.header} group-data-[collapsible=icon]:px-2`}
      >
        <div className="flex min-h-10 items-center justify-between gap-2">
          <Link
            href="/dashboard"
            onClick={close}
            aria-label="Sneepcut"
            className="rounded-lg focus-visible:outline-2 focus-visible:outline-ring"
          >
            {compact ? (
              <BrandLogo compact={true} className="size-10" />
            ) : (
              <>
                <BrandLogo className="h-10 dark:hidden" />
                <span className="hidden dark:inline-flex">
                  <BrandLogo variant="white-text" className="h-10" />
                </span>
              </>
            )}
          </Link>
          {isMobile && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={close}
              aria-label={t('closeMenu')}
            >
              <X className="size-5" />
            </Button>
          )}
        </div>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild={true}
              tooltip={t('newProject')}
              className={`${styles.create} group-data-[collapsible=icon]:mx-auto group-data-[collapsible=icon]:[&>span]:hidden`}
            >
              <Link
                href="/dashboard/create"
                onClick={close}
                prefetch={false}
                aria-label={t('newProject')}
                aria-current={
                  isDashboardRouteActive(pathname, '/dashboard/create')
                    ? 'page'
                    : undefined
                }
              >
                <Plus className="size-4" />
                <span>{t('newProject')}</span>
                <ArrowUpRight
                  className={styles.createArrow}
                  aria-hidden="true"
                />
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent className={styles.content}>
        <nav id="dashboard-navigation" aria-label={t('mobileNavigation')}>
          {dashboardNavigation.map((group) => (
            <NavigationGroup
              key={group.labelKey}
              group={group}
              pathname={pathname}
              onNavigate={close}
            />
          ))}
        </nav>
      </SidebarContent>
      <SidebarFooter
        className={`${styles.footer} group-data-[collapsible=icon]:p-4`}
      >
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarProfile />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}
