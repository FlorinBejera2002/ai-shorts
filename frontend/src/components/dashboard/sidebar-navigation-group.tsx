'use client'

import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem
} from '@/components/ui/sidebar'
import { Link } from '@/i18n/navigation'
import {
  type dashboardNavigation,
  isDashboardRouteActive
} from '@/lib/dashboard-navigation'
import { LazyMotion, domAnimation, m, useReducedMotion } from 'framer-motion'
import {
  CreditCard,
  FilePenLine,
  Film,
  House,
  Palette,
  Scissors,
  Share2,
  SlidersHorizontal,
  type LucideIcon
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useLayoutEffect, useRef, useState } from 'react'
import styles from './app-sidebar.module.css'

type NavigationGroupConfig = (typeof dashboardNavigation)[number]
type NavigationKey = NavigationGroupConfig['items'][number]['key']

/** Icons appear only in the collapsed rail; they match the mobile dock. */
const icons: Record<NavigationKey, LucideIcon> = {
  home: House,
  editor: Scissors,
  scripts: FilePenLine,
  clips: Film,
  publish: Share2,
  brand: Palette,
  billing: CreditCard,
  settings: SlidersHorizontal
}
/** The expanded sidebar has room for the full billing title. */
const labelKeys: Partial<Record<NavigationKey, 'billingFull'>> = {
  billing: 'billingFull'
}

const RAIL_CORNER = 6
const DASH_PATTERN =
  'repeating-linear-gradient(to top, transparent 0 2px, currentColor 2px 4px)'
const RAIL_SPRING = {
  type: 'spring' as const,
  stiffness: 420,
  damping: 34,
  mass: 0.7
}

/**
 * Dashed tree connector from `from` down to the centre of one item. Only transforms and
 * opacity animate: the list-tall line slides on `y` so its bottom meets the corner, and a
 * static clip hides the part above `from`.
 */
function TreeConnector({
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
  const travel = reducedMotion ? { duration: 0 } : RAIL_SPRING
  const end = (y ?? 0) - RAIL_CORNER

  return (
    <m.li
      aria-hidden={true}
      initial={false}
      animate={{ opacity: visible && y !== null ? 1 : 0 }}
      transition={reducedMotion ? { duration: 0 } : { duration: 0.2 }}
      className={`${styles.rail} ${active ? styles.activeRail : styles.hoverRail}`}
      data-sidebar-rail={active ? 'active' : 'hover'}
    >
      <span
        className={styles.railTrack}
        style={{ clipPath: `inset(${Math.max(0, from)}px 0 0 0)` }}
      >
        <m.span
          initial={false}
          animate={{ y: end }}
          transition={travel}
          style={{ backgroundImage: DASH_PATTERN }}
          className={styles.railLine}
          data-sidebar-rail-line=""
        />
      </span>
      <m.svg
        initial={false}
        animate={{ y: end }}
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
      </m.svg>
    </m.li>
  )
}

/** Measures the vertical centre of each item so the connector can reach it. */
function useItemCentres(count: number) {
  const listRef = useRef<HTMLUListElement>(null)
  const itemRefs = useRef<(HTMLLIElement | null)[]>([])
  const [centres, setCentres] = useState<number[]>([])

  useLayoutEffect(() => {
    const list = listRef.current
    if (!list) return
    const measure = () =>
      setCentres(
        itemRefs.current
          .slice(0, count)
          .map((item) => (item ? item.offsetTop + item.offsetHeight / 2 : 0))
      )
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(list)
    return () => observer.disconnect()
  }, [count])

  return { listRef, itemRefs, centres }
}

export function SidebarNavigationGroup({
  group,
  pathname,
  onNavigate
}: {
  group: NavigationGroupConfig
  pathname: string
  onNavigate: () => void
}) {
  const t = useTranslations('nav')
  const { listRef, itemRefs, centres } = useItemCentres(group.items.length)
  const [hoverIndex, setHoverIndex] = useState<number | null>(null)
  const [pointerInside, setPointerInside] = useState(false)
  const [focusInside, setFocusInside] = useState(false)
  const activeIndex = group.items.findIndex((item) =>
    isDashboardRouteActive(pathname, item.href)
  )

  const activeY = activeIndex < 0 ? null : (centres[activeIndex] ?? null)
  const hoverY = hoverIndex === null ? null : (centres[hoverIndex] ?? null)
  const hoverFrom =
    activeY !== null && hoverY !== null && hoverY <= activeY
      ? Math.max(0, hoverY - RAIL_CORNER)
      : (activeY ?? 0)

  return (
    <SidebarGroup className={styles.group}>
      <SidebarGroupLabel className={styles.groupLabel}>
        {t(group.labelKey)}
      </SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu
          ref={listRef}
          className={styles.list}
          onMouseLeave={() => setPointerInside(false)}
        >
          <LazyMotion features={domAnimation} strict={true}>
            <TreeConnector
              from={hoverFrom}
              y={hoverY}
              visible={
                (pointerInside || focusInside) && hoverIndex !== activeIndex
              }
            />
            <TreeConnector
              y={activeY}
              visible={activeY !== null}
              active={true}
            />
          </LazyMotion>

          {group.items.map((item, index) => {
            const Icon = icons[item.key]
            const label = t(labelKeys[item.key] ?? item.key)
            const active = index === activeIndex
            return (
              <SidebarMenuItem
                key={item.href}
                ref={(element) => {
                  itemRefs.current[index] = element
                }}
                onMouseEnter={() => {
                  setHoverIndex(index)
                  setPointerInside(true)
                }}
                onFocus={() => {
                  setHoverIndex(index)
                  setFocusInside(true)
                }}
                onBlur={() => setFocusInside(false)}
              >
                <SidebarMenuButton
                  asChild={true}
                  isActive={active}
                  tooltip={label}
                  className={styles.item}
                >
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    prefetch={false}
                    aria-label={label}
                    aria-current={active ? 'page' : undefined}
                    data-sidebar-link={item.key}
                  >
                    <Icon
                      aria-hidden="true"
                      strokeWidth={1.75}
                      className={styles.itemIcon}
                    />
                    <span className={styles.itemLabel}>{label}</span>
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
