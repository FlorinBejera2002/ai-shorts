import {
  buildLocaleMetadata,
  getLocaleConfig,
  localePath,
  SUPPORTED_LOCALES,
  type SiteLocale
} from '@/lib/site-config'
import { useEffect, useLayoutEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { documents } from './legal-documents'

const PRIVATE_PREFIXES = [
  '/dashboard',
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
  '/activate'
]

const ROUTE_COPY: Record<
  SiteLocale,
  {
    pricingTitle: string
    pricingDescription: string
    privacyTitle: string
    termsTitle: string
    dataDeletionTitle: string
  }
> = {
  en: {
    pricingTitle: 'Sneep Cut pricing',
    pricingDescription:
      'Compare Sneep Cut plans and choose the processing capacity that fits your video workflow.',
    privacyTitle: 'Sneep Cut Privacy Policy',
    termsTitle: 'Sneep Cut Terms of Service',
    dataDeletionTitle: 'Data deletion — Sneep Cut'
  },
  ro: {
    pricingTitle: 'Prețuri Sneep Cut',
    pricingDescription:
      'Compară planurile Sneep Cut și alege volumul de procesare potrivit pentru fluxul tău video.',
    privacyTitle: 'Politica de confidențialitate Sneep Cut',
    termsTitle: 'Termeni și condiții Sneep Cut',
    dataDeletionTitle: 'Ștergerea datelor — Sneep Cut'
  },
  es: {
    pricingTitle: 'Precios de Sneep Cut',
    pricingDescription:
      'Compara los planes de Sneep Cut y elige la capacidad de procesamiento que encaje con tu flujo de trabajo de video.',
    privacyTitle: 'Política de privacidad de Sneep Cut',
    termsTitle: 'Términos de servicio de Sneep Cut',
    dataDeletionTitle: 'Eliminación de datos — Sneep Cut'
  }
}

function routeMetadata(locale: SiteLocale, pathname: string) {
  const route = pathname.replace(/^\/(ro|es)(?=\/|$)/, '') || '/'
  const routeCopy = ROUTE_COPY[locale]
  const legalPage = route.slice(1)
  if (Object.hasOwn(documents, legalPage)) {
    const copy = documents[legalPage as keyof typeof documents][locale]
    return buildLocaleMetadata(locale, {
      path: route,
      title: `${copy.title} — Sneep Cut`,
      description: copy.intro
    })
  }
  if (route === '/pricing') {
    return buildLocaleMetadata(locale, {
      path: '/pricing',
      title: routeCopy.pricingTitle,
      description: routeCopy.pricingDescription
    })
  }
  if (route === '/privacy') {
    return buildLocaleMetadata(locale, { path: '/privacy', title: routeCopy.privacyTitle })
  }
  if (route === '/terms') {
    return buildLocaleMetadata(locale, { path: '/terms', title: routeCopy.termsTitle })
  }
  if (route === '/data-deletion') {
    return buildLocaleMetadata(locale, {
      path: '/data-deletion',
      title: routeCopy.dataDeletionTitle
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

/** Emits one hreflang alternate per supported locale plus x-default for the current route. */
function setAlternates(route: string, baseUrl: string) {
  document.head
    .querySelectorAll('link[rel="alternate"][data-route-alternate]')
    .forEach((element) => element.remove())
  const alternates: Array<[string, string]> = [
    ...SUPPORTED_LOCALES.map((locale): [string, string] => [locale, localePath(locale, route)]),
    ['x-default', localePath('en', route)]
  ]
  for (const [hreflang, path] of alternates) {
    const element = document.createElement('link')
    element.rel = 'alternate'
    element.hreflang = hreflang
    element.href = new URL(path, baseUrl).toString()
    element.dataset.routeAlternate = ''
    document.head.append(element)
  }
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
    const route = location.pathname.replace(/^\/(ro|es)(?=\/|$)/, '') || '/'
    const metadata = routeMetadata(locale, location.pathname)
    const title = typeof metadata.title === 'string' ? metadata.title : getLocaleConfig(locale).title
    const description = metadata.description ?? getLocaleConfig(locale).description
    const baseUrl = import.meta.env.VITE_APP_URL || window.location.origin
    const canonical = new URL(localePath(locale, route), baseUrl).toString()
    const isPrivate = PRIVATE_PREFIXES.some(
      (prefix) => route === prefix || route.startsWith(`${prefix}/`)
    )

    document.documentElement.lang = getLocaleConfig(locale).languageTag
    document.title = title
    setMeta('description', description)
    setMeta('robots', isPrivate ? 'noindex, nofollow, noarchive' : 'index, follow')
    setCanonical(canonical)
    setAlternates(route, baseUrl)
  }, [locale, location.pathname])

  return null
}
