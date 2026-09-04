import { ThemeProvider } from '@/components/shared/theme-provider'
import { Toaster } from '@/components/ui/toast'
import { routing } from '@/i18n/navigation'
import {
  type SiteLocale,
  buildLocaleMetadata,
  getLocaleConfig
} from '@/lib/site-config'
import type { Metadata } from 'next'
import { NextIntlClientProvider } from 'next-intl'
import { getMessages, setRequestLocale } from 'next-intl/server'
import { Bodoni_Moda, Manrope, Sora } from 'next/font/google'
import { notFound } from 'next/navigation'
import '../globals.css'

const sora = Sora({
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
  weight: ['400', '500', '600', '700', '800']
})

const manropeBody = Manrope({
  subsets: ['latin'],
  variable: '--font-body',
  display: 'swap'
})

const bodoni = Bodoni_Moda({
  subsets: ['latin', 'latin-ext'],
  variable: '--font-cinematic',
  display: 'swap'
})

const manrope = Manrope({
  subsets: ['latin', 'latin-ext'],
  variable: '--font-studio',
  display: 'swap'
})

export async function generateMetadata({
  params
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale: requestedLocale } = await params
  const locale: SiteLocale = requestedLocale === 'ro' ? 'ro' : 'en'
  const config = getLocaleConfig(locale)

  return {
    ...buildLocaleMetadata(locale),
    title: {
      default: config.title,
      template: '%s · Sneepcut'
    },
    keywords: [
      'AI video clipping',
      'short-form video',
      'video repurposing',
      'automatic subtitles'
    ],
    category: 'technology',
    manifest: '/site.webmanifest',
    icons: {
      icon: [
        { url: '/favicon.ico', sizes: 'any' },
        { url: '/logo-icon.svg', type: 'image/svg+xml' },
        { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
        { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
        { url: '/favicon-192x192.png', sizes: '192x192', type: 'image/png' },
        { url: '/favicon-512x512.png', sizes: '512x512', type: 'image/png' }
      ],
      shortcut: '/favicon.ico',
      apple: '/apple-touch-icon.png'
    }
  }
}

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }))
}

export default async function LocaleLayout({
  children,
  params
}: {
  children: React.ReactNode
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  if (!(routing.locales as readonly string[]).includes(locale)) {
    notFound()
  }
  setRequestLocale(locale)
  const messages = await getMessages()

  return (
    <html
      lang={getLocaleConfig(locale as SiteLocale).languageTag}
      suppressHydrationWarning={true}
      className={`${sora.variable} ${manropeBody.variable} ${bodoni.variable} ${manrope.variable}`}
    >
      <body className="font-body antialiased">
        <ThemeProvider>
          <NextIntlClientProvider messages={messages}>
            {children}
            <Toaster />
          </NextIntlClientProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
