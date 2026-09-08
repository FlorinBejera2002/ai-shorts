'use client'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle
} from '@/components/ui/dialog'
import { Link } from '@/i18n/navigation'
import { dashboardNavigation } from '@/lib/dashboard-navigation'
import { ArrowUpRight, Search, X } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'

export function WorkspaceSearch() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const t = useTranslations('nav')
  const ro = useLocale() === 'ro'
  const label = ro ? 'Navigare rapidă' : 'Quick navigation'
  const items = [
    { href: '/dashboard/create', key: 'newProject' },
    ...dashboardNavigation.flatMap((group) => [...group.items])
  ]
  const results = items.filter((item) =>
    t(item.key).toLocaleLowerCase().includes(query.toLocaleLowerCase().trim())
  )
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setOpen((value) => !value)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  function changeOpen(value: boolean) {
    setOpen(value)
    if (!value) setQuery('')
  }
  return (
    <>
      <button
        type="button"
        className="studio-search-trigger"
        aria-label={label}
        aria-keyshortcuts="Control+k Meta+k"
        onClick={() => changeOpen(true)}
      >
        <Search className="size-3.5" />
        <span className="hidden md:inline">{label}</span>
        <kbd className="hidden md:inline">Ctrl K</kbd>
      </button>
      <Dialog open={open} onOpenChange={changeOpen}>
        <DialogContent className="studio-command gap-0 p-0">
          <DialogTitle className="sr-only">{label}</DialogTitle>
          <DialogDescription className="sr-only">
            {ro
              ? 'Caută o pagină. Folosește Tab și Enter pentru a naviga.'
              : 'Find a page. Use Tab and Enter to navigate.'}
          </DialogDescription>
          <div className="flex items-center gap-3 border-b px-5 py-4">
            <Search className="size-4 shrink-0 text-muted-foreground" />
            <input
              aria-label={label}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={
                ro ? 'Unde vrei să mergi?' : 'Where would you like to go?'
              }
              className="min-w-0 flex-1 border-0 bg-transparent text-sm outline-none"
            />
            <button
              type="button"
              aria-label={ro ? 'Închide' : 'Close'}
              onClick={() => changeOpen(false)}
              className="rounded p-1 text-muted-foreground hover:bg-muted"
            >
              <X className="size-4" />
            </button>
          </div>
          <div className="max-h-80 overflow-y-auto p-2">
            {results.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => changeOpen(false)}
                className="flex items-center justify-between rounded-md px-3 py-3 text-sm hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
              >
                <span>{t(item.key)}</span>
                <ArrowUpRight className="size-3.5 text-muted-foreground" />
              </Link>
            ))}
            {!results.length && (
              <p
                role="status"
                className="px-3 py-8 text-center text-sm text-muted-foreground"
              >
                {ro ? 'Nicio pagină găsită.' : 'No pages found.'}
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
