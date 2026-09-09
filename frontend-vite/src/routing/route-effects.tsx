import {
  buildLocaleMetadata,
  getLocaleConfig,
  localePath,
  type SiteLocale
} from '@/lib/site-config'
import { useEffect, useLayoutEffect } from 'react'
import { useLocation } from 'react-router-dom'

const PRIVATE_PREFIXES = [
  '/dashboard',
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
  '/activate'
]

function routeMetadata(locale: SiteLocale, pathname: string) {
  const route = pathname.replace(/^\/ro(?=\/|$)/, '') || '/'
  if (route === '/pricing') {
    return buildLocaleMetadata(locale, {
      path: '/pricing',
      title: locale === 'ro' ? 'Prețuri Sneepcut' : 'Sneepcut pricing',
      description:
        locale === 'ro'
          ? 'Compară planurile Sneepcut și alege volumul de procesare potrivit pentru fluxul tău video.'
          : 'Compare Sneepcut plans and choose the processing capacity that fits your video workflow.'
    })
  }
  if (route === '/privacy') {
    return buildLocaleMetadata(locale, {
      path: '/privacy',
      title:
        locale === 'ro'
          ? 'Politica de confidențialitate Sneepcut'
          : 'Sneepcut Privacy Policy'
    })
  }
  if (route === '/terms') {
    return buildLocaleMetadata(locale, {
      path: '/terms',
      title:
        locale === 'ro'
          ? 'Termeni și condiții Sneepcut'
          : 'Sneepcut Terms of Service'
    })
  }
  if (route === '/data-deletion') {
    return buildLocaleMetadata(locale, {
      path: '/data-deletion',
      title:
        locale === 'ro'
          ? 'Ștergerea datelor — Sneep Cut'
          : 'Data deletion — Sneep Cut'
    })
  }
  return buildLocaleMetadata(locale)
}

function setMeta(name: string, content: string) {
  let element = document.head.querySelector<HTMLMetaElement>(
    `meta[name="${name}"]`
  )
  if (!element) {
    element = document.createElement('meta')
    element.name = name
    document.head.append(element)
  }
  element.content = content
}

function setCanonical(href: string) {
  let element = document.head.querySelector<HTMLLinkElement>(
    'link[rel="canonical"]'
  )
  if (!element) {
    element = document.createElement('link')
    element.rel = 'canonical'
    document.head.append(element)
  }
  element.href = href
}

export function RouteEffects({ locale }: { locale: SiteLocale }) {
  const location = useLocation()

  useLayoutEffect(() => {
    if (location.hash) {
      document.getElementById(location.hash.slice(1))?.scrollIntoView()
    } else {
      window.scrollTo({ top: 0, left: 0 })
    }
  }, [location.pathname, location.hash])

  useEffect(() => {
    const route = location.pathname.replace(/^\/ro(?=\/|$)/, '') || '/'
    const metadata = routeMetadata(locale, location.pathname)
    const title = typeof metadata.title === 'string' ? metadata.title : getLocaleConfig(locale).title
    const description = metadata.description ?? getLocaleConfig(locale).description
    const canonical = new URL(
      localePath(locale, route),
      import.meta.env.VITE_APP_URL || window.location.origin
    ).toString()
    const isPrivate = PRIVATE_PREFIXES.some(
      (prefix) => route === prefix || route.startsWith(`${prefix}/`)
    )

    document.documentElement.lang = getLocaleConfig(locale).languageTag
    document.title = title
    setMeta('description', description)
    setMeta('robots', isPrivate ? 'noindex, nofollow, noarchive' : 'index, follow')
    setCanonical(canonical)
  }, [locale, location.pathname])

  return null
}
