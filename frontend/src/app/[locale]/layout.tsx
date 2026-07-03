import { ThemeProvider } from '@/components/shared/theme-provider'
import { Toaster } from '@/components/ui/toast'
import { routing } from '@/i18n/navigation'
import type { Metadata } from 'next'
import { NextIntlClientProvider } from 'next-intl'
import { getMessages, setRequestLocale } from 'next-intl/server'
import { notFound } from 'next/navigation'
import '../globals.css'

export const metadata: Metadata = {
  title: {
    default: 'ClipForge — AI Video Clipping',
    template: '%s · ClipForge'
  },
  description:
    'Turn long videos into viral clips with AI. Upload, analyze, and generate ready-to-post short-form content.',
  openGraph: {
    title: 'ClipForge — AI Video Clipping',
    description:
      'Turn long videos into viral clips with AI. Upload, analyze, and generate ready-to-post short-form content.',
    siteName: 'ClipForge',
    type: 'website'
  }
}

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }))
}

export default async function RootLayout({
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
    <html lang={locale} suppressHydrationWarning={true}>
      <body>
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
