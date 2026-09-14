'use client'

import {
  Bell,
  CircleUserRound,
  Globe2,
  KeyRound,
  Link2,
  ShieldCheck,
  SlidersHorizontal
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'

const sections = [
  { id: 'account-title', label: 'overview', icon: CircleUserRound },
  { id: 'profile-title', label: 'profileTitle', icon: SlidersHorizontal },
  { id: 'security-title', label: 'securityTitle', icon: KeyRound },
  { id: 'connections-title', label: 'connections', icon: Link2 },
  { id: 'notifications-title', label: 'notifications', icon: Bell },
  { id: 'preferences-title', label: 'preferences', icon: Globe2 },
  { id: 'privacy-title', label: 'dataPrivacy', icon: ShieldCheck }
] as const

type SectionId = (typeof sections)[number]['id']

function isSectionId(value: string): value is SectionId {
  return sections.some(({ id }) => id === value)
}

export function SettingsNavigation() {
  const t = useTranslations('settings')
  const [activeId, setActiveId] = useState<SectionId>(sections[0].id)

  useEffect(() => {
    const fromHash = window.location.hash.slice(1)
    if (isSectionId(fromHash)) setActiveId(fromHash)

    const observed = sections
      .map(({ id }) => document.getElementById(id)?.closest('section'))
      .filter((section): section is HTMLElement => Boolean(section))
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0]
        const heading = visible?.target.querySelector<HTMLElement>('[id]')
        if (heading && isSectionId(heading.id)) setActiveId(heading.id)
      },
      { rootMargin: '-12% 0px -72% 0px', threshold: [0, 0.25, 0.6] }
    )
    for (const section of observed) observer.observe(section)
    return () => observer.disconnect()
  }, [])

  return (
    <nav
      aria-label={t('sectionNav')}
      className="sticky top-16 z-20 flex min-w-0 gap-1 overflow-x-auto rounded-md border border-border bg-card p-1.5 lg:top-24 lg:flex-col"
    >
      {sections.map(({ id, label, icon: Icon }) => {
        const active = activeId === id
        return (
          <a
            key={id}
            href={`#${id}`}
            aria-current={active ? 'location' : undefined}
            onClick={() => setActiveId(id)}
            className={`flex min-h-10 shrink-0 items-center gap-2.5 rounded-sm px-3 text-xs font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary/50 lg:w-full ${
              active
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
          >
            <Icon className="size-4 shrink-0" aria-hidden="true" />
            <span>{t(label)}</span>
          </a>
        )
      })}
    </nav>
  )
}
